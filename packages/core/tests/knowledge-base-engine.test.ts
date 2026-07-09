/**
 * @fileoverview Tests for the provider-agnostic core KnowledgeBaseEngine
 * (`createKnowledgeBaseEngine`).
 *
 * Test-integrity: these drive the REAL engine call path — real `recursiveChunk`
 * / `semanticChunk`, real `streamEmbedMany` / `embed`, a real in-memory
 * `createVectorDB`, and real `streamText` + reasoning-tag stripping. The ONLY
 * things mocked are the layer BELOW the engine: the injected `EmbeddingModel`
 * (`createMockEmbeddingModel`, deterministic hash-seeded vectors) and the
 * injected `LanguageModel` (`createMockLanguageModel`). Every non-trivial
 * outcome is checked with two independent witnesses (the returned rows AND
 * `stats()`, or the answer string AND the grounding sources).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  createKnowledgeBaseEngine,
  createMockEmbeddingModel,
  createMockLanguageModel,
} from '../src/index.js';
import type {
  KnowledgeBaseEngine,
  LanguageModel,
  RawDocument,
} from '../src/index.js';

/* ───────────────────────────── fixtures ──────────────────────────────── */

function makeDoc(overrides: Partial<RawDocument> & { id: string; text: string }): RawDocument {
  return {
    title: overrides.title ?? `Doc ${overrides.id}`,
    source: overrides.source ?? 'text',
    addedAt: overrides.addedAt ?? Date.now(),
    ...overrides,
  };
}

/** Three short, whitespace-clean documents (one chunk each under `'off'`). */
const CORPUS: RawDocument[] = [
  makeDoc({ id: 'a', title: 'Privacy', text: 'Local-first apps keep user data on the device.', category: 'privacy' }),
  makeDoc({ id: 'b', title: 'Vectors', text: 'Embeddings map text into a high dimensional vector space.', category: 'search' }),
  makeDoc({ id: 'c', title: 'Offline', text: 'Models run offline in the browser after the first download.', category: 'offline' }),
];

/** A longer single document that recursive chunking splits into many pieces. */
const LONG_DOC: RawDocument = makeDoc({
  id: 'long',
  title: 'Manual',
  text: [
    'Chapter one introduces the concept of local inference.',
    'Chapter two explains how embeddings are computed on device.',
    'Chapter three covers vector search and ranking of results.',
    'Chapter four discusses grounded generation with citations.',
    'Chapter five wraps up with privacy and offline guarantees.',
  ].join('\n\n'),
});

/** An engine whose injected models are deterministic mocks. */
function makeEngine(opts?: {
  embeddingSeed?: number;
  dimensions?: number;
  llmResponse?: string;
  onLanguageModel?: () => void;
}): { engine: KnowledgeBaseEngine } {
  const embeddingModel = createMockEmbeddingModel({
    dimensions: opts?.dimensions ?? 384,
    seed: opts?.embeddingSeed ?? 7,
    modelId: 'mock:kb-embed',
  });
  const engine = createKnowledgeBaseEngine({
    embeddingModel,
    getLanguageModel: () => {
      opts?.onLanguageModel?.();
      return createMockLanguageModel({
        mockResponse: opts?.llmResponse ?? 'A grounded answer [1].',
      }) as unknown as LanguageModel;
    },
  });
  return { engine };
}

/* ─────────────────────────────── tests ───────────────────────────────── */

describe('createKnowledgeBaseEngine — construction', () => {
  it('reports kind "core" and adds no runtime dependency to @localmode/core', () => {
    const { engine } = makeEngine();
    expect(engine.kind).toBe('core');

    // Witness for spec scenario "Core engine adds no dependency": the package
    // manifest carries no runtime `dependencies`.
    const pkgPath = join((import.meta as { dirname: string }).dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    expect(pkg.dependencies ?? {}).toEqual({});
  });

  it('constructs without loading any model (stats reports declared dimensions)', async () => {
    const { engine } = makeEngine({ dimensions: 256 });
    const stats = await engine.stats();
    expect(stats).toEqual({ documents: 0, chunks: 0, dimensions: 256 });
  });
});

describe('createKnowledgeBaseEngine — ingest chunk counts across modes', () => {
  it('"off" mode stores exactly one chunk per document (two witnesses)', async () => {
    const { engine } = makeEngine();
    const { chunks } = await engine.ingest(CORPUS, { chunking: 'off' });

    // Witness 1: the ingest return value.
    expect(chunks).toBe(CORPUS.length);
    // Witness 2: engine stats.
    const stats = await engine.stats();
    expect(stats.documents).toBe(CORPUS.length);
    expect(stats.chunks).toBe(CORPUS.length);
  });

  it('"recursive" mode splits a long document into multiple chunks (two witnesses)', async () => {
    const { engine } = makeEngine();
    const { chunks } = await engine.ingest([LONG_DOC], {
      chunking: 'recursive',
      chunkSize: 60,
      chunkOverlap: 10,
    });

    expect(chunks).toBeGreaterThan(1);
    const stats = await engine.stats();
    expect(stats.documents).toBe(1);
    expect(stats.chunks).toBe(chunks);
  });

  it('"semantic" mode runs the real semantic chunker and indexes what it returns (two witnesses)', async () => {
    const { engine } = makeEngine();
    const { chunks } = await engine.ingest([LONG_DOC], { chunking: 'semantic' });

    expect(chunks).toBeGreaterThanOrEqual(1);
    const stats = await engine.stats();
    expect(stats.documents).toBe(1);
    expect(stats.chunks).toBe(chunks);
  });

  it('honors chunkDefaults when IngestOptions omits sizes', async () => {
    const embeddingModel = createMockEmbeddingModel({ modelId: 'mock:kb-embed' });
    const engine = createKnowledgeBaseEngine({
      embeddingModel,
      getLanguageModel: () => createMockLanguageModel() as unknown as LanguageModel,
      chunkDefaults: { chunkSize: 60, chunkOverlap: 10 },
    });
    const { chunks } = await engine.ingest([LONG_DOC], { chunking: 'recursive' });
    expect(chunks).toBeGreaterThan(1);
  });
});

describe('createKnowledgeBaseEngine — search', () => {
  it('returns vector-ranked KBSearchResults carrying full ChunkMetadata (two witnesses)', async () => {
    const { engine } = makeEngine();
    await engine.ingest(CORPUS, { chunking: 'off' });

    const results = await engine.search('privacy and vectors', { topK: 3 });

    // Witness 1: the returned rows.
    expect(results.length).toBe(3);
    // Ranked best-first (descending vector score).
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
    for (const r of results) {
      expect(typeof r.score).toBe('number');
      // Contract id is `${docId}:${chunkIndex}`.
      expect(r.id).toBe(`${r.metadata.docId}:${r.metadata.chunkIndex}`);
      // Full ChunkMetadata present.
      expect(r.metadata.docTitle).toBeTruthy();
      expect(typeof r.metadata.text).toBe('string');
      expect(r.metadata.source).toBe('text');
      expect(r.metadata.category).toBeTruthy();
    }

    // Witness 2: stats confirms the corpus is fully indexed.
    const stats = await engine.stats();
    expect(stats.chunks).toBe(CORPUS.length);
  });

  it('respects topK and a metadata filter', async () => {
    const { engine } = makeEngine();
    await engine.ingest(CORPUS, { chunking: 'off' });

    const topOne = await engine.search('anything', { topK: 1 });
    expect(topOne.length).toBe(1);

    const filtered = await engine.search('anything', {
      topK: 10,
      filter: { category: 'privacy' },
    });
    expect(filtered.length).toBe(1);
    expect(filtered[0].metadata.docId).toBe('a');
  });
});

describe('createKnowledgeBaseEngine — re-ingest replaces a document\'s chunks', () => {
  it('re-ingesting a doc id drops its prior chunks (two witnesses)', async () => {
    const { engine } = makeEngine();

    // First ingest: the long doc split into many recursive chunks.
    const first = await engine.ingest([LONG_DOC], {
      chunking: 'recursive',
      chunkSize: 60,
      chunkOverlap: 10,
    });
    expect(first.chunks).toBeGreaterThan(1);
    const statsAfterFirst = await engine.stats();
    expect(statsAfterFirst.chunks).toBe(first.chunks);

    // Re-ingest the SAME id with 'off' → a single chunk of new text.
    const replacement = makeDoc({ id: 'long', title: 'Manual v2', text: 'A completely rewritten single-chunk manual.' });
    const second = await engine.ingest([replacement], { chunking: 'off' });
    expect(second.chunks).toBe(1);

    // Witness 1: stats show exactly one document with one chunk (no stale chunks).
    const statsAfterSecond = await engine.stats();
    expect(statsAfterSecond.documents).toBe(1);
    expect(statsAfterSecond.chunks).toBe(1);

    // Witness 2: search surfaces only the new chunk id `long:0`, never `long:1+`.
    const results = await engine.search('manual', { topK: 10 });
    expect(results.map((r) => r.id)).toEqual(['long:0']);
    expect(results[0].metadata.text).toBe('A completely rewritten single-chunk manual.');
  });

  it('removeDocument drops a doc; clear empties the index (two witnesses each)', async () => {
    const { engine } = makeEngine();
    await engine.ingest(CORPUS, { chunking: 'off' });

    await engine.removeDocument('b');
    const afterRemove = await engine.stats();
    expect(afterRemove.documents).toBe(CORPUS.length - 1);
    expect(afterRemove.chunks).toBe(CORPUS.length - 1);
    const remaining = await engine.search('anything', { topK: 10 });
    expect(remaining.some((r) => r.metadata.docId === 'b')).toBe(false);

    await engine.clear();
    const afterClear = await engine.stats();
    expect(afterClear.documents).toBe(0);
    expect(afterClear.chunks).toBe(0);
    const none = await engine.search('anything', { topK: 10 });
    expect(none.length).toBe(0);
  });
});

describe('createKnowledgeBaseEngine — ask (grounded generation)', () => {
  it('strips <think> reasoning from the answer while keeping sources intact (two witnesses)', async () => {
    const { engine } = makeEngine({
      llmResponse: '<think> SECRETPLAN internal chain of thought </think> The answer is grounded in [1] and [2].',
    });
    await engine.ingest(CORPUS, { chunking: 'off' });

    const result = await engine.ask('What keeps data private?', { topK: 2 });

    // Witness 1: the answer has reasoning stripped.
    expect(result.answer).toBe('The answer is grounded in [1] and [2].');
    expect(result.answer).not.toContain('<think>');
    expect(result.answer).not.toContain('SECRETPLAN');
    expect(typeof result.durationMs).toBe('number');

    // Witness 2: the grounding sources are intact (retrieved chunks, full metadata).
    expect(result.sources.length).toBe(2);
    for (const s of result.sources) {
      expect(s.id).toBe(`${s.metadata.docId}:${s.metadata.chunkIndex}`);
      expect(typeof s.metadata.text).toBe('string');
    }
    // Sources match a direct search for the same question + topK (grounding path).
    const direct = await engine.search('What keeps data private?', { topK: 2 });
    expect(result.sources.map((s) => s.id)).toEqual(direct.map((s) => s.id));
  });

  it('streams reasoning-filtered tokens to onToken (reasoning never leaks)', async () => {
    const { engine } = makeEngine({
      llmResponse: '<think> SECRETPLAN hidden </think> Visible grounded answer [1].',
    });
    await engine.ingest(CORPUS, { chunking: 'off' });

    const deltas: string[] = [];
    const result = await engine.ask('question', {
      topK: 1,
      onToken: (t) => deltas.push(t),
    });

    const streamed = deltas.join('');
    expect(streamed).not.toContain('<think>');
    expect(streamed).not.toContain('SECRETPLAN');
    // The streamed view agrees with the final answer.
    expect(streamed.trim()).toBe(result.answer);
    expect(result.answer).toBe('Visible grounded answer [1].');
  });

  it('resolves the injected language model lazily — only on the first ask()', async () => {
    let created = 0;
    const { engine } = makeEngine({ onLanguageModel: () => { created += 1; } });
    await engine.ingest(CORPUS, { chunking: 'off' });
    await engine.search('nothing loads a model here', { topK: 1 });
    expect(created).toBe(0); // ingest + search never construct the LLM

    await engine.ask('now load it', { topK: 1 });
    await engine.ask('reuse the singleton', { topK: 1 });
    expect(created).toBe(1); // created once, reused across asks
  });
});

describe('createKnowledgeBaseEngine — AbortSignal', () => {
  it('rejects ingest when the signal is already aborted', async () => {
    const { engine } = makeEngine();
    const controller = new AbortController();
    controller.abort();
    await expect(
      engine.ingest(CORPUS, { chunking: 'off', abortSignal: controller.signal }),
    ).rejects.toThrow();
  });

  it('honors an abort raised between the chunk and embed phases', async () => {
    const { engine } = makeEngine();
    const controller = new AbortController();
    await expect(
      engine.ingest(CORPUS, {
        chunking: 'off',
        abortSignal: controller.signal,
        onProgress: (p) => {
          // Abort exactly when the chunk phase completes — the embed phase's
          // signal checks must then throw.
          if (p.phase === 'chunk' && p.completed === CORPUS.length) controller.abort();
        },
      }),
    ).rejects.toThrow();

    // The index is left empty (nothing was stored before the abort).
    const stats = await engine.stats();
    expect(stats.chunks).toBe(0);
  });

  it('rejects search and ask when the signal is already aborted', async () => {
    const { engine } = makeEngine();
    await engine.ingest(CORPUS, { chunking: 'off' });

    const c1 = new AbortController();
    c1.abort();
    await expect(engine.search('q', { topK: 3, abortSignal: c1.signal })).rejects.toThrow();

    const c2 = new AbortController();
    c2.abort();
    await expect(engine.ask('q', { topK: 3, abortSignal: c2.signal })).rejects.toThrow();
  });
});
