/**
 * @file use-knowledge-base.test.ts
 * @description Tests for the knowledge-base session-orchestration hook. The
 * hook is engine-agnostic — it consumes only the `KnowledgeBaseEngine` contract
 * and an injected `createEngine(kind)` factory — so the tests drive the REAL
 * hook orchestration (document store, model-load lifecycle, switch-driven
 * re-ingest) over deterministic mock engines that record every ingest/search.
 * The core-only lane proves the langchain path never loads when the factory
 * never references it (the witness that keeps `@localmode/langchain` out of a
 * core-only block).
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { EmbeddingModel, KnowledgeBaseEngine, RawDocument } from '@localmode/core';
import {
  useKnowledgeBase,
  type EngineKind,
  type UseKnowledgeBaseOptions,
} from '../src/hooks/use-knowledge-base.js';

/* ──────────────────────────── deterministic mocks ────────────────────────── */

/** A mock engine that records ingest calls and answers search from its store. */
function makeMockEngine(kind: EngineKind) {
  const store: RawDocument[] = [];
  const ingestCalls: RawDocument[][] = [];
  const engine: KnowledgeBaseEngine = {
    kind,
    async ingest(docs, opts) {
      ingestCalls.push(docs);
      for (const d of docs) {
        // Re-ingest replaces a doc's chunks (remove-then-add by docId).
        const idx = store.findIndex((s) => s.id === d.id);
        if (idx >= 0) store.splice(idx, 1);
        store.push(d);
      }
      opts.onProgress?.({ phase: 'embed', completed: docs.length, total: docs.length });
      return { chunks: docs.length };
    },
    async search(_query, opts) {
      return store.slice(0, opts.topK).map((d, i) => ({
        id: `${d.id}:0`,
        score: 1 - i * 0.01,
        metadata: {
          docId: d.id,
          docTitle: d.title,
          chunkIndex: 0,
          text: d.text,
          source: d.source,
        },
      }));
    },
    async ask() {
      return { answer: '', sources: [], durationMs: 0 };
    },
    async removeDocument(docId) {
      const i = store.findIndex((s) => s.id === docId);
      if (i >= 0) store.splice(i, 1);
    },
    async clear() {
      store.length = 0;
    },
    async stats() {
      return { documents: store.length, chunks: store.length, dimensions: 4 };
    },
  };
  return { engine, ingestCalls, store };
}

let embedIdCounter = 0;
/** Unique embedding-model id per test → unique `kb-embedding:${id}` load key. */
function freshEmbedId(): string {
  embedIdCounter += 1;
  return `mock-embed-${embedIdCounter}`;
}

/** A minimal mock embedding model whose default warmup (embed) succeeds. */
function makeEmbeddingModel(id: string): EmbeddingModel {
  return {
    modelId: id,
    provider: 'mock',
    dimensions: 4,
    maxEmbeddingsPerCall: 100,
    supportsParallelCalls: true,
    async doEmbed({ values }: { values: string[] }) {
      return {
        embeddings: values.map(() => new Float32Array([1, 0, 0, 0])),
        usage: { tokens: values.length },
        response: { modelId: id, timestamp: new Date() },
      };
    },
  } as unknown as EmbeddingModel;
}

/** Build options with a toggle-capable factory that records created engines. */
function toggleCapableOptions(overrides: Partial<UseKnowledgeBaseOptions> = {}) {
  const created: Record<EngineKind, ReturnType<typeof makeMockEngine>[]> = {
    core: [],
    langchain: [],
  };
  const langchainLoader = vi.fn(async () => makeMockEngine('langchain'));
  const createEngine = vi.fn(async (kind: EngineKind) => {
    // A toggle-capable block dynamically imports langchain only on toggle.
    const rec = kind === 'langchain' ? await langchainLoader() : makeMockEngine('core');
    created[kind].push(rec);
    return rec.engine;
  });
  const createEmbeddingModel = vi.fn((id: string) => makeEmbeddingModel(id));
  const options: UseKnowledgeBaseOptions = {
    createEngine,
    createEmbeddingModel,
    embeddingModelId: freshEmbedId(),
    ...overrides,
  };
  return { options, created, createEngine, createEmbeddingModel, langchainLoader };
}

const SAMPLE_DOCS: Array<Omit<RawDocument, 'id' | 'addedAt'>> = [
  { title: 'Privacy', text: 'Encryption keeps data on device.', source: 'text' },
  { title: 'Gardening', text: 'Plant tomatoes after the last frost.', source: 'text' },
];

/* ───────────────────────────────── tests ─────────────────────────────────── */

describe('useKnowledgeBase', () => {
  it('adds documents, ingests through the engine, and searches the corpus', async () => {
    const { options, createEngine } = toggleCapableOptions();
    const { result } = renderHook(() => useKnowledgeBase(options));

    await waitFor(() => expect(result.current.engine).not.toBeNull());
    expect(result.current.engine?.kind).toBe('core');

    await act(async () => {
      await result.current.addDocuments(SAMPLE_DOCS);
    });

    // Witness 1: the raw-document store holds the docs (ids + addedAt assigned).
    expect(result.current.documents).toHaveLength(2);
    expect(result.current.documents.every((d) => d.id && d.addedAt)).toBe(true);
    // Witness 2: engine stats reflect the ingested chunks.
    expect(result.current.stats).toEqual({ documents: 2, chunks: 2, dimensions: 4 });
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBeNull();

    // The engine ingested exactly the assigned documents, and search answers.
    let hits!: Awaited<ReturnType<NonNullable<typeof result.current.engine>['search']>>;
    await act(async () => {
      hits = await result.current.engine!.search('privacy', { topK: 10 });
    });
    expect(hits).toHaveLength(2);
    expect(hits[0].metadata.docTitle).toBe('Privacy');
    expect(createEngine).toHaveBeenCalledTimes(1);
  });

  it('re-ingests the whole corpus through the new engine on an engine-kind toggle', async () => {
    const { options, created, createEngine, langchainLoader } = toggleCapableOptions();
    const { result } = renderHook(() => useKnowledgeBase(options));

    await waitFor(() => expect(result.current.engine).not.toBeNull());
    await act(async () => {
      await result.current.addDocuments(SAMPLE_DOCS);
    });
    expect(langchainLoader).not.toHaveBeenCalled(); // core so far

    // Toggle to LangChain: the switch effect recreates + re-ingests.
    act(() => {
      result.current.setEngineKind('langchain');
    });

    await waitFor(() => expect(result.current.engineKind).toBe('langchain'));
    await waitFor(() => expect(result.current.engine?.kind).toBe('langchain'));
    await waitFor(() => expect(result.current.switching).toBe(false));
    await waitFor(() => expect(result.current.busy).toBe(false));

    // The langchain engine was created and re-ingested the ENTIRE corpus.
    expect(langchainLoader).toHaveBeenCalledTimes(1);
    expect(created.langchain).toHaveLength(1);
    const langchainEngine = created.langchain[0];
    expect(langchainEngine.ingestCalls).toHaveLength(1);
    expect(langchainEngine.ingestCalls[0].map((d) => d.title)).toEqual(['Privacy', 'Gardening']);
    // Now search runs through the langchain engine.
    expect(result.current.engine).toBe(langchainEngine.engine);
    expect(createEngine).toHaveBeenLastCalledWith('langchain');
  });

  it('re-ingests the corpus through the new embedding space on a model switch', async () => {
    const { options, created, createEmbeddingModel } = toggleCapableOptions();
    const { result } = renderHook(() => useKnowledgeBase(options));

    await waitFor(() => expect(result.current.engine).not.toBeNull());
    await act(async () => {
      await result.current.addDocuments(SAMPLE_DOCS);
    });
    const coreEnginesBefore = created.core.length;

    const newModelId = freshEmbedId();
    act(() => {
      result.current.setEmbeddingModelId(newModelId);
    });

    await waitFor(() => expect(result.current.embeddingModelId).toBe(newModelId));
    await waitFor(() => expect(result.current.switching).toBe(false));
    await waitFor(() => expect(result.current.busy).toBe(false));

    // A fresh engine was created for the new model and re-ingested the corpus.
    expect(created.core.length).toBe(coreEnginesBefore + 1);
    const reingested = created.core[created.core.length - 1];
    expect(reingested.ingestCalls[0].map((d) => d.title)).toEqual(['Privacy', 'Gardening']);
    // The embedding model was re-constructed under the new (re-keyed) id.
    expect(createEmbeddingModel).toHaveBeenCalledWith(newModelId, expect.any(Function));
  });

  it('removeDocument and clearAll mutate the store and stats through the engine', async () => {
    const { options } = toggleCapableOptions();
    const { result } = renderHook(() => useKnowledgeBase(options));

    await waitFor(() => expect(result.current.engine).not.toBeNull());
    await act(async () => {
      await result.current.addDocuments(SAMPLE_DOCS);
    });
    const firstId = result.current.documents[0].id;

    await act(async () => {
      await result.current.removeDocument(firstId);
    });
    expect(result.current.documents).toHaveLength(1);
    expect(result.current.stats?.documents).toBe(1);

    await act(async () => {
      await result.current.clearAll();
    });
    expect(result.current.documents).toHaveLength(0);
    expect(result.current.stats?.chunks).toBe(0);
  });

  it('a core-only factory never loads @localmode/langchain (no dynamic import fires)', async () => {
    // A core-only block's factory: ignores kind, ALWAYS returns a core engine,
    // and never references the langchain loader.
    const langchainLoader = vi.fn(async () => makeMockEngine('langchain'));
    const createdKinds: EngineKind[] = [];
    const createEngine = vi.fn(async (_kind: EngineKind) => {
      const rec = makeMockEngine('core'); // never calls langchainLoader
      createdKinds.push(rec.engine.kind);
      return rec.engine;
    });

    const { result } = renderHook(() =>
      useKnowledgeBase({
        createEngine,
        createEmbeddingModel: (id) => makeEmbeddingModel(id),
        embeddingModelId: freshEmbedId(),
      }),
    );

    await waitFor(() => expect(result.current.engine).not.toBeNull());
    await act(async () => {
      await result.current.addDocuments(SAMPLE_DOCS);
    });
    let hits!: Awaited<ReturnType<NonNullable<typeof result.current.engine>['search']>>;
    await act(async () => {
      hits = await result.current.engine!.search('q', { topK: 5 });
    });

    // Witness: the whole session ran on the core engine and langchain never loaded.
    expect(hits).toHaveLength(2);
    expect(result.current.engine?.kind).toBe('core');
    expect(createdKinds.every((k) => k === 'core')).toBe(true);
    expect(langchainLoader).not.toHaveBeenCalled();
  });
});
