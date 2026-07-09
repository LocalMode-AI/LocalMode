'use client';

/**
 * @file use-knowledge-base.ts
 * @description The knowledge-base session-orchestration hook. It owns the full
 * knowledge-base session so no consuming block re-implements it: the raw-
 * document store (`documents` + add/remove/clear), the embedding-model load
 * lifecycle (`useModelLoad`), chunking + embedding-model config, busy/error,
 * and — the load-bearing part — re-ingest of the whole raw-document store on
 * either an engine-kind toggle OR an embedding-model switch.
 *
 * The active engine is produced by an injected `createEngine(kind)` factory, so
 * the hook consumes ONLY the `KnowledgeBaseEngine` contract from
 * `@localmode/core` and never imports a specific engine implementation. A block
 * supplies the core engine directly and (for blocks that offer the toggle) the
 * LangChain engine via `await import('@localmode/langchain')` — keeping
 * `@localmode/langchain` out of `@localmode/react`'s dependencies. A core-only
 * factory that never references LangChain runs the whole session on the core
 * engine (no dynamic langchain import ever fires).
 *
 * Storage-identifier stability: the embedding-model load key stays
 * `kb-embedding:${embeddingModelId}` verbatim (overridable) so a later switch to
 * persistent storage cannot silently orphan data.
 */

import { useEffect, useRef, useState } from 'react';
import type { EmbeddingModel, KnowledgeBaseEngine, RawDocument } from '@localmode/core';

import { useModelLoad, type AnyLoadProgress } from '../utilities/use-model-load.js';

/** Which engine implementation backs the session. */
export type EngineKind = KnowledgeBaseEngine['kind'];

/** Chunking strategies applied at ingest time. */
export type KnowledgeBaseChunkingMode = 'off' | 'recursive' | 'semantic';

/** One ingest progress tick (shape from the engine's `ingest` `onProgress`). */
export interface KnowledgeBaseProgress {
  phase: 'chunk' | 'embed' | 'store';
  completed: number;
  total: number;
}

/** Snapshot of the indexed corpus (from the engine's `stats()`). */
export interface KnowledgeBaseStats {
  documents: number;
  chunks: number;
  dimensions: number;
}

/** Options for {@link useKnowledgeBase}. */
export interface UseKnowledgeBaseOptions {
  /**
   * Produce the engine for a kind. The block supplies the core engine directly
   * and, for blocks that offer the toggle, the LangChain engine via a dynamic
   * `import('@localmode/langchain')`. Core-only blocks return a core engine for
   * every kind and never reference LangChain, so no langchain module loads.
   */
  createEngine: (kind: EngineKind) => Promise<KnowledgeBaseEngine> | KnowledgeBaseEngine;
  /**
   * Construct the embedding model for a given id, wiring the hook-bound
   * load-progress callback (e.g.
   * `(id, onProgress) => transformers.embedding(id, { onProgress })`).
   */
  createEmbeddingModel: (
    id: string,
    onProgress: (progress: AnyLoadProgress) => void,
  ) => EmbeddingModel;
  /** Optional cache probe for the active embedding model (e.g. `(id) => isModelCached(id)`). */
  isModelCached?: (id: string) => Promise<boolean>;
  /** Initial embedding-model id. */
  embeddingModelId: string;
  /** Initial engine kind (default `'core'`). */
  engineKind?: EngineKind;
  /** Initial chunking mode (default `'recursive'`). */
  chunking?: KnowledgeBaseChunkingMode;
  /** Initial recursive-chunker size in chars (default `512`). */
  chunkSize?: number;
  /**
   * Derive the `useModelLoad` key from the embedding-model id. Defaults to
   * `kb-embedding:${id}` — the existing identifier, preserved verbatim.
   */
  modelLoadKey?: (id: string) => string;
}

/** Everything a consuming block reads/calls. */
export interface UseKnowledgeBaseReturn {
  /** The active engine, or `null` while it is being (re-)created. */
  engine: KnowledgeBaseEngine | null;
  engineKind: EngineKind;
  /** Toggle the engine kind — re-ingests the corpus through the new engine. */
  setEngineKind: (kind: EngineKind) => void;

  /** Raw documents currently in the corpus. */
  documents: RawDocument[];
  /** Add documents: assigns ids, ingests through the engine, appends to the store. */
  addDocuments: (docs: Array<Omit<RawDocument, 'id' | 'addedAt'>>) => Promise<void>;
  removeDocument: (docId: string) => Promise<void>;
  clearAll: () => Promise<void>;

  /** Active chunking config (applied on the next ingest). */
  chunking: KnowledgeBaseChunkingMode;
  setChunking: (mode: KnowledgeBaseChunkingMode) => void;
  chunkSize: number;
  setChunkSize: (n: number) => void;

  /** Active embedding-model id — a switch re-ingests the corpus. */
  embeddingModelId: string;
  setEmbeddingModelId: (id: string) => void;

  /** True while any ingest / re-ingest runs. */
  busy: boolean;
  /** Last ingest/engine/model error, or null. */
  error: string | null;
  /** Corpus stats from the last successful ingest, or null. */
  stats: KnowledgeBaseStats | null;

  /** Progress of a regular `addDocuments` ingest, or null. */
  ingestProgress: KnowledgeBaseProgress | null;
  /** Progress of the whole-corpus re-ingest that runs on a switch, or null. */
  reingestProgress: KnowledgeBaseProgress | null;
  /** True from a switch until its re-ingest settles. */
  switching: boolean;

  // ── embedding-model load lifecycle ──
  modelStatus: ReturnType<typeof useModelLoad>['status'];
  modelProgress: number;
  modelProgressValue: ReturnType<typeof useModelLoad>['progressValue'];
  modelCached: boolean | undefined;
  modelReady: boolean;
  /** Load (or join the in-flight load of) the active embedding model. */
  loadModel: () => Promise<void>;
}

const toMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

const defaultModelLoadKey = (id: string) => `kb-embedding:${id}`;

/**
 * Knowledge-base session-orchestration hook: the raw-document store, the
 * embedding-model load lifecycle, chunking + model config, and switch-driven
 * re-ingest — all promoted so the four knowledge blocks (`semantic-search`,
 * `document-qa`, `rag-chat`, `vector-data-manager`) share one tested surface.
 *
 * The engine is injected via `createEngine(kind)`; the hook never imports a
 * concrete engine, so a core-only factory keeps `@localmode/langchain` entirely
 * out of the session while a toggle-capable factory can dynamically import it.
 *
 * An engine-kind toggle OR an embedding-model switch drives a single effect
 * (keyed on `[engineKind, embeddingModelId]`) that recreates the engine and, if
 * the raw-document store is non-empty, re-ingests the whole corpus through it
 * with visible progress. Regular `addDocuments` calls ingest incrementally.
 *
 * @param options - Injected engine + model factories and initial session config
 * @returns The full session surface (state + mutations + model-load lifecycle)
 *
 * @example
 * ```tsx
 * import { useKnowledgeBase } from '@localmode/react';
 * import { createKnowledgeBaseEngine } from '@localmode/core';
 * import { transformers, isModelCached } from '@localmode/transformers';
 *
 * const kb = useKnowledgeBase({
 *   embeddingModelId: 'Xenova/bge-small-en-v1.5',
 *   createEmbeddingModel: (id, onProgress) => transformers.embedding(id, { onProgress }),
 *   isModelCached: (id) => isModelCached(id),
 *   // core-only factory: never imports @localmode/langchain
 *   createEngine: () =>
 *     createKnowledgeBaseEngine({
 *       embeddingModel: transformers.embedding('Xenova/bge-small-en-v1.5'),
 *       getLanguageModel: async () => transformers.languageModel('onnx-community/granite-4.0'),
 *     }),
 * });
 * ```
 *
 * @throws Never throws during render; mutating actions surface failures via `error`.
 * @see createKnowledgeBaseEngine (`@localmode/core`) / createLangChainKnowledgeBaseEngine (`@localmode/langchain`)
 */
export function useKnowledgeBase(options: UseKnowledgeBaseOptions): UseKnowledgeBaseReturn {
  const {
    createEngine,
    createEmbeddingModel,
    isModelCached,
    modelLoadKey = defaultModelLoadKey,
  } = options;

  const [documents, setDocuments] = useState<RawDocument[]>([]);
  const [chunking, setChunking] = useState<KnowledgeBaseChunkingMode>(
    options.chunking ?? 'recursive',
  );
  const [chunkSize, setChunkSize] = useState(options.chunkSize ?? 512);
  const [engineKind, setEngineKindState] = useState<EngineKind>(options.engineKind ?? 'core');
  const [embeddingModelId, setEmbeddingModelIdState] = useState(options.embeddingModelId);

  const [engine, setEngine] = useState<KnowledgeBaseEngine | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<KnowledgeBaseStats | null>(null);
  const [reingestProgress, setReingest] = useState<KnowledgeBaseProgress | null>(null);
  const [ingestProgress, setIngestTick] = useState<KnowledgeBaseProgress | null>(null);
  const [switching, setSwitching] = useState(false);

  // ── embedding-model load lifecycle (explicit-action gated) ──
  const createEmbeddingModelRef = useRef(createEmbeddingModel);
  createEmbeddingModelRef.current = createEmbeddingModel;

  const modelLoad = useModelLoad<EmbeddingModel>({
    key: modelLoadKey(embeddingModelId),
    create: (onProgress) => createEmbeddingModelRef.current(embeddingModelId, onProgress),
    isCached: isModelCached ? () => isModelCached(embeddingModelId) : undefined,
  });

  // `load` identity may change per render — route through a ref so the switch
  // effect and long-lived async handlers always call the current one.
  const loadRef = useRef(modelLoad.load);
  loadRef.current = modelLoad.load;

  // Refs mirroring the latest state/factory for use inside the switch effect.
  const documentsRef = useRef(documents);
  documentsRef.current = documents;
  const chunkingRef = useRef(chunking);
  chunkingRef.current = chunking;
  const chunkSizeRef = useRef(chunkSize);
  chunkSizeRef.current = chunkSize;
  const createEngineRef = useRef(createEngine);
  createEngineRef.current = createEngine;

  // ── engine creation (+ switch re-ingest) — once per engineKind × modelId ──
  useEffect(() => {
    let alive = true;
    // A switch/toggle recreates the engine: hide the old one so consumers see
    // the "preparing" state, mirroring the shell's remount-per-pair behavior.
    setEngine(null);
    void (async () => {
      try {
        const nextEngine = await createEngineRef.current(engineKind);
        if (!alive) return;

        const docs = documentsRef.current;
        if (docs.length > 0) {
          // Non-empty store ⇒ this run is an engine/model switch: re-ingest the
          // whole raw-document store through the new engine, with visible
          // progress and the embedding download surfaced first.
          setSwitching(true);
          setBusy(true);
          setError(null);
          await loadRef.current();
          if (!alive) return;
          await nextEngine.ingest(docs, {
            chunking: chunkingRef.current,
            chunkSize: chunkSizeRef.current,
            onProgress: (p) => {
              if (alive) setReingest(p);
            },
          });
          if (!alive) return;
          setStats(await nextEngine.stats());
        }
        if (alive) setEngine(nextEngine);
      } catch (err) {
        if (alive) setError(toMessage(err));
      } finally {
        if (alive) {
          setBusy(false);
          setSwitching(false);
          setReingest(null);
        }
      }
    })();
    return () => {
      alive = false;
    };
    // Re-runs only on an engine-kind toggle or embedding-model switch; chunking
    // config is read from refs so a chunk-size edit does not re-ingest.
     
  }, [engineKind, embeddingModelId]);

  // ── session actions (persist documents + ingest via the engine) ──

  const addDocuments = async (incoming: Array<Omit<RawDocument, 'id' | 'addedAt'>>) => {
    if (!engine || busy || incoming.length === 0) return;
    const docs: RawDocument[] = incoming.map((d) => ({
      ...d,
      id: crypto.randomUUID(),
      addedAt: Date.now(),
    }));
    setBusy(true);
    setError(null);
    try {
      // Explicit user action → load (or join the in-flight load of) the
      // embedding model so the download is visible.
      await loadRef.current();
      await engine.ingest(docs, { chunking, chunkSize, onProgress: setIngestTick });
      setDocuments((prev) => [...prev, ...docs]);
      setStats(await engine.stats());
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setBusy(false);
      setIngestTick(null);
    }
  };

  const removeDocument = async (docId: string) => {
    if (!engine || busy) return;
    setBusy(true);
    setError(null);
    try {
      await engine.removeDocument(docId);
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
      setStats(await engine.stats());
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const clearAll = async () => {
    if (!engine || busy) return;
    setBusy(true);
    setError(null);
    try {
      await engine.clear();
      setDocuments([]);
      setStats(await engine.stats());
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setBusy(false);
    }
  };

  /** Engine toggle → state change → the switch effect recreates + re-ingests. */
  const setEngineKind = (kind: EngineKind) => {
    if (busy || !engine || kind === engineKind) return;
    setEngineKindState(kind);
  };

  /** Model switch → same recreate + re-ingest path as the engine toggle. */
  const setEmbeddingModelId = (id: string) => {
    if (busy || !engine || id === embeddingModelId) return;
    setEmbeddingModelIdState(id);
  };

  return {
    engine,
    engineKind,
    setEngineKind,

    documents,
    addDocuments,
    removeDocument,
    clearAll,

    chunking,
    setChunking,
    chunkSize,
    setChunkSize,

    embeddingModelId,
    setEmbeddingModelId,

    busy,
    error: error ?? modelLoad.error?.message ?? null,
    stats,

    ingestProgress,
    reingestProgress,
    switching,

    modelStatus: modelLoad.status,
    modelProgress: modelLoad.progress,
    modelProgressValue: modelLoad.progressValue,
    modelCached: modelLoad.cached,
    modelReady: modelLoad.status === 'ready',
    loadModel: () => loadRef.current(),
  };
}
