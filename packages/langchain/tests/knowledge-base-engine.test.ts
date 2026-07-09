/**
 * @file knowledge-base-engine.test.ts
 * @description Tests for the LangChain-adapter `KnowledgeBaseEngine`
 * (`createLangChainKnowledgeBaseEngine`).
 *
 * Test-integrity: these drive the REAL adapter call path — a real
 * `LocalModeEmbeddings`, a real `LocalModeVectorStore` over a real in-memory
 * `createVectorDB`, and a real `ChatLocalMode`. The ONLY things mocked are the
 * layer BELOW the adapters: the injected `EmbeddingModel` and, for `ask()`, the
 * `LanguageModel` wrapped by `ChatLocalMode`. The cross-engine equivalence test
 * runs the SAME corpus + query through the real core engine
 * (`@localmode/core`'s `createKnowledgeBaseEngine`) and this LangChain engine
 * and asserts result-level-equivalent ranked ids and cosine scores.
 */

import { describe, it, expect } from 'vitest';
import {
  createKnowledgeBaseEngine,
  createMockLanguageModel,
} from '@localmode/core';
import type { EmbeddingModel, LanguageModel, RawDocument } from '@localmode/core';
import { createLangChainKnowledgeBaseEngine } from '../src/knowledge-base-engine.js';
import { ChatLocalMode } from '../src/chat-model.js';

/* ─────────────────────── deterministic value-only model ─────────────────── */

/**
 * FNV-1a hash → a value-ONLY seed. Unlike the shared `createMockEmbeddingModel`
 * (whose vectors also depend on the batch position), this deterministic model's
 * vector depends only on the text, so the core engine (which embeds in one
 * batch) and the LangChain engine (which embeds per document) produce IDENTICAL
 * vectors for the same chunk text — a precondition for asserting cross-engine
 * result equivalence.
 */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededVector(dim: number, seed: number): Float32Array {
  // Non-negative components (like real text embeddings) so cosine similarity —
  // and therefore the engines' scores — stay in [0, 1].
  let state = (seed || 1) >>> 0;
  const v = new Float32Array(dim);
  for (let i = 0; i < dim; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    v[i] = state / 0xffffffff;
  }
  return v;
}

function valueOnlyEmbeddingModel(dimensions = 16): EmbeddingModel {
  return {
    modelId: 'mock:equiv-embed',
    provider: 'mock',
    dimensions,
    maxEmbeddingsPerCall: 100,
    supportsParallelCalls: true,
    async doEmbed({ values }: { values: string[] }) {
      return {
        embeddings: values.map((v) => seededVector(dimensions, hashString(v))),
        usage: { tokens: values.length },
        response: { id: 'mock', modelId: 'mock:equiv-embed', timestamp: new Date() },
      };
    },
  } as unknown as EmbeddingModel;
}

/* ───────────────────────────── fixtures ──────────────────────────────── */

function makeDoc(overrides: Partial<RawDocument> & { id: string; text: string }): RawDocument {
  return {
    title: overrides.title ?? `Doc ${overrides.id}`,
    source: overrides.source ?? 'text',
    addedAt: overrides.addedAt ?? Date.now(),
    ...overrides,
  };
}

/** Five short, whitespace-clean documents (identical single chunk under 'off'). */
const CORPUS: RawDocument[] = [
  makeDoc({ id: 'a', title: 'Privacy', text: 'Local-first apps keep user data on the device.', category: 'privacy' }),
  makeDoc({ id: 'b', title: 'Vectors', text: 'Embeddings map text into a high dimensional vector space.', category: 'search' }),
  makeDoc({ id: 'c', title: 'Offline', text: 'Models run offline in the browser after download.', category: 'offline' }),
  makeDoc({ id: 'd', title: 'Encryption', text: 'AES-GCM encrypts vault contents entirely on device.', category: 'privacy' }),
  makeDoc({ id: 'e', title: 'Ranking', text: 'Cosine similarity ranks nearest neighbours first.', category: 'search' }),
];

const LONG_DOC: RawDocument = makeDoc({
  id: 'long',
  title: 'Manual',
  text: [
    'Chapter one introduces the concept of local inference on the device.',
    'Chapter two explains how embeddings are computed entirely offline.',
    'Chapter three covers vector search and the ranking of retrieved results.',
    'Chapter four discusses grounded generation with numbered citations.',
  ].join('\n\n'),
});

function makeChatFactory(response: string) {
  return () =>
    new ChatLocalMode({
      model: createMockLanguageModel({ mockResponse: response }) as unknown as LanguageModel,
    });
}

/* ─────────────────────────────── tests ───────────────────────────────── */

describe('createLangChainKnowledgeBaseEngine — basics', () => {
  it('reports kind "langchain" and reports declared dimensions before ingest', async () => {
    const engine = createLangChainKnowledgeBaseEngine({
      embeddingModel: valueOnlyEmbeddingModel(16),
      getChatModel: makeChatFactory('answer'),
    });
    expect(engine.kind).toBe('langchain');
    expect(await engine.stats()).toEqual({ documents: 0, chunks: 0, dimensions: 16 });
  });

  it('ingest → search returns results with full metadata (two witnesses)', async () => {
    const engine = createLangChainKnowledgeBaseEngine({
      embeddingModel: valueOnlyEmbeddingModel(),
      getChatModel: makeChatFactory('answer'),
    });
    const { chunks } = await engine.ingest(CORPUS, { chunking: 'off' });
    expect(chunks).toBe(CORPUS.length);

    const results = await engine.search('privacy and vectors', { topK: 5 });
    // Witness 1: returned rows.
    expect(results.length).toBe(5);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      expect(results[i].score).toBeGreaterThanOrEqual(0);
      expect(results[i].score).toBeLessThanOrEqual(1);
    }
    for (const r of results) {
      expect(r.metadata.docTitle).toBeTruthy();
      expect(typeof r.metadata.text).toBe('string');
    }
    // Witness 2: stats confirms the corpus is fully indexed.
    const stats = await engine.stats();
    expect(stats.documents).toBe(CORPUS.length);
    expect(stats.chunks).toBe(CORPUS.length);
  });

  it('reconstructs contract ids as `${docId}:${chunkIndex}` (not adapter UUIDs)', async () => {
    const engine = createLangChainKnowledgeBaseEngine({
      embeddingModel: valueOnlyEmbeddingModel(),
      getChatModel: makeChatFactory('answer'),
    });
    const { chunks } = await engine.ingest([LONG_DOC], {
      chunking: 'recursive',
      chunkSize: 70,
      chunkOverlap: 10,
    });
    expect(chunks).toBeGreaterThan(1);

    const results = await engine.search('inference', { topK: chunks });
    expect(results.length).toBe(chunks);
    const seenIndices = new Set<number>();
    for (const r of results) {
      // Id is derived purely from metadata, never a random UUID.
      expect(r.id).toBe(`${r.metadata.docId}:${r.metadata.chunkIndex}`);
      expect(r.metadata.docId).toBe('long');
      expect(r.id).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i); // not a UUID
      seenIndices.add(r.metadata.chunkIndex);
    }
    // Chunk indices are the contiguous 0..chunks-1 range.
    expect([...seenIndices].sort((x, y) => x - y)).toEqual(
      Array.from({ length: chunks }, (_, i) => i),
    );
  });

  it('applies a metadata filter and a minScore floor', async () => {
    const engine = createLangChainKnowledgeBaseEngine({
      embeddingModel: valueOnlyEmbeddingModel(),
      getChatModel: makeChatFactory('answer'),
    });
    await engine.ingest(CORPUS, { chunking: 'off' });

    const privacyOnly = await engine.search('anything', { topK: 10, filter: { category: 'privacy' } });
    expect(privacyOnly.length).toBe(2);
    expect(privacyOnly.every((r) => r.metadata.category === 'privacy')).toBe(true);

    const floored = await engine.search('anything', { topK: 10, minScore: 1.01 });
    expect(floored.length).toBe(0); // no cosine score exceeds 1
  });
});

describe('createLangChainKnowledgeBaseEngine — ask (grounded, via ChatLocalMode)', () => {
  it('strips <think> reasoning while keeping sources intact (two witnesses)', async () => {
    const engine = createLangChainKnowledgeBaseEngine({
      embeddingModel: valueOnlyEmbeddingModel(),
      getChatModel: makeChatFactory('<think> SECRETPLAN hidden chain </think> The answer cites [1].'),
    });
    await engine.ingest(CORPUS, { chunking: 'off' });

    const result = await engine.ask('What is private?', { topK: 3 });
    // Witness 1: reasoning stripped from the answer.
    expect(result.answer).toBe('The answer cites [1].');
    expect(result.answer).not.toContain('<think>');
    expect(result.answer).not.toContain('SECRETPLAN');
    expect(typeof result.durationMs).toBe('number');
    // Witness 2: grounding sources intact and id-reconstructed.
    expect(result.sources.length).toBe(3);
    for (const s of result.sources) {
      expect(s.id).toBe(`${s.metadata.docId}:${s.metadata.chunkIndex}`);
    }
  });
});

describe('createLangChainKnowledgeBaseEngine — re-ingest / remove / clear', () => {
  it('re-ingesting a doc id replaces its chunks; remove + clear empty the index', async () => {
    const engine = createLangChainKnowledgeBaseEngine({
      embeddingModel: valueOnlyEmbeddingModel(),
      getChatModel: makeChatFactory('answer'),
    });

    const first = await engine.ingest([LONG_DOC], { chunking: 'recursive', chunkSize: 70, chunkOverlap: 10 });
    expect(first.chunks).toBeGreaterThan(1);

    const replacement = makeDoc({ id: 'long', title: 'Manual v2', text: 'A single rewritten manual.' });
    const second = await engine.ingest([replacement], { chunking: 'off' });
    expect(second.chunks).toBe(1);
    const afterReingest = await engine.stats();
    expect(afterReingest.documents).toBe(1);
    expect(afterReingest.chunks).toBe(1);
    const hits = await engine.search('manual', { topK: 10 });
    expect(hits.map((r) => r.id)).toEqual(['long:0']);

    await engine.removeDocument('long');
    expect((await engine.stats()).chunks).toBe(0);

    await engine.ingest(CORPUS, { chunking: 'off' });
    await engine.clear();
    const afterClear = await engine.stats();
    expect(afterClear.documents).toBe(0);
    expect(afterClear.chunks).toBe(0);
  });
});

describe('createLangChainKnowledgeBaseEngine — AbortSignal', () => {
  it('rejects ingest/search when the signal is already aborted', async () => {
    const engine = createLangChainKnowledgeBaseEngine({
      embeddingModel: valueOnlyEmbeddingModel(),
      getChatModel: makeChatFactory('answer'),
    });
    const c1 = new AbortController();
    c1.abort();
    await expect(engine.ingest(CORPUS, { chunking: 'off', abortSignal: c1.signal })).rejects.toThrow();

    await engine.ingest(CORPUS, { chunking: 'off' });
    const c2 = new AbortController();
    c2.abort();
    await expect(engine.search('q', { topK: 3, abortSignal: c2.signal })).rejects.toThrow();
  });
});

describe('cross-engine result equivalence (core ⇄ langchain)', () => {
  it('same corpus + embedding model + query → equivalent ranked ids and scores', async () => {
    // ONE shared deterministic embedding model instance drives both engines,
    // so identical chunk text ⇒ identical vectors ⇒ identical cosine scores.
    const embeddingModel = valueOnlyEmbeddingModel(24);

    const coreEngine = createKnowledgeBaseEngine({
      embeddingModel,
      getLanguageModel: () => createMockLanguageModel() as unknown as LanguageModel,
    });
    const langchainEngine = createLangChainKnowledgeBaseEngine({
      embeddingModel,
      getChatModel: makeChatFactory('answer'),
    });

    // 'off' chunking + whitespace-clean docs ⇒ both engines index one chunk per
    // doc with byte-identical text and the same `${id}:0` contract id.
    await coreEngine.ingest(CORPUS, { chunking: 'off' });
    await langchainEngine.ingest(CORPUS, { chunking: 'off' });

    const query = 'privacy encryption and vector ranking';
    const topK = CORPUS.length;
    const coreHits = await coreEngine.search(query, { topK });
    const lcHits = await langchainEngine.search(query, { topK });

    // Result-level equivalence: same number of hits.
    expect(coreHits.length).toBe(topK);
    expect(lcHits.length).toBe(topK);

    // Same ranked ids in the same order.
    expect(lcHits.map((r) => r.id)).toEqual(coreHits.map((r) => r.id));

    // Same cosine scores (higher-is-better, [0, 1]) within float tolerance.
    for (let i = 0; i < topK; i++) {
      expect(lcHits[i].score).toBeCloseTo(coreHits[i].score, 5);
      expect(lcHits[i].metadata.docId).toBe(coreHits[i].metadata.docId);
    }
  });
});
