/**
 * @fileoverview Tests for semanticSearch() / streamSemanticSearch()
 *
 * Covers the ingest → semanticSearch round-trip: text stored by ingest()
 * under the shared text metadata key must come back on results[].text.
 */

import { describe, it, expect } from 'vitest';
import {
  createVectorDB,
  ingest,
  semanticSearch,
  streamSemanticSearch,
} from '../src/index.js';
import type { EmbeddingModel, VectorDB } from '../src/index.js';

const DIM = 16;

/**
 * Deterministic bag-of-words embedder: hashes words into a fixed-size
 * normalized vector so related texts land near each other.
 */
function embedText(text: string): Float32Array {
  const v = new Float32Array(DIM);
  for (const w of text.toLowerCase().split(/\W+/).filter(Boolean)) {
    let h = 0;
    for (const c of w) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    v[h % DIM] += 1;
  }
  let norm = 0;
  for (let i = 0; i < DIM; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < DIM; i++) v[i] /= norm;
  return v;
}

function createWordHashModel(): EmbeddingModel {
  return {
    modelId: 'mock:word-hash',
    provider: 'mock',
    dimensions: DIM,
    maxEmbeddingsPerCall: 100,
    supportsParallelCalls: true,
    async doEmbed({ values }) {
      return {
        embeddings: values.map(embedText),
        usage: { tokens: values.length },
      };
    },
  };
}

const DOCS = [
  {
    text: 'The reactor codename is Firefly. It was built in 1998 near the lake.',
    metadata: { source: 'reactor.pdf' },
  },
  {
    text: 'Bananas are yellow fruit rich in potassium and grown in the tropics.',
    metadata: { source: 'fruit.txt' },
  },
];

let dbCounter = 0;

async function createIngestedDb(): Promise<VectorDB> {
  const db = await createVectorDB({
    name: `semantic-search-test-${dbCounter++}`,
    dimensions: DIM,
    storage: 'memory',
  });
  await ingest(db, DOCS, {
    generateEmbeddings: true,
    embedder: async (texts) => texts.map(embedText),
  });
  return db;
}

describe('semanticSearch()', () => {
  it('round-trips text for ingested chunks', async () => {
    const db = await createIngestedDb();
    const model = createWordHashModel();

    const { results } = await semanticSearch({
      db,
      model,
      query: 'what is the reactor codename?',
      k: 3,
    });

    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      expect(result.text).toBeTypeOf('string');
      expect(DOCS.some((d) => d.text === result.text)).toBe(true);
    }
    // The reactor chunk must rank first for a reactor query
    expect(results[0].text).toBe(DOCS[0].text);
  });

  it('returns text for a chunk whose only text-like metadata is _text', async () => {
    const db = await createVectorDB({
      name: `semantic-search-test-${dbCounter++}`,
      dimensions: DIM,
      storage: 'memory',
    });
    await db.add({
      id: 'only-underscore-text',
      vector: embedText('chunk body'),
      metadata: { _text: 'chunk body' },
    });

    const { results } = await semanticSearch({
      db,
      model: createWordHashModel(),
      query: 'chunk body',
      k: 1,
    });

    expect(results).toHaveLength(1);
    expect(results[0].text).toBe('chunk body');
  });

  it('prefers explicit text metadata over the ingest-written _text', async () => {
    const db = await createVectorDB({
      name: `semantic-search-test-${dbCounter++}`,
      dimensions: DIM,
      storage: 'memory',
    });
    await db.add({
      id: 'both-keys',
      vector: embedText('some content here'),
      metadata: { text: 'user text', _text: 'ingest text' },
    });

    const { results } = await semanticSearch({
      db,
      model: createWordHashModel(),
      query: 'some content here',
      k: 1,
    });

    expect(results).toHaveLength(1);
    expect(results[0].text).toBe('user text');
  });

  it('returns undefined text when no text-like metadata exists', async () => {
    const db = await createVectorDB({
      name: `semantic-search-test-${dbCounter++}`,
      dimensions: DIM,
      storage: 'memory',
    });
    await db.add({
      id: 'no-text',
      vector: embedText('vector without text'),
      metadata: { source: 'raw.bin' },
    });

    const { results } = await semanticSearch({
      db,
      model: createWordHashModel(),
      query: 'vector without text',
      k: 1,
    });

    expect(results).toHaveLength(1);
    expect(results[0].text).toBeUndefined();
  });
});

describe('streamSemanticSearch()', () => {
  it('yields items with the same text extraction as semanticSearch', async () => {
    const db = await createIngestedDb();
    const model = createWordHashModel();

    const streamed: Array<{ id: string; text?: string }> = [];
    for await (const item of streamSemanticSearch({
      db,
      model,
      query: 'yellow fruit potassium',
      k: 2,
    })) {
      streamed.push(item);
    }

    expect(streamed.length).toBeGreaterThan(0);
    for (const item of streamed) {
      expect(item.text).toBeTypeOf('string');
      expect(DOCS.some((d) => d.text === item.text)).toBe(true);
    }
  });
});
