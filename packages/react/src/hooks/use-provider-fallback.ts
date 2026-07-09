'use client';

/**
 * @file use-provider-fallback.ts
 * @description Per-capability Chrome Built-in AI ⇄ Transformers.js provider
 * resolution. Detection is independent per capability (Summarizer API,
 * Translator API, Prompt API) and reads the browser globals directly, so one
 * capability can be Chrome-AI-served while another falls back in the same
 * session. Resolution is lazy and session-cached (per capability, per Chrome
 * summary style + length, per language pair, per fallback modelId + device);
 * every provider package is loaded via dynamic `import()` inside the resolution
 * path so nothing about a provider ships until a capability first resolves.
 *
 * `@localmode/react` gains NO hard dependency on `@localmode/chrome-ai` or
 * `@localmode/transformers`: the default loaders dynamic-import them at runtime
 * (the consumer supplies them), and the loaders are injectable for testing or
 * custom provider builds.
 *
 * Badge truthfulness: each resolution returns the resolved model instance
 * together with its provider identity, modelId, and tier, and updates the
 * hook's `resolution` provenance, so a badge derives from what ACTUALLY serves
 * requests — never from the detection probe alone.
 */

import { useCallback, useRef, useState } from 'react';
import type {
  FillMaskModel,
  LanguageModel,
  SummarizationModel,
  TranslationModel,
} from '@localmode/core';

/* ─────────────────────────────── public types ────────────────────────────── */

/** The provider that actually serves a capability's requests. */
export type ProviderId = 'chrome-ai' | 'transformers';

/** Badge tier derived from the resolved provider. */
export type ProviderTier = 'built-in' | 'download';

/** The four capabilities the hook resolves. */
export type ProviderCapability = 'summarize' | 'translate' | 'edit' | 'fill-mask';

/** Chrome Summarizer API summary style (mirrors the browser Summarizer `type`). */
// `tldr` (no punctuation) is the spelling Chrome's `SummarizerType` enum accepts;
// `'tl;dr'` throws a TypeError from `Summarizer.availability()` / `.create()`.
export type ChromeSummaryStyle = 'tldr' | 'key-points' | 'teaser' | 'headline';

/** Chrome Summarizer API output length. */
export type ChromeSummaryLength = 'short' | 'medium' | 'long';

/**
 * A resolved model instance plus the provenance a badge/witness derives from.
 * `tier` is derived from `provider` so a badge can render directly off this.
 */
export interface ResolvedModel<M> {
  /** The concrete model instance (Chrome AI or Transformers.js). */
  model: M;
  /** The provider that will serve requests through `model`. */
  provider: ProviderId;
  /** `model.modelId` (e.g. `chrome-ai:gemini-nano-summarizer`, `transformers:Xenova/...`). */
  modelId: string;
  /** `'built-in'` for Chrome AI, `'download'` for Transformers.js. */
  tier: ProviderTier;
}

/** Last-resolved provenance — the truthful badge source. */
export interface ProviderResolution {
  capability: ProviderCapability;
  provider: ProviderId;
  modelId: string;
  tier: ProviderTier;
}

/** Params for {@link UseProviderFallbackReturn.resolveSummarizer}. */
export interface ResolveSummarizerParams {
  /** Chrome summary style (used when Chrome AI serves). */
  chromeStyle: ChromeSummaryStyle;
  /** Chrome summary length (used when Chrome AI serves). */
  length: ChromeSummaryLength;
  /** Transformers.js fallback model id (used when Chrome AI is unavailable). */
  fallbackModelId: string;
}

/** Params for {@link UseProviderFallbackReturn.resolveTranslator}. */
export interface ResolveTranslatorParams {
  /** Source (BCP-47-ish) language code. */
  source: string;
  /** Target language code. */
  target: string;
  /** Transformers.js fallback model id for this directed pair. */
  fallbackModelId: string;
}

/** Params for {@link UseProviderFallbackReturn.resolveEditEngine}. */
export interface ResolveEditEngineParams {
  /** Transformers.js fallback instruct model id. */
  fallbackModelId: string;
  /** Compute device for the Transformers.js fallback. */
  device: 'webgpu' | 'wasm';
}

/* ─────────────────────────── provider module shapes ──────────────────────── */
// Structural shapes of the (dynamically-imported) provider packages — only the
// factories this hook calls. Defined locally so `@localmode/react` type-checks
// and ships without a build- or runtime-time dependency on the providers.

interface ChromeAIProviderLike {
  summarizer(settings?: { type?: ChromeSummaryStyle; length?: ChromeSummaryLength }): SummarizationModel;
  translator(settings?: { sourceLanguage: string; targetLanguage: string }): TranslationModel;
  languageModel(settings?: Record<string, unknown>): LanguageModel;
}

/** Shape of the `@localmode/chrome-ai` module used here. */
export interface ChromeAIModuleLike {
  chromeAI: ChromeAIProviderLike;
}

interface TransformersProviderLike {
  summarizer(modelId: string): SummarizationModel;
  translator(modelId: string): TranslationModel;
  fillMask(modelId: string): FillMaskModel;
  languageModel(modelId: string, options?: { device?: 'webgpu' | 'wasm' }): LanguageModel;
}

/** Shape of the `@localmode/transformers` module used here. */
export interface TransformersModuleLike {
  transformers: TransformersProviderLike;
}

/** Loads the `@localmode/chrome-ai` module (defaults to a dynamic import). */
export type LoadChromeAI = () => Promise<ChromeAIModuleLike>;

/** Loads the `@localmode/transformers` module (defaults to a dynamic import). */
export type LoadTransformers = () => Promise<TransformersModuleLike>;

/** Options for {@link useProviderFallback}. */
export interface UseProviderFallbackOptions {
  /**
   * Override the `@localmode/chrome-ai` loader. Defaults to a dynamic
   * `import('@localmode/chrome-ai')`. Provide a fake for testing or a custom
   * provider build.
   */
  loadChromeAI?: LoadChromeAI;
  /**
   * Override the `@localmode/transformers` loader. Defaults to a dynamic
   * `import('@localmode/transformers')`.
   */
  loadTransformers?: LoadTransformers;
}

/** Return surface of {@link useProviderFallback}. */
export interface UseProviderFallbackReturn {
  /** Resolve the summarization model (Chrome Summarizer API ⇄ DistilBART fallback). */
  resolveSummarizer: (params: ResolveSummarizerParams) => Promise<ResolvedModel<SummarizationModel>>;
  /** Resolve the translation model (Chrome Translator API ⇄ Opus-MT fallback). */
  resolveTranslator: (params: ResolveTranslatorParams) => Promise<ResolvedModel<TranslationModel>>;
  /** Resolve the AI-edit engine (Chrome Prompt API ⇄ Transformers.js instruct fallback). */
  resolveEditEngine: (params: ResolveEditEngineParams) => Promise<ResolvedModel<LanguageModel>>;
  /** Resolve the fill-mask model (Transformers.js only — no Chrome equivalent). */
  resolveFillMask: (modelId: string) => Promise<ResolvedModel<FillMaskModel>>;
  /** Last resolved provider/model — the truthful badge source, or null. */
  resolution: ProviderResolution | null;
  /** True while any resolver is in flight. */
  isResolving: boolean;
  /** Last resolution error, or null. */
  error: Error | null;
  /**
   * Last-probed Chrome availability per capability, or `null` if never probed.
   * Populate it with {@link UseProviderFallbackReturn.refreshChromeAvailability}.
   */
  chromeAvailability: Partial<Record<ChromeCapability, ChromeAIAvailability>>;
  /** Probe (or re-probe) Chrome's model state for one capability. */
  refreshChromeAvailability: (
    capability: ChromeCapability,
    params?: ChromeCapabilityParams,
  ) => Promise<ChromeAIAvailability>;
  /**
   * Ask Chrome to download a capability's on-device model.
   *
   * **Call this from a click handler.** Chrome requires a user activation to start
   * the download, so it cannot be triggered from an effect or on mount. Updates
   * `chromeAvailability` and `chromeDownloadProgress` as it runs.
   */
  requestChromeDownload: (
    capability: ChromeCapability,
    params?: ChromeCapabilityParams,
  ) => Promise<ChromeAIAvailability>;
  /** In-flight download progress (0–1) keyed by capability, or `null` when idle. */
  chromeDownloadProgress: ChromeDownloadProgress | null;
  /** The capability whose model is currently downloading, or `null`. */
  downloadingCapability: ChromeCapability | null;
}

/* ─────────────────────────── capability detection ────────────────────────── */
// Synchronous global probes (kept `async` for a uniform capability API and
// because Prompt detection awaits `availability()`). These read the SAME
// browser surfaces the `@localmode/chrome-ai` detectors read, so the hook needs
// no provider import to detect.

/**
 * Chrome's on-device model state, plus `unsupported` for "the API isn't here at all".
 * `unsupported` is ours; the other four are Chrome's own `availability()` values.
 */
export type ChromeAIAvailability =
  | 'available'
  | 'downloadable'
  | 'downloading'
  | 'unavailable'
  | 'unsupported';

/** Progress of a Chrome-managed model download, as a 0–1 fraction. */
export interface ChromeDownloadProgress {
  capability: ChromeCapability;
  /** 0–1. Chrome reports either a fraction or loaded/total bytes; both normalize here. */
  progress: number;
}

/** The three capabilities Chrome Built-in AI can serve (fill-mask has no Chrome API). */
export type ChromeCapability = Exclude<ProviderCapability, 'fill-mask'>;

/** Extra params some capabilities need to answer `availability()` / `create()`. */
export interface ChromeCapabilityParams {
  /** `translate` only — availability and downloads are per language pair. */
  source?: string;
  /** `translate` only. */
  target?: string;
  /** `summarize` only. */
  chromeStyle?: ChromeSummaryStyle;
  /** `summarize` only. */
  length?: ChromeSummaryLength;
}

/**
 * A Chrome Built-in AI factory. Modern Chrome exposes each API as its own
 * top-level global (`self.Summarizer`, `self.Translator`, `self.LanguageModel`);
 * Chrome 127–137 origin-trial builds used a `self.ai.*` namespace with no
 * `availability()`. Both shapes are handled.
 */
interface ChromeAIFactory {
  availability?: (options?: Record<string, unknown>) => Promise<string>;
  create: (options?: Record<string, unknown>) => Promise<{ destroy?: () => void }>;
}

interface SelfWithAI {
  ai?: { summarizer?: ChromeAIFactory; translator?: ChromeAIFactory; languageModel?: ChromeAIFactory };
  Summarizer?: ChromeAIFactory;
  Translator?: ChromeAIFactory;
  LanguageModel?: ChromeAIFactory;
}

/** Resolve a capability's Chrome factory: modern global first, legacy namespace second. */
function chromeFactory(capability: ChromeCapability): ChromeAIFactory | null {
  if (typeof self === 'undefined') return null;
  const g = self as unknown as SelfWithAI;
  switch (capability) {
    case 'summarize':
      return g.Summarizer ?? g.ai?.summarizer ?? null;
    case 'translate':
      return g.Translator ?? g.ai?.translator ?? null;
    case 'edit':
      return g.LanguageModel ?? g.ai?.languageModel ?? null;
  }
}

/** The `create()` / `availability()` options a capability needs. */
function chromeOptions(
  capability: ChromeCapability,
  params: ChromeCapabilityParams = {},
): Record<string, unknown> | undefined {
  switch (capability) {
    case 'translate':
      return { sourceLanguage: params.source ?? 'en', targetLanguage: params.target ?? 'es' };
    case 'summarize':
      return { type: params.chromeStyle ?? 'tldr', length: params.length ?? 'medium' };
    case 'edit':
      return undefined;
  }
}

/**
 * Default deadline for a Chrome `availability()` probe.
 *
 * Chrome normally answers in ~1ms. But `Translator.availability()` has been observed
 * to NEVER settle on some builds (headless Chromium, profiles without the translation
 * service). Awaiting it on a resolver's critical path leaves the UI stuck on
 * "Preparing…" forever, so every probe is raced against this deadline.
 */
export const CHROME_AVAILABILITY_TIMEOUT_MS = 3000;

/** Sentinel resolved when a probe outruns its deadline. */
const PROBE_TIMED_OUT = Symbol('probe-timed-out');

async function raceDeadline<T>(promise: Promise<T>, ms: number): Promise<T | typeof PROBE_TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<typeof PROBE_TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(PROBE_TIMED_OUT), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Ask Chrome whether a capability's on-device model is ready.
 *
 * Returns `unsupported` only when the API is genuinely absent, and `available` on
 * the legacy `self.ai.*` surface (which predates `availability()` and can only be
 * probed by presence).
 *
 * @throws whatever `availability()` throws. This is deliberate: Chrome raises a
 *   `TypeError` when handed an invalid option (e.g. a `SummarizerType` outside
 *   its enum), and reporting that as `unsupported` would blame the user's browser
 *   for a caller bug. Callers wanting a safe default should catch.
 */
export async function probeChromeAvailability(
  capability: ChromeCapability,
  params: ChromeCapabilityParams = {},
  timeoutMs: number = CHROME_AVAILABILITY_TIMEOUT_MS,
): Promise<ChromeAIAvailability> {
  const factory = chromeFactory(capability);
  if (!factory) return 'unsupported';
  if (typeof factory.availability !== 'function') return 'available';
  // NOT wrapped in try/catch: Chrome raises a `TypeError` on an invalid option
  // (e.g. a `SummarizerType` outside its enum), and reporting that as `unsupported`
  // would blame the user's browser for a caller bug. A non-settling probe is a
  // different matter — it must never wedge the caller, so it is raced instead.
  const state = await raceDeadline(factory.availability(chromeOptions(capability, params)), timeoutMs);
  // An unresponsive probe means we cannot claim the model is available. Report
  // `unavailable` (the truthful "not usable here") rather than hanging forever.
  if (state === PROBE_TIMED_OUT) return 'unavailable';
  // Chrome ≤ 137 spelled these 'readily' / 'after-download' / 'no'.
  if (state === 'readily') return 'available';
  if (state === 'after-download') return 'downloadable';
  if (state === 'no') return 'unavailable';
  return state as ChromeAIAvailability;
}

/** {@link probeChromeAvailability} that never throws — for paths where falling back is correct. */
async function probeOrFallback(
  capability: ChromeCapability,
  params: ChromeCapabilityParams = {},
): Promise<ChromeAIAvailability> {
  try {
    return await probeChromeAvailability(capability, params);
  } catch {
    return 'unavailable';
  }
}

/**
 * Ask Chrome to download a capability's on-device model, reporting progress.
 *
 * **Must be called from a user activation** (click / tap / keypress) — Chrome
 * refuses to start the download otherwise. This is why the UI needs a button:
 * there is no way to trigger it from an effect or on page load.
 *
 * The session created to force the download is destroyed immediately; only the
 * cached model persists. Resolves to the post-download availability.
 */
export async function downloadChromeModel(
  capability: ChromeCapability,
  params: ChromeCapabilityParams = {},
  onProgress?: (progress: number) => void,
): Promise<ChromeAIAvailability> {
  const factory = chromeFactory(capability);
  if (!factory) return 'unsupported';

  const options: Record<string, unknown> = { ...(chromeOptions(capability, params) ?? {}) };
  if (onProgress) {
    options.monitor = (m: EventTarget) => {
      m.addEventListener('downloadprogress', ((evt: Event) => {
        const e = evt as Event & { loaded?: number; total?: number };
        const loaded = e.loaded ?? 0;
        const total = e.total ?? 0;
        // Chrome has reported both loaded/total bytes and a bare 0–1 fraction.
        const fraction = total > 0 ? loaded / total : loaded <= 1 ? loaded : 0;
        onProgress(Math.max(0, Math.min(1, fraction)));
      }) as EventListener);
    };
  }

  const session = await factory.create(options);
  try {
    session.destroy?.();
  } catch {
    // best-effort: the download is cached regardless of session teardown
  }
  return probeOrFallback(capability, params);
}

/**
 * Is the Chrome Summarizer API usable? Presence is not enough — a present API can
 * still be merely `downloadable`, and committing to it would throw. Mirrors
 * {@link detectPromptProvider}.
 */
export async function detectSummarizerProvider(
  params: ChromeCapabilityParams = {},
): Promise<ProviderId> {
  return (await probeOrFallback('summarize', params)) === 'available' ? 'chrome-ai' : 'transformers';
}

/** Is the Chrome Translator API usable for this language pair? Availability is per pair. */
export async function detectTranslatorProvider(
  params: ChromeCapabilityParams = {},
): Promise<ProviderId> {
  return (await probeOrFallback('translate', params)) === 'available' ? 'chrome-ai' : 'transformers';
}

/**
 * Is the Chrome Prompt API (Gemini Nano) *usable* in this browser? Presence is
 * not enough: a present API can still be merely `'downloadable'`, and
 * committing to it would either fail or silently trigger a large Gemini Nano
 * download the user never requested. So this additionally gates on
 * `LanguageModel.availability()`: Chrome AI is used only when the on-device
 * model is actually `'available'`; every other state falls back to the smaller
 * Transformers.js instruct model behind the block's explicit download gate.
 * The legacy `self.ai.languageModel` surface (no `availability()`) trusts
 * presence.
 */
export async function detectPromptProvider(): Promise<ProviderId> {
  return (await probeOrFallback('edit')) === 'available' ? 'chrome-ai' : 'transformers';
}

/* ──────────────────────────── tier / name helpers ────────────────────────── */

/** Map a {@link ProviderId} to its badge tier. */
export function providerTier(provider: ProviderId): ProviderTier {
  return provider === 'chrome-ai' ? 'built-in' : 'download';
}

/** Human-readable provider name for a badge. */
export function providerName(provider: ProviderId): string {
  return provider === 'chrome-ai' ? 'Chrome AI' : 'Transformers.js';
}

/* ─────────────────────────── default provider loaders ─────────────────────── */
// Loading through a function boundary keeps the bundler from statically
// resolving (and thus requiring) the optional provider packages: the specifier
// arrives as a runtime value, so the `import()` stays external and only
// executes when a capability first resolves. The magic comments keep Vite and
// webpack consumers from analyzing it too.
function importOptional<T>(pkg: string): Promise<T> {
  // Bundler-opaque dynamic import: a Function-constructed importer leaves no
  // statically-analyzable \`import()\` node, so consumers' bundlers (webpack,
  // Turbopack, Vite) never attempt to resolve the optional provider packages.
  // Strict-CSP consumers (no unsafe-eval) should inject \`loadChromeAI\`/
  // \`loadTransformers\` overrides that use literal imports instead.
  const importer = new Function('s', 'return import(s)') as (s: string) => Promise<T>;
  return importer(pkg);
}

const defaultLoadChromeAI: LoadChromeAI = () =>
  importOptional<ChromeAIModuleLike>('@localmode/chrome-ai');

const defaultLoadTransformers: LoadTransformers = () =>
  importOptional<TransformersModuleLike>('@localmode/transformers');

/* ──────────────────────────────── resolvers ──────────────────────────────── */

function makeResolved<M extends { modelId: string }>(
  model: M,
  provider: ProviderId,
): ResolvedModel<M> {
  return { model, provider, modelId: model.modelId, tier: providerTier(provider) };
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

/**
 * Per-capability Chrome Built-in AI ⇄ Transformers.js provider resolution with
 * session caching and truthful provenance.
 *
 * The four capabilities take different params and the split write / translate /
 * summarize / complete surfaces each use exactly one, so the hook exposes
 * capability-scoped resolvers (rather than one monolithic `resolve(request)`)
 * to keep each consumer's bundle minimal. Each resolver:
 *
 * 1. Returns a session-cached {@link ResolvedModel} immediately on a repeat
 *    call with identical params (no re-detection, no re-construction).
 * 2. Otherwise detects the provider from the browser globals, constructs the
 *    model via a dynamically-imported provider package, caches it, and updates
 *    `resolution` so a badge reflects what ACTUALLY serves requests.
 *
 * `resolveFillMask` has no Chrome equivalent and always resolves
 * `transformers` / `download`.
 *
 * @param options - Optional provider-loader overrides (default: dynamic import)
 * @returns The four capability resolvers plus `resolution` / `isResolving` / `error`
 *
 * @example
 * ```tsx
 * import { useProviderFallback, providerName } from '@localmode/react';
 *
 * function SummarizeTab() {
 *   const { resolveSummarizer, resolution, isResolving } = useProviderFallback();
 *
 *   async function run(text: string) {
 *     const { model } = await resolveSummarizer({
 *       chromeStyle: 'key-points',
 *       length: 'medium',
 *       fallbackModelId: 'Xenova/distilbart-cnn-6-6',
 *     });
 *     return summarize({ model, text });
 *   }
 *
 *   return resolution ? <Badge provider={providerName(resolution.provider)} tier={resolution.tier} /> : null;
 * }
 * ```
 *
 * @throws Never throws during render; each resolver rejects with the underlying
 * error (also exposed via `error`).
 * @see detectSummarizerProvider / detectTranslatorProvider / detectPromptProvider
 */
export function useProviderFallback(
  options: UseProviderFallbackOptions = {},
): UseProviderFallbackReturn {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [resolution, setResolution] = useState<ProviderResolution | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [chromeAvailability, setChromeAvailability] = useState<
    Partial<Record<ChromeCapability, ChromeAIAvailability>>
  >({});
  const [chromeDownloadProgress, setChromeDownloadProgress] =
    useState<ChromeDownloadProgress | null>(null);
  const [downloadingCapability, setDownloadingCapability] = useState<ChromeCapability | null>(null);

  // Session caches (per hook instance). Keyed by the full param signature so a
  // repeat call short-circuits BEFORE re-detecting or re-constructing.
  const summarizerCache = useRef(new Map<string, ResolvedModel<SummarizationModel>>());
  const translatorCache = useRef(new Map<string, ResolvedModel<TranslationModel>>());
  const editEngineCache = useRef(new Map<string, ResolvedModel<LanguageModel>>());
  const fillMaskCache = useRef(new Map<string, ResolvedModel<FillMaskModel>>());

  const loadChromeAI = () => (optionsRef.current.loadChromeAI ?? defaultLoadChromeAI)();
  const loadTransformers = () =>
    (optionsRef.current.loadTransformers ?? defaultLoadTransformers)();

  /** Shared bookkeeping: flip `isResolving`, publish `resolution`, surface errors. */
  const withResolution = useCallback(
    async <M>(
      capability: ProviderCapability,
      run: () => Promise<ResolvedModel<M>>,
    ): Promise<ResolvedModel<M>> => {
      setIsResolving(true);
      setError(null);
      try {
        const resolved = await run();
        setResolution({
          capability,
          provider: resolved.provider,
          modelId: resolved.modelId,
          tier: resolved.tier,
        });
        return resolved;
      } catch (err) {
        const e = toError(err);
        setError(e);
        throw e;
      } finally {
        setIsResolving(false);
      }
    },
    [],
  );

  const resolveSummarizer = useCallback(
    (params: ResolveSummarizerParams) =>
      withResolution('summarize', async () => {
        const key = `${params.chromeStyle}|${params.length}|${params.fallbackModelId}`;
        const cached = summarizerCache.current.get(key);
        if (cached) return cached;

        const provider = await detectSummarizerProvider({
          chromeStyle: params.chromeStyle,
          length: params.length,
        });
        let resolved: ResolvedModel<SummarizationModel>;
        if (provider === 'chrome-ai') {
          const { chromeAI } = await loadChromeAI();
          resolved = makeResolved(
            chromeAI.summarizer({ type: params.chromeStyle, length: params.length }),
            provider,
          );
        } else {
          const { transformers } = await loadTransformers();
          resolved = makeResolved(transformers.summarizer(params.fallbackModelId), provider);
        }
        summarizerCache.current.set(key, resolved);
        return resolved;
      }),
    [withResolution],
  );

  const resolveTranslator = useCallback(
    (params: ResolveTranslatorParams) =>
      withResolution('translate', async () => {
        const key = `${params.source}|${params.target}|${params.fallbackModelId}`;
        const cached = translatorCache.current.get(key);
        if (cached) return cached;

        const provider = await detectTranslatorProvider({
          source: params.source,
          target: params.target,
        });
        let resolved: ResolvedModel<TranslationModel>;
        if (provider === 'chrome-ai') {
          const { chromeAI } = await loadChromeAI();
          resolved = makeResolved(
            chromeAI.translator({ sourceLanguage: params.source, targetLanguage: params.target }),
            provider,
          );
        } else {
          const { transformers } = await loadTransformers();
          resolved = makeResolved(transformers.translator(params.fallbackModelId), provider);
        }
        translatorCache.current.set(key, resolved);
        return resolved;
      }),
    [withResolution],
  );

  const resolveEditEngine = useCallback(
    (params: ResolveEditEngineParams) =>
      withResolution('edit', async () => {
        const key = `${params.fallbackModelId}|${params.device}`;
        const cached = editEngineCache.current.get(key);
        if (cached) return cached;

        const provider = await detectPromptProvider();
        let resolved: ResolvedModel<LanguageModel>;
        if (provider === 'chrome-ai') {
          const { chromeAI } = await loadChromeAI();
          resolved = makeResolved(chromeAI.languageModel(), provider);
        } else {
          const { transformers } = await loadTransformers();
          resolved = makeResolved(
            transformers.languageModel(params.fallbackModelId, { device: params.device }),
            provider,
          );
        }
        editEngineCache.current.set(key, resolved);
        return resolved;
      }),
    [withResolution],
  );

  const resolveFillMask = useCallback(
    (modelId: string) =>
      withResolution('fill-mask', async () => {
        const cached = fillMaskCache.current.get(modelId);
        if (cached) return cached;

        // Fill-mask has no Chrome AI equivalent — Transformers.js only.
        const { transformers } = await loadTransformers();
        const resolved = makeResolved(transformers.fillMask(modelId), 'transformers');
        fillMaskCache.current.set(modelId, resolved);
        return resolved;
      }),
    [withResolution],
  );

  const refreshChromeAvailability = useCallback(
    async (capability: ChromeCapability, params: ChromeCapabilityParams = {}) => {
      try {
        const state = await probeChromeAvailability(capability, params);
        setChromeAvailability((prev) => ({ ...prev, [capability]: state }));
        return state;
      } catch (err) {
        // Chrome rejected the probe options (e.g. an invalid enum value). That is
        // a caller bug, not an unsupported browser — surface it instead of
        // silently mislabelling the browser as incapable.
        setError(toError(err));
        setChromeAvailability((prev) => ({ ...prev, [capability]: 'unavailable' }));
        return 'unavailable' as ChromeAIAvailability;
      }
    },
    [],
  );

  const requestChromeDownload = useCallback(
    async (capability: ChromeCapability, params: ChromeCapabilityParams = {}) => {
      setDownloadingCapability(capability);
      setChromeDownloadProgress({ capability, progress: 0 });
      setError(null);
      try {
        const state = await downloadChromeModel(capability, params, (progress) =>
          setChromeDownloadProgress({ capability, progress }),
        );
        setChromeAvailability((prev) => ({ ...prev, [capability]: state }));
        // A downloaded model changes which provider resolves. Drop the cached
        // resolutions for this capability so the next resolve re-detects.
        if (capability === 'summarize') summarizerCache.current.clear();
        if (capability === 'translate') translatorCache.current.clear();
        if (capability === 'edit') editEngineCache.current.clear();
        return state;
      } catch (err) {
        setError(toError(err));
        // Re-probe: the download may have failed, or the user may have denied it.
        // The original error is already surfaced, so a failing probe must not mask it.
        const state = await probeOrFallback(capability, params);
        setChromeAvailability((prev) => ({ ...prev, [capability]: state }));
        return state;
      } finally {
        setDownloadingCapability(null);
        setChromeDownloadProgress(null);
      }
    },
    [],
  );

  return {
    resolveSummarizer,
    resolveTranslator,
    resolveEditEngine,
    resolveFillMask,
    resolution,
    isResolving,
    error,
    chromeAvailability,
    refreshChromeAvailability,
    requestChromeDownload,
    chromeDownloadProgress,
    downloadingCapability,
  };
}
