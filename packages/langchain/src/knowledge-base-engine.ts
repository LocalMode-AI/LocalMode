/**
 * LangChain-adapter implementation of the frozen `KnowledgeBaseEngine`
 * contract from `@localmode/core`.
 *
 * The pipeline runs through the real `@localmode/langchain` adapters:
 *
 * - `LocalModeEmbeddings` over an injected core `EmbeddingModel`
 *   (LangChain `Embeddings` — `embedDocuments()` / `embedQuery()`).
 * - `LocalModeVectorStore` over a session-scoped in-memory `createVectorDB`
 *   (LangChain `VectorStore` — `addDocuments()` / `similaritySearchWithScore()`).
 * - An injected `ChatLocalMode` for grounded answers, resolved lazily on first
 *   `ask()` (the caller owns the device pre-probe + model construction).
 *
 * Models are **injected**, so the `@localmode/langchain` package gains no
 * provider dependency: consumers who never toggle the LangChain engine never
 * pull it, and this file constructs no `transformers.*`.
 *
 * Adapter gaps and how this engine bridges them:
 *
 * - **Ids**: `LocalModeVectorStore.addVectors()` generates its own
 *   `crypto.randomUUID()` vector ids and ignores `Document.id`. The contract
 *   ids (`${docId}:${chunkIndex}`) are therefore carried in `ChunkMetadata`
 *   (`docId` + `chunkIndex`) and `KBSearchResult.id` is reconstructed from
 *   metadata at search time.
 * - **Delete / clear / stats**: the LangChain `VectorStore` surface exposes
 *   none of them usefully, so the engine keeps the `VectorDB` handle it
 *   constructed and calls `db.deleteWhere({ docId })`, `db.clear()`, and
 *   `db.stats()` directly.
 * - **AbortSignal**: neither `Embeddings.embedDocuments()` nor
 *   `VectorStore.addDocuments()` accept a signal, so ingest cancellation is
 *   honored *between* embed batches (see `EMBED_BATCH_SIZE`), not mid-batch.
 *   An aborted ingest may leave the in-flight document partially indexed;
 *   re-ingesting heals it (every ingest `deleteWhere`s the doc's chunks first).
 * - **Progress**: `addDocuments()` embeds + stores atomically with no progress
 *   callback, so phases are approximated per document: `chunk` after
 *   splitting, `embed` when the doc's batches start, `store` when they finish.
 *
 * **Scoring**: `similaritySearchWithScore()` passes `db.search()`'s `score`
 * straight through, and `db.search()` returns cosine similarity in [0, 1]
 * (higher = more similar) — the exact value the core engine surfaces from its
 * own `db.search()`. Scores are therefore passed through unchanged; no
 * normalization is needed for cross-engine result equivalence.
 *
 * **Chunking**: `@langchain/textsplitters` is not a dependency, so `recursive`
 * mode uses a faithful local port of LangChain's `RecursiveCharacterTextSplitter`
 * algorithm (same default separators `["\n\n", "\n", " ", ""]`,
 * `keepSeparator: true` lookahead splitting, and merge/overlap semantics).
 * Defaults mirror the core engine (size 500 / overlap 50) so both engines
 * behave identically when the caller omits sizes.
 *
 * @packageDocumentation
 */

import { createVectorDB } from '@localmode/core';
import type {
  EmbeddingModel,
  StorageAdapter,
  VectorDB,
  // Verbatim contract names.
  KnowledgeBaseEngine,
  RawDocument,
  KBSearchResult,
  AskOptions,
  AskResult,
  EngineStats,
  ChunkingMode,
  // The three contract types whose names collide with core's RAG/VectorDB
  // exports are re-exported from the core barrel under `KnowledgeBase*`
  // aliases; re-alias them locally to the contract names.
  KnowledgeBaseChunkMetadata as ChunkMetadata,
  KnowledgeBaseIngestOptions as IngestOptions,
  KnowledgeBaseSearchOptions as SearchOptions,
} from '@localmode/core';

import { LocalModeEmbeddings } from './embeddings.js';
import { LocalModeVectorStore } from './vector-store.js';
import { ChatLocalMode } from './chat-model.js';

/* ────────────────────────────── constants ────────────────────────────── */

/** Contract default when `AskOptions.topK` is omitted. */
const DEFAULT_ASK_TOP_K = 4;

/**
 * Grounding system prompt — same template shape as the core engine / the
 * absorbed langchain-rag showcase app.
 */
const DEFAULT_GROUNDING_SYSTEM_PROMPT =
  'You are a helpful assistant that answers questions based only on the provided context. ' +
  'If the context does not contain enough information to answer, say so honestly. ' +
  'Be concise and accurate.';

/** Mirrors core `DEFAULT_CHUNK_OPTIONS.size` so engine defaults agree. */
const DEFAULT_CHUNK_SIZE = 500;

/** Mirrors core `DEFAULT_CHUNK_OPTIONS.overlap` so engine defaults agree. */
const DEFAULT_CHUNK_OVERLAP = 50;

/** LangChain `RecursiveCharacterTextSplitter` default separators. */
const RECURSIVE_SEPARATORS = ['\n\n', '\n', ' ', ''];

/**
 * Chunks per `addDocuments()` call. The LangChain `Embeddings` interface has
 * no AbortSignal, so cancellation is only honored between batches — small
 * batches keep large-document ingests responsive to abort.
 */
const EMBED_BATCH_SIZE = 32;

/* ─────────────────── recursive splitter (LangChain port) ─────────────────── */

/** Escape a literal separator for use inside a RegExp (as upstream does). */
function escapeRegExp(value: string): string {
  return value.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
}

/**
 * `keepSeparator: true` split (upstream default): a lookahead split keeps each
 * separator attached to the *following* fragment, so merged chunks remain
 * contiguous substrings of the source text (which page attribution relies on).
 */
function splitOnSeparator(text: string, separator: string): string[] {
  const splits = separator
    ? text.split(new RegExp(`(?=${escapeRegExp(separator)})`))
    : text.split('');
  return splits.filter((s) => s !== '');
}

/** Join accumulated fragments into a chunk; `null` when it trims to nothing. */
function joinFragments(fragments: string[], separator: string): string | null {
  const text = fragments.join(separator).trim();
  return text === '' ? null : text;
}

/**
 * Faithful port of `TextSplitter.mergeSplits` from `@langchain/textsplitters`:
 * greedily pack fragments up to `chunkSize`, then pop from the front until at
 * most `chunkOverlap` characters carry over into the next chunk.
 */
function mergeSplits(
  splits: string[],
  separator: string,
  chunkSize: number,
  chunkOverlap: number,
): string[] {
  const chunks: string[] = [];
  const current: string[] = [];
  let total = 0;

  for (const fragment of splits) {
    const length = fragment.length;
    if (total + length + current.length * separator.length > chunkSize && current.length > 0) {
      const joined = joinFragments(current, separator);
      if (joined !== null) chunks.push(joined);
      // Keep popping while we exceed the overlap budget, or while adding the
      // next fragment would still overflow the chunk size.
      while (
        total > chunkOverlap ||
        (total + length + current.length * separator.length > chunkSize && total > 0)
      ) {
        total -= current[0].length;
        current.shift();
      }
    }
    current.push(fragment);
    total += length;
  }

  const joined = joinFragments(current, separator);
  if (joined !== null) chunks.push(joined);
  return chunks;
}

/**
 * Faithful port of `RecursiveCharacterTextSplitter._splitText`: pick the first
 * separator present in the text, split on it, merge small fragments, and
 * recurse into finer separators for oversized fragments.
 */
function recursiveSplit(
  text: string,
  separators: string[],
  chunkSize: number,
  chunkOverlap: number,
): string[] {
  const finalChunks: string[] = [];

  let separator = separators[separators.length - 1] ?? '';
  let nextSeparators: string[] | undefined;
  for (let i = 0; i < separators.length; i += 1) {
    const candidate = separators[i];
    if (candidate === '') {
      separator = candidate;
      break;
    }
    if (text.includes(candidate)) {
      separator = candidate;
      nextSeparators = separators.slice(i + 1);
      break;
    }
  }

  const splits = splitOnSeparator(text, separator);
  let goodSplits: string[] = [];
  // keepSeparator ⇒ separators already ride along on fragments; merge with ''.
  const mergeSeparator = '';

  for (const split of splits) {
    if (split.length < chunkSize) {
      goodSplits.push(split);
    } else {
      if (goodSplits.length > 0) {
        finalChunks.push(...mergeSplits(goodSplits, mergeSeparator, chunkSize, chunkOverlap));
        goodSplits = [];
      }
      if (!nextSeparators) {
        finalChunks.push(split);
      } else {
        finalChunks.push(...recursiveSplit(split, nextSeparators, chunkSize, chunkOverlap));
      }
    }
  }

  if (goodSplits.length > 0) {
    finalChunks.push(...mergeSplits(goodSplits, mergeSeparator, chunkSize, chunkOverlap));
  }

  return finalChunks;
}

/** Split a document's text per the requested chunking mode. */
function chunkText(
  text: string,
  mode: ChunkingMode,
  chunkSize: number,
  chunkOverlap: number,
): string[] {
  const trimmed = text.trim();
  if (trimmed === '') return [];
  if (mode === 'off') return [trimmed];
  // 'semantic': LangChain has no local semantic splitter — recursive fallback
  // is an accepted engine-level difference (equivalence is defined at the
  // result level, not byte-for-byte chunk parity).
  return recursiveSplit(trimmed, RECURSIVE_SEPARATORS, chunkSize, chunkOverlap);
}

/* ────────────────────────── page attribution ────────────────────────── */

/** Character offset in `doc.text` where each PDF page begins. */
interface PageStart {
  page: number;
  start: number;
}

/**
 * Locate each page's start offset inside the concatenated `doc.text` by
 * probing with a prefix of the page's own text (robust to whatever page
 * separator the PDF lane inserted between pages).
 */
function computePageStarts(doc: RawDocument): PageStart[] | null {
  if (!doc.pages || doc.pages.length === 0) return null;
  const starts: PageStart[] = [];
  let cursor = 0;
  for (const { page, text } of doc.pages) {
    const probe = text.trim().slice(0, 80);
    const at = probe ? doc.text.indexOf(probe, cursor) : -1;
    const start = at === -1 ? cursor : at;
    starts.push({ page, start });
    cursor = start + Math.max(probe.length, 1);
  }
  return starts;
}

/** 1-based page a chunk starting at `offset` belongs to (last page ≤ offset). */
function pageForOffset(starts: PageStart[], offset: number): number {
  let page = starts[0].page;
  for (const s of starts) {
    if (s.start <= offset) page = s.page;
    else break;
  }
  return page;
}

/* ────────────────────────────── helpers ────────────────────────────── */

/**
 * Strip `<think>…</think>` reasoning blocks (plus any unterminated trailing
 * block from an aborted/truncated stream) — same cleanup the core engine
 * applies to grounded answers.
 */
function stripReasoningTags(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>\s*/g, '')
    .replace(/<think>[\s\S]*$/, '')
    .trim();
}

/**
 * Map a `similaritySearchWithScore` pair back to a `KBSearchResult`. The
 * adapter moves stored `metadata.text` into `pageContent` on read, so the
 * `ChunkMetadata` is reassembled from both; the cast is safe because only this
 * engine writes to its session store (every record carries `ChunkMetadata`).
 * The contract id is reconstructed as `${docId}:${chunkIndex}` because the
 * adapter's internal vector ids are random UUIDs (see file header).
 */
function toKBSearchResult(
  document: { pageContent: string; metadata: Record<string, unknown> },
  score: number,
): KBSearchResult {
  const metadata = { ...document.metadata, text: document.pageContent } as ChunkMetadata;
  return {
    id: `${metadata.docId}:${metadata.chunkIndex}`,
    // Pass-through: cosine similarity in [0, 1] straight from `db.search()`,
    // identical semantics to the core engine's scores (see file header).
    score,
    metadata,
  };
}

/** One chunk prepared for `addDocuments` (LangChain `DocumentInterface` shape). */
interface PreparedChunk {
  id: string;
  pageContent: string;
  metadata: ChunkMetadata;
}

/**
 * Attach `ChunkMetadata` (with page attribution) to a document's chunk texts.
 * Chunks are contiguous (possibly trimmed) substrings of `doc.text`, located
 * in order with a moving `indexOf` cursor — advanced by one, not past the end,
 * because overlapping chunks start *after* the previous chunk's start but
 * before its end.
 */
function buildChunkDocuments(doc: RawDocument, chunkTexts: string[]): PreparedChunk[] {
  const pageStarts = computePageStarts(doc);
  let searchFrom = 0;

  return chunkTexts.map((text, chunkIndex) => {
    let page: number | undefined;
    if (pageStarts) {
      const at = doc.text.indexOf(text, searchFrom);
      const start = at === -1 ? searchFrom : at;
      if (at !== -1) searchFrom = at + 1;
      page = pageForOffset(pageStarts, start);
    }

    const metadata: ChunkMetadata = {
      docId: doc.id,
      docTitle: doc.title,
      chunkIndex,
      text,
      source: doc.source,
      ...(doc.category !== undefined ? { category: doc.category } : {}),
      ...(page !== undefined ? { page } : {}),
    };

    // `id` follows the contract derivation; the adapter currently ignores it
    // (generates its own UUIDs) but honoring it later would be a strict upgrade.
    return { id: `${doc.id}:${chunkIndex}`, pageContent: text, metadata };
  });
}

/* ────────────────────────────── options ──────────────────────────────── */

/** Overridable ask-time parameters for the LangChain engine. */
export interface LangChainKnowledgeBaseAskConfig {
  /** System prompt grounding the model on the provided context. */
  systemPrompt?: string;
  /** Retrieval depth when `AskOptions.topK` is omitted (default `4`). */
  topK?: number;
}

/** Default chunking sizes applied when `IngestOptions` omits them. */
export interface LangChainKnowledgeBaseChunkDefaults {
  /** Recursive-chunker size in characters (default `500`). */
  chunkSize?: number;
  /** Recursive-chunker overlap in characters (default `50`). */
  chunkOverlap?: number;
}

/** Options for {@link createLangChainKnowledgeBaseEngine}. */
export interface CreateLangChainKnowledgeBaseEngineOptions {
  /**
   * The embedding model that defines the corpus space, wrapped internally in a
   * `LocalModeEmbeddings`. Switching models means a new engine + a re-ingest of
   * the raw-document store (per the knowledge base session contract).
   */
  embeddingModel: EmbeddingModel;
  /**
   * Lazy factory for the grounded-answer chat model. Called (and awaited) only
   * when `ask()` first runs, so nothing loads on construction. The caller owns
   * model creation, any device pre-probe, and the `ChatLocalMode` generation
   * budget (`maxTokens` / `temperature`). Resolved once per engine and reused;
   * a rejection is not cached (a later `ask()` retries).
   */
  getChatModel: () => Promise<ChatLocalMode> | ChatLocalMode;
  /**
   * VectorDB storage backend (default `'memory'` — an in-memory session store).
   * Accepts `'memory'`, `'indexeddb'`, or a custom `StorageAdapter`.
   */
  storage?: 'memory' | 'indexeddb' | StorageAdapter;
  /** Default chunking sizes applied when `IngestOptions` omits them. */
  chunkDefaults?: LangChainKnowledgeBaseChunkDefaults;
  /** Overridable ask-time parameters. */
  askConfig?: LangChainKnowledgeBaseAskConfig;
}

/* ─────────────────────────────── engine ─────────────────────────────── */

/**
 * Create the LangChain-adapter implementation of the core `KnowledgeBaseEngine`
 * contract (`kind: 'langchain'`).
 *
 * Self-contained: owns a session-scoped in-memory VectorDB wrapped by
 * `LocalModeVectorStore`, a `LocalModeEmbeddings` over the injected embedding
 * model, and a lazily-resolved `ChatLocalMode` for grounded answers. A
 * knowledge base session re-ingests the raw-document store through this engine
 * on toggle — nothing persists across sessions by default.
 *
 * Result-equivalent to the core `createKnowledgeBaseEngine`: given the same
 * corpus, embedding model, and query, both return the same ranked contract ids
 * and cosine scores (higher-is-better, in `[0, 1]`).
 *
 * @param options - See {@link CreateLangChainKnowledgeBaseEngineOptions}.
 * @returns A {@link KnowledgeBaseEngine} with `kind: 'langchain'`.
 * @throws Propagates errors from the adapters, the injected models, and the
 * VectorDB (e.g. a failed model load or an aborted run).
 * @see `createKnowledgeBaseEngine` in `@localmode/core` for the core-pipeline
 * implementation of the same contract.
 *
 * @example
 * ```ts
 * import { createLangChainKnowledgeBaseEngine, ChatLocalMode } from '@localmode/langchain';
 * import { transformers } from '@localmode/transformers';
 *
 * const engine = createLangChainKnowledgeBaseEngine({
 *   embeddingModel: transformers.embedding('Xenova/bge-small-en-v1.5'),
 *   getChatModel: () =>
 *     new ChatLocalMode({
 *       model: transformers.languageModel('onnx-community/granite-4.0-350m-ONNX-web'),
 *       maxTokens: 512,
 *     }),
 * });
 * await engine.ingest(docs, { chunking: 'recursive', chunkSize: 500 });
 * const hits = await engine.search('privacy and encryption', { topK: 10 });
 * const { answer, sources } = await engine.ask('How is data encrypted?');
 * ```
 */
export function createLangChainKnowledgeBaseEngine(
  options: CreateLangChainKnowledgeBaseEngineOptions,
): KnowledgeBaseEngine {
  const { embeddingModel, getChatModel, storage = 'memory' } = options;
  const chunkDefaults = options.chunkDefaults ?? {};
  const askConfig = options.askConfig ?? {};

  const groundingSystemPrompt = askConfig.systemPrompt ?? DEFAULT_GROUNDING_SYSTEM_PROMPT;
  const askDefaultTopK = askConfig.topK ?? DEFAULT_ASK_TOP_K;

  const embeddings = new LocalModeEmbeddings({ model: embeddingModel });

  /** docId → chunk count for the docs this engine has indexed (drives stats). */
  const chunkCounts = new Map<string, number>();

  /** Lazily-created session stack (db creation is async); reset on failure. */
  let stackPromise: Promise<{ db: VectorDB; store: LocalModeVectorStore }> | null = null;

  function getStack() {
    if (!stackPromise) {
      stackPromise = (async () => {
        const db = await createVectorDB({
          // Collection name derivation preserved verbatim (storage-identifier
          // stability): a random per-session name, matching the reference block.
          name: `kb-langchain-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          dimensions: embeddingModel.dimensions,
          storage,
        });
        const store = new LocalModeVectorStore(embeddings, { db });
        return { db, store };
      })().catch((error: unknown) => {
        stackPromise = null;
        throw error;
      });
    }
    return stackPromise;
  }

  /** Lazy chat-model singleton — resolved once, reused, not cached on failure. */
  let chatModelPromise: Promise<ChatLocalMode> | null = null;
  function resolveChatModel(): Promise<ChatLocalMode> {
    if (!chatModelPromise) {
      const promise = Promise.resolve().then(() => getChatModel());
      promise.catch(() => {
        if (chatModelPromise === promise) chatModelPromise = null;
      });
      chatModelPromise = promise;
    }
    return chatModelPromise;
  }

  async function search(query: string, searchOptions: SearchOptions): Promise<KBSearchResult[]> {
    const { topK, filter, minScore, abortSignal } = searchOptions;
    abortSignal?.throwIfAborted();

    const { store } = await getStack();
    abortSignal?.throwIfAborted();

    // Adapter path: embedQuery → db.search via similaritySearchWithScore.
    // (No AbortSignal on the LangChain surface — checked at the boundaries.)
    const pairs = await store.similaritySearchWithScore(query, topK, filter);
    abortSignal?.throwIfAborted();

    const results = pairs.map(([document, score]) => toKBSearchResult(document, score));
    // The adapter exposes no threshold option, so `minScore` is applied
    // engine-side — same higher-is-better cosine semantics as the core engine.
    return minScore !== undefined ? results.filter((r) => r.score >= minScore) : results;
  }

  return {
    kind: 'langchain',

    async ingest(docs: RawDocument[], ingestOptions: IngestOptions) {
      const {
        chunking,
        chunkSize = chunkDefaults.chunkSize ?? DEFAULT_CHUNK_SIZE,
        chunkOverlap = chunkDefaults.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP,
        onProgress,
        abortSignal,
      } = ingestOptions;

      abortSignal?.throwIfAborted();
      const { db, store } = await getStack();

      const total = docs.length;
      let totalChunks = 0;

      for (let i = 0; i < docs.length; i += 1) {
        abortSignal?.throwIfAborted();
        const doc = docs[i];

        // (Re-)ingest is idempotent: drop the doc's previous chunks first.
        await db.deleteWhere({ docId: doc.id });
        chunkCounts.delete(doc.id);

        const texts = chunkText(doc.text, chunking, chunkSize, chunkOverlap);
        const prepared = buildChunkDocuments(doc, texts);
        onProgress?.({ phase: 'chunk', completed: i + 1, total });

        // embed + store happen atomically inside addDocuments (no adapter
        // progress) — emit embed at doc start, store at doc completion.
        onProgress?.({ phase: 'embed', completed: i, total });
        for (let offset = 0; offset < prepared.length; offset += EMBED_BATCH_SIZE) {
          abortSignal?.throwIfAborted();
          await store.addDocuments(prepared.slice(offset, offset + EMBED_BATCH_SIZE));
        }

        chunkCounts.set(doc.id, prepared.length);
        totalChunks += prepared.length;
        onProgress?.({ phase: 'store', completed: i + 1, total });
      }

      return { chunks: totalChunks };
    },

    search,

    async ask(question: string, askOptions?: AskOptions): Promise<AskResult> {
      const abortSignal = askOptions?.abortSignal;
      const topK = askOptions?.topK ?? askDefaultTopK;

      const sources = await search(question, { topK, ...(abortSignal ? { abortSignal } : {}) });

      // Same grounding prompt template shape as the core engine, as one
      // plain string through ChatLocalMode.
      const context = sources
        .map((s, i) => `[Source ${i + 1}] ${s.metadata.text}`)
        .join('\n\n');
      const prompt = `${groundingSystemPrompt}\n\nContext:\n${context}\n\nQuestion: ${question}\n\nAnswer:`;

      const chat = await resolveChatModel();
      abortSignal?.throwIfAborted();

      const started = performance.now();
      let raw = '';
      if (askOptions?.onToken) {
        // Streamed path: raw tokens (including any reasoning tags) pass
        // through onToken live; the final answer is stripped below.
        const stream = await chat.stream(prompt, { signal: abortSignal });
        for await (const chunk of stream) {
          const piece = typeof chunk.text === 'string' ? chunk.text : '';
          if (piece) {
            raw += piece;
            askOptions.onToken(piece);
          }
        }
      } else {
        const message = await chat.invoke(prompt, { signal: abortSignal });
        raw = typeof message.text === 'string' ? message.text : '';
      }
      const durationMs = Math.round(performance.now() - started);

      return { answer: stripReasoningTags(raw), sources, durationMs };
    },

    async removeDocument(docId: string) {
      chunkCounts.delete(docId);
      if (!stackPromise) return; // nothing indexed yet
      const { db } = await stackPromise;
      await db.deleteWhere({ docId });
    },

    async clear() {
      chunkCounts.clear();
      if (!stackPromise) return; // nothing indexed yet
      const { db } = await stackPromise;
      await db.clear();
    },

    async stats(): Promise<EngineStats> {
      if (!stackPromise) {
        return { documents: 0, chunks: 0, dimensions: embeddingModel.dimensions };
      }
      const { db } = await stackPromise;
      const dbStats = await db.stats();
      return {
        documents: chunkCounts.size,
        chunks: dbStats.count,
        dimensions: embeddingModel.dimensions,
      };
    },
  };
}
