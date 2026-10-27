/**
 * The systems of a task session (/bench/tasks), behind `TaskSystemAdapter`:
 * Chrome's built-in Summarizer, Translator and Language Detector, and the
 * on-device fallbacks (Transformers.js DistilBART-CNN and Opus-MT at q8 or
 * fp32 with an explicit device; MediaPipe's language detector on the CPU
 * delegate with the pinned tasks-text WASM path). Providers load through
 * dynamic import() only when a session runs, so nothing downloads on page
 * load.
 *
 * Built-in systems record `availability()` before the session touches the
 * API, at `create()` and after the cell, `inputQuota`, `measureInputUsage()`
 * per item, and the `downloadprogress` events of a download `create()`
 * started. Summaries and translations are streamed and stamped per chunk
 * (`performance.now()` at receipt); a stream whose chunks each repeat the
 * previous one is reported as cumulative and converted by the runner.
 *
 * Fallback model files are pinned: every Hugging Face request for a pinned
 * repository is rewritten from `main` to the pinned revision (Transformers.js
 * `env.fetch`), a request for an unpinned repository is refused, and after
 * the load each file the pipeline uses is hashed (from the response the page
 * fetched, or from the browser cache it was served from) and compared with
 * its pinned SHA-256; a mismatch makes the cell an error cell.
 */
import type {
  LoadedTaskSystem,
  TaskDetectCandidate,
  TaskItem,
  TaskItemOutput,
  TaskPlannedCell,
  TaskSystemAdapter,
} from '@localmode/bench';
import { PINNED_FALLBACK_MODELS, PINNED_MEDIAPIPE_LANGUAGE_DETECTOR, type PinnedFile } from './task-model-pins';
import type { PlannedTaskCell } from './tasks';

/**
 * The profile folders that hold each built-in model: the Translator's
 * language packs, Gemini Nano (the Summarizer's model), and the
 * optimization-guide model store that holds the language detection model.
 * A download's bytes are measured on these folders only.
 */
export const MODEL_FOLDERS = {
  Translator: ['TranslateKit'],
  Summarizer: ['OptGuideOnDeviceModel'],
  LanguageDetector: ['optimization_guide_model_store'],
} as const;

/** Deadline for one `availability()` call (some builds never settle it). */
const AVAILABILITY_TIMEOUT_MS = 3_000;

/** Target-language tokens of the multi-target Opus-MT models, prepended to every input. */
export const OPUS_TARGET_TOKENS: Readonly<Record<string, string>> = {
  'Xenova/opus-mt-en-zh': '>>cmn_Hans<<',
  'Xenova/opus-mt-en-ar': '>>ara<<',
};

/** Summarizer options of record per item set, and Chrome's own defaults for the `-default` arm. */
export const SUMMARIZER_OPTIONS = {
  'cnndm-test': { type: 'tldr', length: 'medium', format: 'plain-text', expectedInputLanguages: ['en'], outputLanguage: 'en' },
  'xsum-test': { type: 'tldr', length: 'short', format: 'plain-text', expectedInputLanguages: ['en'], outputLanguage: 'en' },
} as const;

/** DistilBART generation bounds of the summarize block's medium preset (max_length / min_length). */
export const DISTILBART_LENGTH = { maxLength: 130, minLength: 50 } as const;

// --- Chrome globals (structural; absent outside Chrome) ----------------------

interface ChromeMonitorTarget {
  addEventListener(type: 'downloadprogress', cb: (e: Event & { loaded?: number; total?: number }) => void): void;
}
interface ChromeStreamingSession {
  inputQuota?: number;
  measureInputUsage?(input: string, options?: { signal?: AbortSignal }): Promise<number>;
  destroy(): void;
}
interface ChromeSummarizerSession extends ChromeStreamingSession {
  summarizeStreaming(input: string, options?: { signal?: AbortSignal }): ReadableStream<string>;
  type?: string;
  length?: string;
  format?: string;
}
interface ChromeDetectorSession extends ChromeStreamingSession {
  detect(input: string, options?: { signal?: AbortSignal }): Promise<Array<{ detectedLanguage: string; confidence: number }>>;
}
interface ChromeFactory<S> {
  availability(options?: Record<string, unknown>): Promise<string>;
  create(options?: Record<string, unknown>): Promise<S>;
}

function chromeGlobal<S>(name: 'Summarizer' | 'Translator' | 'LanguageDetector'): ChromeFactory<S> | undefined {
  return (globalThis as unknown as Record<string, ChromeFactory<S> | undefined>)[name];
}

/** `availability()` raced against a deadline: `timeout` when it never answers, `unsupported` without the API. */
export async function chromeAvailability(name: 'Summarizer' | 'Translator' | 'LanguageDetector', options?: Record<string, unknown>): Promise<string> {
  const factory = chromeGlobal(name);
  if (!factory || typeof factory.availability !== 'function') return 'unsupported';
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      factory.availability(options),
      new Promise<string>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), AVAILABILITY_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Collects `downloadprogress` events of one `create()` and forwards them as
 * load progress. Chrome also emits them (0 then 1) while it loads a model
 * that is already on disk, so they count as a download only when
 * `availability()` read `downloadable` or `downloading` at `create()`.
 */
function downloadMonitor(onProgress?: (pct: number | undefined) => void) {
  const events: Array<{ t: number; loaded: number; total: number }> = [];
  return {
    events,
    monitor(target: ChromeMonitorTarget) {
      target.addEventListener('downloadprogress', (e) => {
        events.push({ t: performance.now(), loaded: e.loaded ?? 0, total: e.total ?? 0 });
        if (onProgress && typeof e.loaded === 'number' && typeof e.total === 'number' && e.total > 0) onProgress((e.loaded / e.total) * 100);
      });
    },
  };
}

/** Whether `create()` had to download: availability read `downloadable` or `downloading` just before it. */
function createDownloads(atCreate: string): boolean {
  return atCreate === 'downloadable' || atCreate === 'downloading';
}

/**
 * Read a text stream, stamping each chunk at receipt, and tell deltas from a
 * cumulative stream (every chunk after the first extends the one before).
 */
async function readStream(
  stream: ReadableStream<string>,
  signal: AbortSignal,
  onChunk: (text: string, t: number) => void,
): Promise<TaskItemOutput> {
  const reader = stream.getReader();
  const seen: string[] = [];
  const onAbort = () => {
    reader.cancel().catch(() => undefined);
  };
  signal.addEventListener('abort', onAbort);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      const t = performance.now();
      if (done) break;
      if (typeof value === 'string' && value.length > 0) {
        seen.push(value);
        onChunk(value, t);
      }
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }
  signal.throwIfAborted();
  const cumulative = seen.length >= 2 && seen.every((c, i) => i === 0 || (c.length > seen[i - 1].length && c.startsWith(seen[i - 1])));
  return { mode: cumulative ? 'cumulative' : 'delta' };
}

async function measureChrome(session: ChromeStreamingSession, text: string, signal: AbortSignal) {
  if (typeof session.measureInputUsage !== 'function') return undefined;
  const value = await session.measureInputUsage(text, { signal });
  return typeof value === 'number' && Number.isFinite(value) ? { value, unit: 'chrome-quota' as const } : undefined;
}

/**
 * A session's `inputQuota`: a finite number, or null. Chrome reports an
 * unbounded quota as Infinity, which JSON cannot hold, so it is also named in
 * `runtimeConfig.inputQuotaRaw`.
 */
function quotaOf(session: ChromeStreamingSession | { inputQuota?: unknown }): { inputQuota: number | null; raw?: string } {
  const q = (session as { inputQuota?: unknown }).inputQuota;
  if (typeof q === 'number' && Number.isFinite(q)) return { inputQuota: q };
  return { inputQuota: null, raw: q === Infinity ? 'Infinity' : q === undefined ? 'absent' : String(q) };
}

function chromeVersion(): string | undefined {
  const m = /Chrome\/(\d+[.\d]*)/.exec(typeof navigator !== 'undefined' ? navigator.userAgent : '');
  return m?.[1];
}

/** Chrome's built-in Summarizer (`summarizeStreaming`), options of record or Chrome's defaults. */
export function chromeSummarizerAdapter(set: 'cnndm-test' | 'xsum-test', defaults = false): TaskSystemAdapter {
  const options: Record<string, unknown> = defaults ? {} : { ...SUMMARIZER_OPTIONS[set], expectedInputLanguages: [...SUMMARIZER_OPTIONS[set].expectedInputLanguages] };
  return {
    availability: () => chromeAvailability('Summarizer', options),
    async load(_cell, { abortSignal, onProgress }) {
      const factory = chromeGlobal<ChromeSummarizerSession>('Summarizer');
      if (!factory) throw new Error('Chrome Summarizer API is not available (self.Summarizer is undefined)');
      const atCreate = await chromeAvailability('Summarizer', options);
      if (atCreate === 'unavailable' || atCreate === 'unsupported') throw new Error(`Summarizer availability is ${atCreate}`);
      const dl = downloadMonitor(onProgress);
      const started = performance.now();
      const session = await factory.create({ ...options, monitor: dl.monitor, signal: abortSignal });
      const ended = performance.now();
      const downloaded = createDownloads(atCreate);
      return {
        api: 'Summarizer',
        resolvedBackend: 'chrome-builtin',
        runtimeVersion: chromeVersion(),
        runtimeConfig: {
          optionType: String(session.type ?? options.type ?? 'default'),
          optionLength: String(session.length ?? options.length ?? 'default'),
          optionFormat: String(session.format ?? options.format ?? 'default'),
          optionExpectedInputLanguages: defaults ? 'default' : 'en',
          optionOutputLanguage: defaults ? 'default' : 'en',
          defaultOptions: defaults,
          ...(quotaOf(session).raw ? { inputQuotaRaw: quotaOf(session).raw! } : {}),
        },
        cached: !downloaded,
        availabilityAtCreate: atCreate,
        inputQuota: quotaOf(session).inputQuota,
        ...(downloaded ? { download: { events: dl.events, wallMs: ended - started, modelFolders: [...MODEL_FOLDERS.Summarizer] } } : {}),
        measureInputUsage: (item, signal) => measureChrome(session, item.text, signal),
        async runItem(item, ctx) {
          const out = await readStream(session.summarizeStreaming(item.text, { signal: ctx.abortSignal }), ctx.abortSignal, ctx.onChunk);
          return { ...out, truncation: null };
        },
        availability: () => chromeAvailability('Summarizer', options),
        async dispose() {
          session.destroy();
        },
      };
    },
  };
}

interface ChromeTranslatorSession extends ChromeStreamingSession {
  translateStreaming(input: string, options?: { signal?: AbortSignal }): ReadableStream<string>;
}

/**
 * A Translator `create()` started from the Run click, before the session
 * reached the pair's cell: Chrome keeps an installed pack `downloadable` in a
 * new process until a `create()` under a user activation, so each pair whose
 * pack `chrome://components` lists is created from the click, and the cell's
 * load step adopts it. Pairs are created one at a time in the plan's order,
 * so each `create()` span is that pair's own; the first one also carries the
 * translation service's start in the process.
 */
export interface PrecreatedTranslator {
  /** 1-based position in the creation chain. */
  order: number;
  /** The `availability()` reading taken right before this pair's `create()`. */
  availability: Promise<string>;
  /** Whether the page still held the user activation when this pair's `create()` was called. */
  activationAtCreate: Promise<boolean>;
  session: Promise<ChromeTranslatorSession>;
  /** When this pair's `create()` was called (after the previous pair's settled). */
  startT: Promise<number>;
  /** When it settled. */
  endT: Promise<number>;
  events: Array<{ t: number; loaded: number; total: number }>;
  /** The `chrome://components` entry that shows the pack installed. */
  pack: string;
}

/**
 * Create each translation pair whose pack is installed, one after another,
 * starting from a click handler: the first pair's `availability()` and
 * `create()` are called synchronously (inside the user activation), each
 * later pair's as soon as the one before it settled.
 *
 * @param pairs - The pairs in the plan's order, with the component entry that lists each pack.
 * @returns The creations by `src-tgt`.
 */
export function precreateTranslators(pairs: ReadonlyArray<{ src: string; tgt: string; pack: string }>): Map<string, PrecreatedTranslator> {
  const out = new Map<string, PrecreatedTranslator>();
  const factory = chromeGlobal<ChromeTranslatorSession>('Translator');
  if (!factory) return out;
  const activation = () => (navigator as { userActivation?: { isActive?: boolean } }).userActivation?.isActive === true;
  let previous: Promise<unknown> | undefined;
  pairs.forEach(({ src, tgt, pack }, index) => {
    const options = { sourceLanguage: src, targetLanguage: tgt };
    const events: PrecreatedTranslator['events'] = [];
    const start = () => {
      const availability = factory.availability(options).catch((e: unknown) => `error:${(e as Error)?.name ?? 'Error'}`.slice(0, 32));
      const active = activation();
      const startT = performance.now();
      const session = factory.create({
        ...options,
        monitor: (m: ChromeMonitorTarget) =>
          m.addEventListener('downloadprogress', (e) => events.push({ t: performance.now(), loaded: e.loaded ?? 0, total: e.total ?? 0 })),
      });
      return { availability, active, startT, session };
    };
    const started = previous === undefined ? Promise.resolve(start()) : previous.then(start, start);
    const session = started.then((s) => s.session);
    const endT = session.then(
      () => performance.now(),
      () => performance.now(),
    );
    previous = endT;
    out.set(`${src}-${tgt}`, {
      order: index + 1,
      availability: started.then((s) => s.availability),
      activationAtCreate: started.then((s) => s.active),
      session,
      startT: started.then((s) => s.startT),
      endT,
      events,
      pack,
    });
  });
  return out;
}

/**
 * Chrome's built-in Translator, one pair per cell, streamed with
 * `translateStreaming()`. A pair created in the Run click (see
 * `precreateTranslators`) is adopted, its `create()` span recorded as the
 * load; any other pair is created in the load step.
 */
export function chromeTranslatorAdapter(precreated: ReadonlyMap<string, PrecreatedTranslator> = new Map()): TaskSystemAdapter {
  const pair = (cell: TaskPlannedCell) => {
    const d = (cell as PlannedTaskCell).direction;
    if (!d) throw new Error(`translator cell ${cell.workloadId} has no direction`);
    return { sourceLanguage: d.src, targetLanguage: d.tgt };
  };
  return {
    availability: (cell) => {
      const early = precreated.get(`${pair(cell).sourceLanguage}-${pair(cell).targetLanguage}`);
      return early ? early.availability : chromeAvailability('Translator', pair(cell));
    },
    async load(cell, { abortSignal, onProgress }) {
      const languages = pair(cell);
      const key = `${languages.sourceLanguage}-${languages.targetLanguage}`;
      const early = precreated.get(key);
      let session: ChromeTranslatorSession;
      let atCreate: string;
      let events: Array<{ t: number; loaded: number; total: number }>;
      let span: { startT: number; endT: number } | undefined;
      let started: number;
      let ended: number;
      let activationAtCreate: boolean | undefined;
      if (early) {
        atCreate = await early.availability;
        session = await early.session;
        started = await early.startT;
        ended = await early.endT;
        activationAtCreate = await early.activationAtCreate;
        span = { startT: started, endT: ended };
        events = early.events;
      } else {
        const factory = chromeGlobal<ChromeTranslatorSession>('Translator');
        if (!factory) throw new Error('Chrome Translator API is not available (self.Translator is undefined)');
        atCreate = await chromeAvailability('Translator', languages);
        if (atCreate === 'unavailable' || atCreate === 'unsupported') throw new Error(`Translator ${key} availability is ${atCreate}`);
        const dl = downloadMonitor(onProgress);
        started = performance.now();
        session = await factory.create({ ...languages, monitor: dl.monitor, signal: abortSignal });
        ended = performance.now();
        events = dl.events;
      }
      const downloaded = createDownloads(atCreate);
      const quota = quotaOf(session);
      return {
        api: 'Translator',
        resolvedBackend: 'chrome-builtin',
        runtimeVersion: chromeVersion(),
        runtimeConfig: {
          langPair: key,
          createdInRunClick: Boolean(early),
          ...(early ? { packInComponents: early.pack, createOrder: early.order } : {}),
          ...(activationAtCreate !== undefined ? { activationAtCreate } : {}),
          ...(quota.raw ? { inputQuotaRaw: quota.raw } : {}),
        },
        cached: !downloaded || Boolean(early),
        availabilityAtCreate: atCreate,
        inputQuota: quota.inputQuota,
        ...(span ? { loadSpan: span } : {}),
        ...(downloaded ? { download: { events, wallMs: ended - started, modelFolders: [...MODEL_FOLDERS.Translator] } } : {}),
        measureInputUsage: (item, signal) => measureChrome(session, item.text, signal),
        async runItem(item, ctx) {
          const out = await readStream(session.translateStreaming(item.text, { signal: ctx.abortSignal }), ctx.abortSignal, ctx.onChunk);
          return { ...out, truncation: null };
        },
        availability: () => chromeAvailability('Translator', languages),
        async dispose() {
          session.destroy();
        },
      };
    },
  };
}

/** Chrome's built-in Language Detector: the raw `detect()` list (`und` kept), top-1 as the output. */
export function chromeLanguageDetectorAdapter(): TaskSystemAdapter {
  return {
    availability: () => chromeAvailability('LanguageDetector'),
    async load(_cell, { abortSignal, onProgress }) {
      const factory = chromeGlobal<ChromeDetectorSession>('LanguageDetector');
      if (!factory) throw new Error('Chrome Language Detector API is not available (self.LanguageDetector is undefined)');
      const atCreate = await chromeAvailability('LanguageDetector');
      if (atCreate === 'unavailable' || atCreate === 'unsupported') throw new Error(`LanguageDetector availability is ${atCreate}`);
      const dl = downloadMonitor(onProgress);
      const started = performance.now();
      const session = await factory.create({ monitor: dl.monitor, signal: abortSignal });
      const ended = performance.now();
      const downloaded = createDownloads(atCreate);
      return {
        api: 'LanguageDetector',
        resolvedBackend: 'chrome-builtin',
        runtimeVersion: chromeVersion(),
        ...(quotaOf(session).raw ? { runtimeConfig: { inputQuotaRaw: quotaOf(session).raw! } } : {}),
        cached: !downloaded,
        availabilityAtCreate: atCreate,
        inputQuota: quotaOf(session).inputQuota,
        ...(downloaded ? { download: { events: dl.events, wallMs: ended - started, modelFolders: [...MODEL_FOLDERS.LanguageDetector] } } : {}),
        measureInputUsage: (item, signal) => measureChrome(session, item.text, signal),
        async runItem(item, ctx) {
          const raw = await session.detect(item.text, { signal: ctx.abortSignal });
          const detect: TaskDetectCandidate[] = raw.slice(0, 20).map((r) => ({ language: r.detectedLanguage, confidence: r.confidence }));
          return { mode: 'none', text: raw[0]?.detectedLanguage ?? '', detect, truncation: null };
        },
        availability: () => chromeAvailability('LanguageDetector'),
        async dispose() {
          session.destroy();
        },
      };
    },
  };
}

// --- Pinned Transformers.js fallbacks ----------------------------------------

/** What the pinned fetch saw for one file. */
interface FetchedFile {
  url: string;
  sha256: Promise<string>;
  bytes: Promise<number>;
}

const fetchedFiles = new Map<string, FetchedFile>();
const pinnedEnvs = new WeakSet<object>();

const PINNED_BY_REPO = new Map(PINNED_FALLBACK_MODELS.map((m) => [m.repo, m]));
const HF_RESOLVE = /^https:\/\/huggingface\.co\/([^/]+\/[^/]+)\/resolve\/([^/]+)\/(.+)$/;

async function sha256OfBuffer(buffer: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface TransformersEnvLike {
  fetch: (input: string | URL, init?: unknown) => Promise<Response>;
  cacheKey?: string;
  version?: string;
  backends: { onnx: { wasm?: { numThreads?: number }; versions?: Record<string, string> } };
}

/**
 * Rewrite every Hugging Face model-file request of a pinned repository to
 * its pinned revision and keep a digest of each response; refuse requests
 * for any other repository. Installed once per Transformers.js instance (the
 * pinned release and the current-releases one each have their own `env`),
 * before its first load.
 *
 * @param env - Transformers.js `env`.
 */
export function installPinnedFetch(env: TransformersEnvLike): void {
  if (pinnedEnvs.has(env)) return;
  pinnedEnvs.add(env);
  const original = env.fetch;
  env.fetch = async (input: string | URL, init?: unknown) => {
    const url = String(input);
    const match = HF_RESOLVE.exec(url);
    if (!match) return original(input, init);
    const [, repo, , file] = match;
    const pin = PINNED_BY_REPO.get(repo);
    if (!pin) throw new Error(`refused an unpinned model request: ${url}`);
    const pinnedUrl = `https://huggingface.co/${repo}/resolve/${pin.revision}/${file}`;
    const response = await original(pinnedUrl, init);
    // Transformers.js probes file sizes with a `Range: bytes=0-0` request (a 206 with one byte);
    // only a full 200 body is the file the pin describes.
    if (response.status === 200) {
      const copy = response.clone();
      const buffer = copy.arrayBuffer();
      fetchedFiles.set(`${repo}/${file}`, {
        url: pinnedUrl,
        bytes: buffer.then((b) => b.byteLength),
        sha256: buffer.then(sha256OfBuffer),
      });
    }
    return response;
  };
}

/**
 * Hash every pinned file of `repo` at `dtype` from what this page fetched, or
 * else from the Transformers.js browser cache it was served from, and compare
 * with the pin.
 *
 * @returns How many files were checked from each source.
 * @throws {Error} On a missing file or a size or digest mismatch.
 */
async function verifyPinnedFiles(repo: string, dtype: 'q8' | 'fp32', cacheName: string): Promise<{ fetched: number; cached: number }> {
  const pin = PINNED_BY_REPO.get(repo);
  if (!pin) throw new Error(`${repo} has no pin`);
  let fetched = 0;
  let cached = 0;
  const cache = typeof caches !== 'undefined' ? await caches.open(cacheName) : undefined;
  for (const f of pin.dtypes[dtype] as PinnedFile[]) {
    let sha: string;
    let bytes: number;
    const seen = fetchedFiles.get(`${repo}/${f.file}`);
    if (seen) {
      [sha, bytes] = await Promise.all([seen.sha256, seen.bytes]);
      fetched++;
    } else {
      const hit = await cache?.match(`https://huggingface.co/${repo}/resolve/main/${f.file}`);
      if (!hit) throw new Error(`${repo} ${f.file}: neither fetched by this page nor in the ${cacheName} cache`);
      const buffer = await hit.arrayBuffer();
      sha = await sha256OfBuffer(buffer);
      bytes = buffer.byteLength;
      cached++;
    }
    if (bytes !== f.bytes || sha !== f.sha256) {
      throw new Error(`${repo} ${f.file}: ${bytes} bytes, sha256 ${sha}; the pin is ${f.bytes} bytes, ${f.sha256}`);
    }
  }
  return { fetched, cached };
}

/** Whether every pinned file is already in the browser cache (the load is warm). */
async function allCached(repo: string, dtype: 'q8' | 'fp32', cacheName: string): Promise<boolean | undefined> {
  const pin = PINNED_BY_REPO.get(repo);
  if (!pin || typeof caches === 'undefined') return undefined;
  const cache = await caches.open(cacheName);
  for (const f of pin.dtypes[dtype]) {
    if (!(await cache.match(`https://huggingface.co/${repo}/resolve/main/${f.file}`))) return false;
  }
  return true;
}

/** The provider model's pipeline, reached through its lazy loader (the provider exposes no explicit load). */
interface ProviderPipelineAccess {
  loadPipeline(): Promise<PipelineLike>;
}
interface PipelineLike {
  (text: string, options?: Record<string, unknown>): Promise<unknown>;
  tokenizer?: ((text: string) => { input_ids: { dims?: number[]; size?: number } }) & { model_max_length?: number };
  model?: { config?: { max_position_embeddings?: number } };
  dispose?: () => Promise<void>;
}

/**
 * The input-truncation record of a fallback item: the input's token count
 * (the tokenizer run without truncation), the model's maximum input length,
 * and whether the input was longer, so the pipeline cut it.
 *
 * @param inputTokens - Token count, when the tokenizer produced one.
 * @param modelMaxTokens - The model's maximum input length.
 * @returns The record, or undefined without a count.
 */
export function truncationRecord(
  inputTokens: number | undefined,
  modelMaxTokens: number | undefined,
): { inputTruncated: boolean; inputTokens: number; modelMaxTokens: number } | undefined {
  if (typeof inputTokens !== 'number' || typeof modelMaxTokens !== 'number' || !(modelMaxTokens > 0)) return undefined;
  return { inputTruncated: inputTokens > modelMaxTokens, inputTokens, modelMaxTokens };
}

/** The model's maximum input length: the tokenizer's `model_max_length`, else the config's position limit. */
function modelMaxTokensOf(pipe: PipelineLike): number | undefined {
  const fromTokenizer = pipe.tokenizer?.model_max_length;
  if (typeof fromTokenizer === 'number' && Number.isFinite(fromTokenizer) && fromTokenizer > 0 && fromTokenizer < 1e7) return fromTokenizer;
  const fromConfig = pipe.model?.config?.max_position_embeddings;
  return typeof fromConfig === 'number' ? fromConfig : undefined;
}

function providerPipeline(model: unknown): ProviderPipelineAccess {
  const access = model as Partial<ProviderPipelineAccess>;
  if (typeof access.loadPipeline !== 'function') {
    throw new Error('the @localmode/transformers model exposes no loadPipeline(); the load cannot be timed apart from the first item');
  }
  return access as ProviderPipelineAccess;
}

function tokenCount(pipe: PipelineLike, text: string): number | undefined {
  try {
    const ids = pipe.tokenizer?.(text)?.input_ids;
    const n = ids?.dims?.[ids.dims.length - 1] ?? ids?.size;
    return typeof n === 'number' ? n : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The pinned Transformers.js fallback of a summarize or translate cell.
 * `bundle: 'current'` loads the same pinned files through the
 * current-releases bundle (a newer Transformers.js and ONNX Runtime Web),
 * the secondary `transformers-wasm-current` lane.
 */
export function transformersTaskAdapter(
  task: 'summarize' | 'translate',
  device: 'wasm' | 'webgpu',
  bundle: 'pinned' | 'current' = 'pinned',
): TaskSystemAdapter {
  return {
    async load(cell, { onProgress }) {
      const [system, dtypeRaw] = cell.model.benchModelId.split('@');
      const dtype = dtypeRaw === 'fp32' ? 'fp32' : 'q8';
      if (dtypeRaw !== 'q8' && dtypeRaw !== 'fp32') throw new Error(`${cell.model.benchModelId}: only q8 and fp32 are pinned`);
      const repo = `Xenova/${system}`;
      const pin = PINNED_BY_REPO.get(repo);
      if (!pin) throw new Error(`${repo} has no pinned revision`);
      const hf = bundle === 'current' ? await import('@huggingface/transformers-current') : await import('@huggingface/transformers');
      const env = hf.env as unknown as TransformersEnvLike;
      installPinnedFetch(env);
      const cacheName = typeof env.cacheKey === 'string' ? env.cacheKey : 'transformers-cache';
      const cached = await allCached(repo, dtype, cacheName);
      const { transformers } = (bundle === 'current'
        ? await import('./current-releases/transformers.generated.js')
        : await import('@localmode/transformers')) as typeof import('@localmode/transformers');
      const progress = (p: { progress?: number }) => onProgress(typeof p.progress === 'number' ? p.progress : undefined);
      const model =
        task === 'summarize'
          ? transformers.summarizer(repo, { quantized: dtype === 'q8', device, onProgress: progress })
          : transformers.translator(repo, { quantized: dtype === 'q8', device, onProgress: progress, targetLanguageToken: false } as never);
      const pipe = await providerPipeline(model).loadPipeline();
      const targetToken = task === 'translate' ? OPUS_TARGET_TOKENS[repo] : undefined;
      const runtimeConfig: Record<string, string | number | boolean> = {
        dtype,
        device,
        quantized: dtype === 'q8',
        revision: pin.revision,
        transformersBundle: bundle === 'current' ? 'current-releases' : 'pinned',
        transformersVersion: String(env.version ?? 'unknown'),
        onnxruntimeWebVersion: String(env.backends.onnx.versions?.web ?? 'unknown'),
      };
      if (device === 'wasm' && typeof env.backends.onnx.wasm?.numThreads === 'number') runtimeConfig.numThreads = env.backends.onnx.wasm.numThreads;
      const maxTokens = modelMaxTokensOf(pipe);
      if (maxTokens !== undefined) runtimeConfig.modelMaxTokens = maxTokens;
      if (task === 'summarize') {
        runtimeConfig.maxLength = DISTILBART_LENGTH.maxLength;
        runtimeConfig.minLength = DISTILBART_LENGTH.minLength;
      } else {
        const d = (cell as PlannedTaskCell).direction;
        if (d) runtimeConfig.langPair = `${d.src}-${d.tgt}`;
        if (targetToken) runtimeConfig.targetToken = targetToken;
      }
      return {
        api: task === 'summarize' ? 'transformers.js summarization' : 'transformers.js translation',
        resolvedBackend: device,
        runtimeVersion: String(env.version ?? ''),
        runtimeConfig,
        ...(cached !== undefined ? { cached } : {}),
        async verify() {
          const t0 = performance.now();
          const { fetched, cached: fromCache } = await verifyPinnedFiles(repo, dtype, cacheName);
          return { pinVerified: true, pinFilesFetched: fetched, pinFilesFromCache: fromCache, pinCheckMs: Math.round(performance.now() - t0) };
        },
        async measureInputUsage(item) {
          const input = targetToken ? `${targetToken} ${item.text}` : item.text;
          const n = tokenCount(pipe, input);
          return n === undefined ? undefined : { value: n, unit: 'tokens' as const };
        },
        async runItem(item: TaskItem, ctx) {
          ctx.abortSignal.throwIfAborted();
          const truncation = truncationRecord(tokenCount(pipe, targetToken ? `${targetToken} ${item.text}` : item.text), modelMaxTokensOf(pipe));
          if (task === 'summarize') {
            const result = await (model as { doSummarize(o: unknown): Promise<unknown> }).doSummarize({
              texts: [item.text],
              maxLength: DISTILBART_LENGTH.maxLength,
              minLength: DISTILBART_LENGTH.minLength,
              abortSignal: ctx.abortSignal,
            } as never);
            return { mode: 'none', text: (result as { summaries: string[] }).summaries[0] ?? '', ...(truncation ? { truncation } : {}) };
          }
          const input = targetToken ? `${targetToken} ${item.text}` : item.text;
          const result = await (model as { doTranslate(o: unknown): Promise<{ translations: string[] }> }).doTranslate({
            texts: [input],
            abortSignal: ctx.abortSignal,
          });
          return { mode: 'none', text: result.translations[0] ?? '', ...(targetToken ? { targetToken } : {}), ...(truncation ? { truncation } : {}) };
        },
        async dispose() {
          await pipe.dispose?.();
        },
      } satisfies LoadedTaskSystem;
    },
  };
}

/** MediaPipe's language detector on the CPU delegate, pinned tasks-text WASM path; the full candidate list. */
export function mediapipeLanguageDetectorAdapter(): TaskSystemAdapter {
  return {
    async load() {
      const { createMediaPipe } = await import('@localmode/mediapipe');
      const provider = createMediaPipe({ wasmBasePath: PINNED_MEDIAPIPE_LANGUAGE_DETECTOR.wasmBasePath, delegate: 'CPU' });
      const model = provider.languageDetector();
      const task = (model as unknown as { task?: { get?: () => Promise<unknown> } }).task;
      if (typeof task?.get !== 'function') throw new Error('the @localmode/mediapipe detector exposes no lazy task; the load cannot be timed apart from the first item');
      await task.get();
      return {
        api: 'mediapipe LanguageDetector',
        resolvedBackend: 'wasm',
        runtimeVersion: PINNED_MEDIAPIPE_LANGUAGE_DETECTOR.tasksTextVersion,
        runtimeConfig: {
          delegate: 'CPU',
          wasmBasePath: PINNED_MEDIAPIPE_LANGUAGE_DETECTOR.wasmBasePath,
          modelUrl: PINNED_MEDIAPIPE_LANGUAGE_DETECTOR.modelUrl,
          modelSha256: PINNED_MEDIAPIPE_LANGUAGE_DETECTOR.modelSha256,
        },
        async verify() {
          const response = await fetch(PINNED_MEDIAPIPE_LANGUAGE_DETECTOR.modelUrl, { cache: 'force-cache' });
          const buffer = await response.arrayBuffer();
          const sha = await sha256OfBuffer(buffer);
          if (sha !== PINNED_MEDIAPIPE_LANGUAGE_DETECTOR.modelSha256 || buffer.byteLength !== PINNED_MEDIAPIPE_LANGUAGE_DETECTOR.modelBytes) {
            throw new Error(`language_detector.tflite: ${buffer.byteLength} bytes, sha256 ${sha}; the pin is ${PINNED_MEDIAPIPE_LANGUAGE_DETECTOR.modelSha256}`);
          }
          return { pinVerified: true };
        },
        async runItem(item, ctx) {
          const result = await model.doDetect({ text: item.text, abortSignal: ctx.abortSignal });
          const detect = result.languages.slice(0, 20).map((l) => ({ language: l.languageCode, confidence: l.confidence }));
          return { mode: 'none', text: detect[0]?.language ?? '', detect, truncation: null };
        },
        async dispose() {
          (model as unknown as { close?: () => void }).close?.();
        },
      };
    },
  };
}

/**
 * The adapter of an arm id (`<runtimeId>/<systemId>`).
 *
 * @param arm - The arm.
 * @param set - The session's item set (the Summarizer's options depend on it).
 * @returns The adapter.
 * @throws {Error} For an arm no adapter serves.
 */
export function taskAdapterFor(
  arm: string,
  set: string,
  precreated: ReadonlyMap<string, PrecreatedTranslator> = new Map(),
): TaskSystemAdapter {
  const [runtimeId, system] = [arm.slice(0, arm.indexOf('/')), arm.slice(arm.indexOf('/') + 1)];
  const summarySet = set === 'xsum-test' ? 'xsum-test' : 'cnndm-test';
  if (runtimeId === 'chrome-ai') {
    if (system === 'chrome-summarizer') return chromeSummarizerAdapter(summarySet);
    if (system === 'chrome-summarizer-default') return chromeSummarizerAdapter(summarySet, true);
    if (system === 'chrome-translator') return chromeTranslatorAdapter(precreated);
    if (system === 'chrome-language-detector') return chromeLanguageDetectorAdapter();
  }
  if (runtimeId === 'mediapipe' && system === 'mediapipe-language-detector') return mediapipeLanguageDetectorAdapter();
  if (runtimeId === 'transformers-wasm' || runtimeId === 'transformers-webgpu') {
    const device = runtimeId === 'transformers-webgpu' ? 'webgpu' : 'wasm';
    if (system.startsWith('distilbart-cnn-6-6@')) return transformersTaskAdapter('summarize', device);
    if (system.startsWith('opus-mt-')) return transformersTaskAdapter('translate', device);
  }
  if (runtimeId === 'transformers-wasm-current') {
    if (system.startsWith('distilbart-cnn-6-6@')) return transformersTaskAdapter('summarize', 'wasm', 'current');
    if (system.startsWith('opus-mt-')) return transformersTaskAdapter('translate', 'wasm', 'current');
  }
  throw new Error(`no task adapter serves ${arm}`);
}
