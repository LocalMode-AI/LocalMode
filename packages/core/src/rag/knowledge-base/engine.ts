/**
 * @file engine.ts
 * @description Provider-agnostic core implementation of the frozen
 * {@link KnowledgeBaseEngine} contract: chunk (`recursiveChunk` /
 * `semanticChunk` / off) → `streamEmbedMany` → typed-metadata `createVectorDB`
 * (memory storage by default, per-session); search = `embed` + `db.search`
 * returning vector-ranked results only (a caller may add its own rerank stage);
 * ask = retrieve → grounded prompt → `streamText` with `<think>…</think>`
 * reasoning tags stripped.
 *
 * Zero React and zero provider dependency: the embedding model and the ask
 * language model are **injected** — the engine constructs no `transformers.*`
 * (or any provider) instance, so `@localmode/core` gains RAG-engine surface but
 * no new runtime dependency. Callers own model creation and any device
 * pre-probe (e.g. the WebGPU adapter probe) inside `getLanguageModel`.
 *
 * Lazy singletons live in the engine closure: the VectorDB is created on the
 * first call that has a real embedding in hand (its length fixes the
 * collection's dimensionality); the ask language model is resolved (and
 * therefore loaded) only when `ask()` first runs. Engine switches /
 * embedding-model switches re-ingest from the raw-document store, per the
 * knowledge base session contract.
 */

import { createVectorDB } from '../../db.js';
import { embed, streamEmbedMany } from '../../embeddings/embed.js';
import { streamText } from '../../generation/stream-text.js';
import { recursiveChunk, semanticChunk } from '../chunkers/index.js';
import type { EmbeddingModel } from '../../embeddings/types.js';
import type { LanguageModel } from '../../generation/types.js';
import type { StorageAdapter } from '../../storage/types.js';
import type { Chunk } from '../types.js';
import type { TypedFilterQuery, VectorDB } from '../../types.js';

import type {
  AskOptions,
  AskResult,
  ChunkMetadata,
  IngestOptions,
  KBSearchResult,
  KnowledgeBaseEngine,
  RawDocument,
  SearchOptions,
} from './types.js';

/* ────────────────────────────── defaults ─────────────────────────────── */

/** Default generation budget for grounded answers. */
const DEFAULT_ASK_MAX_TOKENS = 256;

/** Default sampling temperature — grounded answers should stick to sources. */
const DEFAULT_ASK_TEMPERATURE = 0.2;

/** Default retrieval depth when `AskOptions.topK` is omitted. */
const DEFAULT_ASK_TOP_K = 4;

/** Default per-source character cap in the ask prompt. */
const DEFAULT_MAX_SOURCE_CHARS = 1500;

/** Default system prompt grounding the model on the numbered sources. */
const DEFAULT_ASK_SYSTEM_PROMPT =
  'You answer questions using ONLY the numbered sources provided. ' +
  'Cite sources by number like [1] or [2]. ' +
  'If the sources do not contain the answer, say you cannot find it in the knowledge base. ' +
  'Be concise.';

const THINK_OPEN = '<think>';
const THINK_CLOSE = '</think>';

/* ──────────────────────── reasoning-tag stripping ─────────────────────── */

/**
 * Strips `<think>…</think>` reasoning from generated text: paired blocks,
 * an orphan closing tag (some chat templates drop the opening tag — everything
 * before the close is reasoning), and an unterminated opening tag (the block
 * is still streaming — everything after the open is reasoning).
 */
function stripReasoning(text: string): string {
  let out = text.replace(/<think>[\s\S]*?<\/think>/g, '');
  const lastClose = out.lastIndexOf(THINK_CLOSE);
  if (lastClose !== -1) out = out.slice(lastClose + THINK_CLOSE.length);
  const open = out.indexOf(THINK_OPEN);
  if (open !== -1) out = out.slice(0, open);
  return out;
}

/**
 * Length of the longest suffix of `text` that is a proper prefix of a think
 * tag. Streamed deltas hold this tail back so a tag split across chunk
 * boundaries is never emitted to `onToken`.
 */
function partialThinkTagSuffix(text: string): number {
  for (const tag of [THINK_CLOSE, THINK_OPEN]) {
    const max = Math.min(tag.length - 1, text.length);
    for (let len = max; len > 0; len--) {
      if (text.endsWith(tag.slice(0, len))) return len;
    }
  }
  return 0;
}

/**
 * Wraps an `onToken` callback with a stateful think-tag filter: tokens are
 * re-derived from the cumulative stripped text so reasoning never streams to
 * the UI, and emission is append-only (monotonic). The final answer is always
 * re-stripped from the full text, so streamed view and answer agree.
 */
function createThinkFilteredEmitter(onToken: (text: string) => void) {
  let raw = '';
  let emittedText = '';
  return (chunkText: string) => {
    raw += chunkText;
    let visible = stripReasoning(raw);
    visible = visible.slice(0, visible.length - partialThinkTagSuffix(visible));
    // Append-only: emit only when the already-emitted prefix is unchanged
    // (an orphan </think> arriving after emission shrinks `visible`; the
    // final answer is re-stripped from the full text either way).
    if (visible.length > emittedText.length && visible.startsWith(emittedText)) {
      onToken(visible.slice(emittedText.length));
      emittedText = visible;
    }
  };
}

/* ─────────────────────────── page attribution ─────────────────────────── */

interface PageOffset {
  page: number;
  start: number;
}

/**
 * Locates each PDF page's start offset within `doc.text` by anchoring on a
 * short prefix of the page text (robust to whatever page separator the
 * extractor inserted). Pages whose anchor cannot be found are skipped.
 */
function buildPageOffsets(doc: RawDocument): PageOffset[] {
  if (!doc.pages || doc.pages.length === 0) return [];
  const offsets: PageOffset[] = [];
  let searchFrom = 0;
  for (const { page, text } of doc.pages) {
    const anchor = text.trim().slice(0, 64);
    if (!anchor) continue;
    const at = doc.text.indexOf(anchor, searchFrom);
    if (at === -1) continue;
    offsets.push({ page, start: at });
    searchFrom = at + anchor.length;
  }
  return offsets;
}

/**
 * Returns the 1-based page a chunk starts on: the last page whose start
 * offset is ≤ the chunk's absolute start (falling back to the first located
 * page for content before the first anchor).
 */
function pageForOffset(offsets: PageOffset[], absStart: number): number | undefined {
  let current: number | undefined;
  for (const { page, start } of offsets) {
    if (start <= absStart) current = page;
    else break;
  }
  return current ?? offsets[0]?.page;
}

/* ─────────────────────────────── chunking ─────────────────────────────── */

/**
 * Chunks one raw document per the active mode:
 * - `'off'` — the whole text as a single chunk;
 * - `'recursive'` — core `recursiveChunk` with the caller's size/overlap
 *   (falling back to `chunkDefaults`, then to core's own 500/50 defaults);
 * - `'semantic'` — core `semanticChunk` with the engine's embedding model
 *   (derives its own windows per the contract; size/overlap do not apply).
 */
async function chunkDocument(
  doc: RawDocument,
  opts: IngestOptions,
  model: EmbeddingModel,
  chunkDefaults: { chunkSize?: number; chunkOverlap?: number },
): Promise<Chunk[]> {
  if (!doc.text.trim()) return [];
  switch (opts.chunking) {
    case 'off':
      return [{ text: doc.text, start: 0, end: doc.text.length, index: 0 }];
    case 'recursive': {
      const size = opts.chunkSize ?? chunkDefaults.chunkSize;
      const overlap = opts.chunkOverlap ?? chunkDefaults.chunkOverlap;
      return recursiveChunk(doc.text, {
        ...(size !== undefined ? { size } : {}),
        ...(overlap !== undefined ? { overlap } : {}),
      });
    }
    case 'semantic':
      return semanticChunk({
        text: doc.text,
        model,
        ...(opts.abortSignal ? { abortSignal: opts.abortSignal } : {}),
      });
  }
}

/* ─────────────────────────── prompt building ──────────────────────────── */

/** Builds the grounded ask prompt: numbered sources then the question. */
function buildAskPrompt(
  question: string,
  sources: KBSearchResult[],
  maxSourceChars: number,
): string {
  const numbered =
    sources.length === 0
      ? '(no sources indexed)'
      : sources
          .map((s, i) => {
            const meta = s.metadata;
            const where = meta.page !== undefined ? ` (page ${meta.page})` : '';
            const text =
              meta.text.length > maxSourceChars
                ? `${meta.text.slice(0, maxSourceChars)}…`
                : meta.text;
            return `[${i + 1}] ${meta.docTitle}${where}\n${text}`;
          })
          .join('\n\n');
  return `Sources:\n${numbered}\n\nQuestion: ${question}\n\nAnswer:`;
}

/* ────────────────────────────── options ──────────────────────────────── */

/** Overridable generation parameters for {@link KnowledgeBaseEngine.ask}. */
export interface KnowledgeBaseAskConfig {
  /** System prompt grounding the model on the numbered sources. */
  systemPrompt?: string;
  /** Generation budget (default `256`). */
  maxTokens?: number;
  /** Sampling temperature (default `0.2`). */
  temperature?: number;
  /** Retrieval depth when `AskOptions.topK` is omitted (default `4`). */
  topK?: number;
  /** Per-source character cap in the ask prompt (default `1500`). */
  maxSourceChars?: number;
}

/** Default chunking sizes applied when `IngestOptions` omits them. */
export interface KnowledgeBaseChunkDefaults {
  /** Recursive-chunker size in characters. */
  chunkSize?: number;
  /** Recursive-chunker overlap in characters. */
  chunkOverlap?: number;
}

/** Options for {@link createKnowledgeBaseEngine}. */
export interface CreateKnowledgeBaseEngineOptions {
  /**
   * The embedding model that defines the corpus space. Switching models means
   * a new engine + a re-ingest of the raw-document store (per the session
   * contract), so a single engine instance is bound to one embedding space.
   */
  embeddingModel: EmbeddingModel;
  /**
   * Lazy factory for the grounded-answer language model. Called (and awaited)
   * only when `ask()` first runs, so nothing loads on construction. The caller
   * owns model creation and any device pre-probe (e.g. resolving `device` via
   * a WebGPU adapter probe before constructing a provider model). Resolved once
   * per engine and reused; a rejection is not cached (a later `ask()` retries).
   */
  getLanguageModel: () => Promise<LanguageModel> | LanguageModel;
  /**
   * VectorDB storage backend (default `'memory'` — an in-memory session store,
   * matching the reference knowledge base block). Accepts `'memory'`,
   * `'indexeddb'`, or a custom `StorageAdapter`.
   */
  storage?: 'memory' | 'indexeddb' | StorageAdapter;
  /** Default chunking sizes applied when `IngestOptions` omits them. */
  chunkDefaults?: KnowledgeBaseChunkDefaults;
  /** Overridable ask-time generation parameters. */
  askConfig?: KnowledgeBaseAskConfig;
}

/* ────────────────────────────── the engine ────────────────────────────── */

/**
 * Creates the provider-agnostic core `KnowledgeBaseEngine` (`kind: 'core'`).
 *
 * The pipeline uses only existing `@localmode/core` exports — `recursiveChunk`
 * / `semanticChunk`, `streamEmbedMany`, `embed`, `createVectorDB`, `streamText`
 * — and adds no runtime dependency to core. Models are injected: the caller
 * constructs the embedding model and (lazily) the answer model, so core never
 * imports a provider.
 *
 * Self-contained lazy singletons, created on first use only (nothing loads on
 * construction, preserving the no-model-download-on-page-load invariant):
 * - **VectorDB** — `createVectorDB<ChunkMetadata>` over the configured storage
 *   (default in-memory) with a per-embedding-model collection name; dimensions
 *   are resolved from the model's first real embedding output (exact for any
 *   model, unlike an id-based estimate);
 * - **language model** — resolved via `getLanguageModel()` only when `ask()`
 *   first runs.
 *
 * `search()` returns vector-ranked results only — a caller may add its own
 * rerank stage (applying its own over-fetch factor).
 *
 * @param options - See {@link CreateKnowledgeBaseEngineOptions}.
 * @returns A {@link KnowledgeBaseEngine} bound to the given embedding space.
 * @throws Propagates errors from the injected models, the VectorDB, and
 * `streamText` (e.g. a failed model load or an aborted run).
 * @see {@link KnowledgeBaseEngine} for the contract both engines implement.
 * @see `createLangChainKnowledgeBaseEngine` in `@localmode/langchain` for the
 * result-equivalent LangChain-adapter implementation.
 *
 * @example
 * ```ts
 * import { createKnowledgeBaseEngine } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * const engine = createKnowledgeBaseEngine({
 *   embeddingModel: transformers.embedding('Xenova/bge-small-en-v1.5'),
 *   getLanguageModel: () => transformers.languageModel('onnx-community/granite-4.0-350m-ONNX-web'),
 * });
 * await engine.ingest(docs, { chunking: 'recursive', chunkSize: 500 });
 * const hits = await engine.search('privacy and encryption', { topK: 10 });
 * const { answer, sources } = await engine.ask('What is encrypted?');
 * ```
 */
export function createKnowledgeBaseEngine(
  options: CreateKnowledgeBaseEngineOptions,
): KnowledgeBaseEngine {
  const { embeddingModel, getLanguageModel, storage = 'memory' } = options;
  const chunkDefaults = options.chunkDefaults ?? {};
  const askConfig = options.askConfig ?? {};

  const askSystemPrompt = askConfig.systemPrompt ?? DEFAULT_ASK_SYSTEM_PROMPT;
  const askMaxTokens = askConfig.maxTokens ?? DEFAULT_ASK_MAX_TOKENS;
  const askTemperature = askConfig.temperature ?? DEFAULT_ASK_TEMPERATURE;
  const askDefaultTopK = askConfig.topK ?? DEFAULT_ASK_TOP_K;
  const maxSourceChars = askConfig.maxSourceChars ?? DEFAULT_MAX_SOURCE_CHARS;

  /**
   * Lazy language-model singleton — resolved once via `getLanguageModel()`,
   * reused across `ask()` calls, and NOT cached on failure so a transient
   * error (e.g. a failed load) does not poison every later ask.
   */
  let languageModelPromise: Promise<LanguageModel> | null = null;
  const resolveLanguageModel = (): Promise<LanguageModel> => {
    if (!languageModelPromise) {
      const promise = Promise.resolve().then(() => getLanguageModel());
      promise.catch(() => {
        if (languageModelPromise === promise) languageModelPromise = null;
      });
      languageModelPromise = promise;
    }
    return languageModelPromise;
  };

  /** Lazy VectorDB singleton; created on the first call that has a real
   * embedding in hand (its length fixes the collection's dimensionality). The
   * collection name is derived verbatim from the reference block (storage-
   * identifier-stability: a later switch to persistent storage keeps existing
   * data). */
  let dbPromise: Promise<VectorDB<ChunkMetadata>> | null = null;
  let resolvedDimensions: number | null = null;

  /** Per-doc indexed-chunk counts (drives `stats().documents`). */
  const chunkCounts = new Map<string, number>();

  const getDb = (dimensions: number): Promise<VectorDB<ChunkMetadata>> => {
    if (!dbPromise) {
      resolvedDimensions = dimensions;
      const promise = createVectorDB<ChunkMetadata>({
        name: `blocks-kb-core-${embeddingModel.modelId.replace(/[^a-zA-Z0-9._-]+/g, '-')}`,
        dimensions,
        storage,
      });
      // Allow retry instead of caching a rejected DB forever.
      promise.catch(() => {
        if (dbPromise === promise) dbPromise = null;
      });
      dbPromise = promise;
    }
    return dbPromise;
  };

  const search = async (query: string, searchOptions: SearchOptions): Promise<KBSearchResult[]> => {
    const { topK, filter, minScore, abortSignal } = searchOptions;
    abortSignal?.throwIfAborted();

    const { embedding } = await embed({
      model: embeddingModel,
      value: query,
      ...(abortSignal ? { abortSignal } : {}),
    });
    abortSignal?.throwIfAborted();

    const db = await getDb(embedding.length);
    abortSignal?.throwIfAborted();

    const results = await db.search(embedding, {
      k: topK,
      ...(filter ? { filter: filter as TypedFilterQuery<ChunkMetadata> } : {}),
      ...(minScore !== undefined ? { threshold: minScore } : {}),
    });

    // The engine always writes full ChunkMetadata with every vector, so
    // `metadata` is present on every hit.
    return results.map((r) => ({
      id: r.id,
      score: r.score,
      metadata: r.metadata as ChunkMetadata,
    }));
  };

  return {
    kind: 'core',

    async ingest(docs, ingestOptions) {
      const { onProgress, abortSignal } = ingestOptions;
      abortSignal?.throwIfAborted();
      if (docs.length === 0) return { chunks: 0 };

      const model = embeddingModel;

      // ── phase: chunk (per document) ─────────────────────────────────
      onProgress?.({ phase: 'chunk', completed: 0, total: docs.length });
      const perDoc: Array<{ doc: RawDocument; chunks: Chunk[] }> = [];
      for (let i = 0; i < docs.length; i++) {
        abortSignal?.throwIfAborted();
        const doc = docs[i];
        perDoc.push({ doc, chunks: await chunkDocument(doc, ingestOptions, model, chunkDefaults) });
        onProgress?.({ phase: 'chunk', completed: i + 1, total: docs.length });
      }

      // Flatten into pending records with full ChunkMetadata (page
      // attribution: the chunk's start offset — chunkers report positions
      // relative to the leading-trimmed text, hence the lead offset — is
      // located within the doc's page-offset table).
      const pending: Array<{ id: string; metadata: ChunkMetadata }> = [];
      const texts: string[] = [];
      for (const { doc, chunks } of perDoc) {
        const pageOffsets = doc.source === 'pdf' ? buildPageOffsets(doc) : [];
        const leadOffset = doc.text.length - doc.text.trimStart().length;
        chunks.forEach((chunk, i) => {
          const page =
            pageOffsets.length > 0 ? pageForOffset(pageOffsets, chunk.start + leadOffset) : undefined;
          pending.push({
            id: `${doc.id}:${i}`,
            metadata: {
              docId: doc.id,
              docTitle: doc.title,
              chunkIndex: i,
              text: chunk.text,
              source: doc.source,
              ...(doc.category !== undefined ? { category: doc.category } : {}),
              ...(page !== undefined ? { page } : {}),
            },
          });
          texts.push(chunk.text);
        });
      }

      // ── phase: embed (batched, abortable, per-batch progress) ───────
      const vectors = new Array<Float32Array>(texts.length);
      if (texts.length > 0) {
        onProgress?.({ phase: 'embed', completed: 0, total: texts.length });
        for await (const { embedding, index } of streamEmbedMany({
          model,
          values: texts,
          ...(abortSignal ? { abortSignal } : {}),
          onBatch: ({ index, count, total }) =>
            onProgress?.({ phase: 'embed', completed: index + count, total }),
        })) {
          vectors[index] = embedding;
        }
      }
      abortSignal?.throwIfAborted();

      // ── phase: store (replace-then-add; re-ingest safe) ─────────────
      onProgress?.({ phase: 'store', completed: 0, total: pending.length });
      // No DB yet AND nothing to store → nothing to delete either.
      if (pending.length > 0 || dbPromise) {
        const db = pending.length > 0 ? await getDb(vectors[0].length) : await dbPromise!;
        for (const { doc, chunks } of perDoc) {
          abortSignal?.throwIfAborted();
          // Drop any previously-indexed chunks for this doc (re-ingest).
          await db.deleteWhere({ docId: doc.id });
          if (chunks.length > 0) chunkCounts.set(doc.id, chunks.length);
          else chunkCounts.delete(doc.id);
        }
        abortSignal?.throwIfAborted();
        if (pending.length > 0) {
          // Note: `addMany` has no abortSignal; aborts are honored between
          // phases and per-doc above.
          await db.addMany(
            pending.map((p, i) => ({ id: p.id, vector: vectors[i], metadata: p.metadata })),
            {
              onProgress: (completed, total) =>
                onProgress?.({ phase: 'store', completed, total }),
            },
          );
        }
      }

      return { chunks: pending.length };
    },

    search,

    async ask(question, askOptions?: AskOptions): Promise<AskResult> {
      const { topK = askDefaultTopK, onToken, abortSignal } = askOptions ?? {};
      abortSignal?.throwIfAborted();

      // Retrieve grounding chunks (vector-ranked; best-first).
      const sources = await search(question, {
        topK,
        ...(abortSignal ? { abortSignal } : {}),
      });
      abortSignal?.throwIfAborted();

      // The language model is resolved (and therefore loaded) only here — the
      // first ask() triggers the model download, never page load / ingest.
      const model = await resolveLanguageModel();
      const prompt = buildAskPrompt(question, sources, maxSourceChars);

      const started = performance.now();
      const result = await streamText({
        model,
        prompt,
        systemPrompt: askSystemPrompt,
        maxTokens: askMaxTokens,
        temperature: askTemperature,
        ...(abortSignal ? { abortSignal } : {}),
      });
      // streamText is consumption-driven: its wrapped stream is a lazy async
      // generator, so generation — including the lazy first-use model
      // download — runs ONLY while `result.stream` is iterated, and both
      // `result.text` and `onChunk` settle/fire from inside that iteration.
      // Awaiting `result.text` without draining the stream therefore hangs
      // forever with zero network activity. Drain the stream here, feeding the
      // think-tag-filtered emitter as deltas arrive.
      //
      // The drained stream is the single consumption channel: on a cancel or
      // generation failure `result.text`/`result.usage` reject with the SAME
      // error the drain loop throws, so attach no-op handlers to keep that
      // duplicate channel from also surfacing as an unhandled promise
      // rejection. The error itself still propagates from the loop below.
      result.text.catch(() => undefined);
      result.usage.catch(() => undefined);
      const emit = onToken ? createThinkFilteredEmitter(onToken) : null;
      let raw = '';
      for await (const chunk of result.stream) {
        raw += chunk.text;
        emit?.(chunk.text);
      }
      const durationMs = performance.now() - started;

      return { answer: stripReasoning(raw).trim(), sources, durationMs };
    },

    async removeDocument(docId) {
      chunkCounts.delete(docId);
      if (!dbPromise) return; // Nothing indexed yet — nothing to remove.
      const db = await dbPromise;
      await db.deleteWhere({ docId });
    },

    async clear() {
      chunkCounts.clear();
      if (!dbPromise) return;
      const db = await dbPromise;
      await db.clear();
    },

    async stats() {
      if (!dbPromise) {
        // Nothing indexed yet: report the model's declared dimensionality
        // (id-based estimate until the first embedding fixes it exactly).
        return { documents: 0, chunks: 0, dimensions: embeddingModel.dimensions };
      }
      const db = await dbPromise;
      const { count } = await db.stats();
      return {
        documents: chunkCounts.size,
        chunks: count,
        dimensions: resolvedDimensions ?? embeddingModel.dimensions,
      };
    },
  };
}
