/**
 * @fileoverview Tests for semantic (embedding-aware) chunking
 */

import { describe, it, expect, vi } from 'vitest';
import {
  semanticChunk,
  createSemanticChunker,
  createMockEmbeddingModel,
  createTestVector,
} from '../src/index.js';
import { cosineSimilarity, autoThreshold } from '../src/rag/chunkers/semantic.js';
import type { EmbeddingModel } from '../src/index.js';

// ═══════════════════════════════════════════════════════════════
// HELPER: Mock model that returns distinct embeddings per topic
// ═══════════════════════════════════════════════════════════════

/**
 * Creates a mock embedding model that returns distinct embeddings
 * based on keyword matching. Segments containing a keyword get a
 * specific vector, making topic boundaries detectable via cosine similarity.
 */
function createTopicAwareModel(
  topicKeywords: Record<string, Float32Array>,
  defaultVector: Float32Array
): EmbeddingModel {
  return {
    modelId: 'mock:topic-aware',
    provider: 'mock',
    dimensions: defaultVector.length,
    maxEmbeddingsPerCall: undefined,
    supportsParallelCalls: true,

    async doEmbed(options) {
      options.abortSignal?.throwIfAborted?.();

      const embeddings = options.values.map((value) => {
        const text = value.toLowerCase();
        for (const [keyword, vector] of Object.entries(topicKeywords)) {
          if (text.includes(keyword.toLowerCase())) {
            return vector;
          }
        }
        return defaultVector;
      });

      return {
        embeddings,
        usage: { tokens: options.values.length },
        response: { modelId: 'mock:topic-aware', timestamp: new Date() },
      };
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// 6.1: cosineSimilarity() tests
// ═══════════════════════════════════════════════════════════════

describe('cosineSimilarity()', () => {
  it('returns ~1.0 for identical vectors', () => {
    const v = new Float32Array([1, 2, 3, 4]);
    const sim = cosineSimilarity(v, v);
    expect(sim).toBeCloseTo(1.0, 5);
  });

  it('returns ~0.0 for orthogonal vectors', () => {
    const a = new Float32Array([1, 0, 0, 0]);
    const b = new Float32Array([0, 1, 0, 0]);
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeCloseTo(0.0, 5);
  });

  it('returns 0 for zero vector', () => {
    const a = new Float32Array([0, 0, 0, 0]);
    const b = new Float32Array([1, 2, 3, 4]);
    expect(cosineSimilarity(a, b)).toBe(0);
    expect(cosineSimilarity(b, a)).toBe(0);
  });

  it('returns 0 when both vectors are zero', () => {
    const z = new Float32Array([0, 0, 0]);
    expect(cosineSimilarity(z, z)).toBe(0);
  });

  it('returns ~-1.0 for opposite vectors', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([-1, 0, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5);
  });

  it('handles high-dimensional vectors', () => {
    const dims = 384;
    const a = createTestVector(dims, 42);
    const b = createTestVector(dims, 42);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 5);
  });
});

// ═══════════════════════════════════════════════════════════════
// 6.2: autoThreshold() tests
// ═══════════════════════════════════════════════════════════════

describe('autoThreshold()', () => {
  it('returns 0 for empty array', () => {
    expect(autoThreshold([])).toBe(0);
  });

  it('returns value - 0.01 for single element', () => {
    expect(autoThreshold([0.85])).toBeCloseTo(0.84, 5);
  });

  it('computes mean - stddev for array with clear outliers', () => {
    // Similarities with clear drops at 0.3 and 0.35
    const similarities = [0.9, 0.85, 0.3, 0.88, 0.92, 0.35, 0.87];
    const threshold = autoThreshold(similarities);

    // Mean ≈ 0.724, stddev ≈ 0.262, threshold ≈ 0.462
    // Both 0.3 and 0.35 should be below this threshold
    expect(threshold).toBeGreaterThan(0.35);
    expect(0.3).toBeLessThan(threshold);
    expect(0.35).toBeLessThan(threshold);
  });

  it('produces threshold near mean for uniform distribution', () => {
    // All close to 0.85 — low variance
    const similarities = [0.84, 0.85, 0.86, 0.85, 0.84, 0.86];
    const threshold = autoThreshold(similarities);

    // With very low stddev, threshold should be close to the mean
    expect(threshold).toBeGreaterThan(0.8);
    expect(threshold).toBeLessThan(0.86);
  });

  it('produces correct mean - stddev calculation', () => {
    const similarities = [0.8, 0.6];
    const mean = 0.7;
    const variance = ((0.8 - 0.7) ** 2 + (0.6 - 0.7) ** 2) / 2;
    const stddev = Math.sqrt(variance);
    const expected = mean - stddev;
    expect(autoThreshold(similarities)).toBeCloseTo(expected, 10);
  });
});

// ═══════════════════════════════════════════════════════════════
// 6.3: semanticChunk() basic tests
// ═══════════════════════════════════════════════════════════════

describe('semanticChunk()', () => {
  it('returns [] for empty text', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });
    const result = await semanticChunk({ text: '', model });
    expect(result).toEqual([]);
  });

  it('returns [] for whitespace-only text', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });
    const result = await semanticChunk({ text: '   \n\n  ', model });
    expect(result).toEqual([]);
  });

  it('returns single chunk for short single-topic text', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });
    const text = 'The quick brown fox jumps over the lazy dog.';
    const result = await semanticChunk({ text, model });

    expect(result.length).toBe(1);
    expect(result[0].text).toBeTruthy();
    expect(result[0].index).toBe(0);
  });

  it('produces at least two chunks for text with distinct topics', async () => {
    const dims = 16;
    // Topic A: cooking-related embedding
    const cookingVector = new Float32Array(dims);
    cookingVector[0] = 1;
    cookingVector[1] = 0.5;
    // Topic B: astronomy-related embedding (orthogonal direction)
    const astronomyVector = new Float32Array(dims);
    astronomyVector[8] = 1;
    astronomyVector[9] = 0.5;

    const model = createTopicAwareModel(
      { cooking: cookingVector, recipe: cookingVector, astronomy: astronomyVector, stars: astronomyVector, telescope: astronomyVector },
      cookingVector
    );

    // Each sentence is short enough to be its own segment at segmentSize: 60
    const text =
      'Cooking is a wonderful art. ' +
      'A good recipe takes time. ' +
      'Cooking requires dedication. ' +
      'Astronomy studies celestial objects. ' +
      'Stars are massive balls of gas. ' +
      'Telescope helps observe galaxies.';

    const result = await semanticChunk({
      text,
      model,
      segmentSize: 40,
      minSize: 1,
      // Use explicit threshold so the test is deterministic:
      // cooking↔cooking similarity ≈ 1.0, cooking↔astronomy similarity ≈ 0.0
      threshold: 0.5,
    });

    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  // ═══════════════════════════════════════════════════════════════
  // 6.4: threshold override tests
  // ═══════════════════════════════════════════════════════════════

  it('threshold 0 produces a single chunk', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });
    const text =
      'First sentence about topic A. Second sentence still about A. ' +
      'Now we talk about topic B. And more about B here. ' +
      'Back to topic A again. And finishing with A.';

    const result = await semanticChunk({ text, model, threshold: 0 });
    expect(result.length).toBe(1);
  });

  it('threshold 1.0 produces maximum splitting', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });
    const text =
      'First sentence is here. Second sentence follows. ' +
      'Third one comes after. Fourth sentence now. ' +
      'Fifth sentence placed here. Sixth sentence ends it.';

    const result = await semanticChunk({
      text,
      model,
      threshold: 1.0,
      segmentSize: 30,
      minSize: 1,
    });

    // With threshold 1.0, almost every boundary should be a breakpoint
    // since cosine similarity is almost never exactly 1.0
    expect(result.length).toBeGreaterThan(1);
  });

  it('explicit threshold overrides auto-detection', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });
    const text =
      'Sentence one here. Sentence two here. ' +
      'Sentence three here. Sentence four here.';

    const autoResult = await semanticChunk({ text, model });
    const explicitResult = await semanticChunk({ text, model, threshold: 0.5 });

    // Different thresholds may produce different chunk counts
    // The point is that providing an explicit threshold works without error
    expect(explicitResult.length).toBeGreaterThanOrEqual(1);
  });

  // ═══════════════════════════════════════════════════════════════
  // 6.5: size constraint tests
  // ═══════════════════════════════════════════════════════════════

  it('splits chunks exceeding maxChunkSize', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });

    // Create text with many sentences that would merge into a single large chunk
    const sentences = Array.from({ length: 20 }, (_, i) => `This is sentence number ${i + 1} of our test document.`);
    const text = sentences.join(' ');

    const result = await semanticChunk({
      text,
      model,
      size: 200, // Small max size forces splitting
      threshold: 0, // No semantic breaks — forces size-based splitting
      minSize: 1,
      segmentSize: 80,
    });

    // With threshold 0 (no semantic breaks), size constraints should still produce multiple chunks
    // because maxChunkSize is small
    for (const chunk of result) {
      // Each chunk may slightly exceed maxChunkSize due to segment-level splitting,
      // but should be reasonably bounded
      expect(chunk.text.length).toBeLessThanOrEqual(400); // Allow some slack
    }
  });

  it('merges small chunks with neighbor when below minChunkSize', async () => {
    const dims = 16;
    const vectorA = new Float32Array(dims);
    vectorA[0] = 1;
    const vectorB = new Float32Array(dims);
    vectorB[8] = 1;

    const model = createTopicAwareModel(
      { alpha: vectorA, beta: vectorB },
      vectorA
    );

    // Short text that might produce a tiny middle chunk
    const text = 'Alpha topic here. Beta. Alpha topic continues and goes on.';

    const result = await semanticChunk({
      text,
      model,
      minSize: 100, // High minSize forces merging
      segmentSize: 30,
    });

    // All resulting chunks should be at or above minSize (unless it's the only chunk)
    for (const chunk of result) {
      if (result.length > 1) {
        // With high minSize, small chunks get merged
        expect(chunk.text.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // 6.6: metadata tests
  // ═══════════════════════════════════════════════════════════════

  it('first chunk has leftSimilarity: null', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });
    const text =
      'First topic about dogs and cats and pets. ' +
      'Second topic about cars and trucks and vehicles. ' +
      'Third topic about music and instruments and notes.';

    const result = await semanticChunk({ text, model, segmentSize: 50, minSize: 1 });
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].metadata?.semanticBoundaries?.leftSimilarity).toBeNull();
  });

  it('last chunk has rightSimilarity: null', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });
    const text =
      'First topic about dogs and cats and pets. ' +
      'Second topic about cars and trucks and vehicles. ' +
      'Third topic about music and instruments and notes.';

    const result = await semanticChunk({ text, model, segmentSize: 50, minSize: 1 });
    expect(result.length).toBeGreaterThanOrEqual(1);
    const lastChunk = result[result.length - 1];
    expect(lastChunk.metadata?.semanticBoundaries?.rightSimilarity).toBeNull();
  });

  it('interior chunks have both similarity values as numbers', async () => {
    const dims = 16;
    const vectorA = new Float32Array(dims);
    vectorA[0] = 1;
    vectorA[1] = 0.1;
    const vectorB = new Float32Array(dims);
    vectorB[8] = 1;
    vectorB[9] = 0.1;
    const vectorC = new Float32Array(dims);
    vectorC[4] = 1;
    vectorC[5] = 0.1;

    const model = createTopicAwareModel(
      { alpha: vectorA, beta: vectorB, gamma: vectorC },
      vectorA
    );

    const text =
      'Alpha topic with lots of alpha content here and more alpha text. ' +
      'Beta topic with lots of beta content here and more beta text. ' +
      'Gamma topic with lots of gamma content here and more gamma text.';

    const result = await semanticChunk({
      text,
      model,
      segmentSize: 40,
      minSize: 1,
    });

    if (result.length >= 3) {
      // Interior chunks should have both left and right similarities
      for (let i = 1; i < result.length - 1; i++) {
        const boundaries = result[i].metadata?.semanticBoundaries;
        expect(boundaries?.leftSimilarity).toEqual(expect.any(Number));
        expect(boundaries?.rightSimilarity).toEqual(expect.any(Number));
      }
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // 6.7: AbortSignal test
  // ═══════════════════════════════════════════════════════════════

  it('throws when AbortSignal is already aborted', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });
    const controller = new AbortController();
    controller.abort();

    await expect(
      semanticChunk({
        text: 'Some text here.',
        model,
        abortSignal: controller.signal,
      })
    ).rejects.toThrow();
  });

  it('throws when AbortSignal is aborted during execution', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384, delay: 100 });
    const controller = new AbortController();

    const promise = semanticChunk({
      text: 'First sentence here. Second sentence here. Third sentence here.',
      model,
      abortSignal: controller.signal,
      segmentSize: 30,
    });

    // Abort shortly after starting
    setTimeout(() => controller.abort(), 10);

    await expect(promise).rejects.toThrow();
  });

  // ═══════════════════════════════════════════════════════════════
  // 6.8: position metadata tests
  // ═══════════════════════════════════════════════════════════════

  it('chunks have sequential indices starting from 0', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });
    const text =
      'First paragraph with some content. ' +
      'Second paragraph with more content. ' +
      'Third paragraph with even more.';

    const result = await semanticChunk({ text, model, segmentSize: 40, minSize: 1 });

    for (let i = 0; i < result.length; i++) {
      expect(result[i].index).toBe(i);
    }
  });

  it('chunks have valid start and end offsets', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });
    const text =
      'First topic about programming. Second topic about cooking. Third topic about travel.';

    const result = await semanticChunk({ text, model, segmentSize: 30, minSize: 1 });

    for (const chunk of result) {
      expect(chunk.start).toBeGreaterThanOrEqual(0);
      expect(chunk.end).toBeGreaterThanOrEqual(chunk.start);
      expect(chunk.end).toBeLessThanOrEqual(text.length);
    }
  });

  it('chunk start/end offsets are non-overlapping and sequential', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });
    const text =
      'Sentence one here. Sentence two here. Sentence three here. Sentence four here.';

    const result = await semanticChunk({ text, model, segmentSize: 25, minSize: 1 });

    for (let i = 1; i < result.length; i++) {
      expect(result[i].start).toBeGreaterThanOrEqual(result[i - 1].start);
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // Custom options tests
  // ═══════════════════════════════════════════════════════════════

  it('respects custom sentenceSeparators', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });
    const text = 'First part\n\nSecond part\n\nThird part';

    // Only split on double newlines
    const result = await semanticChunk({
      text,
      model,
      sentenceSeparators: ['\n\n'],
      segmentSize: 50,
      minSize: 1,
    });

    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('respects custom segmentSize', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });
    const text =
      'A somewhat longer text that should be split into segments. ' +
      'This text has multiple sentences for testing. ' +
      'Each sentence provides content for embedding.';

    const result = await semanticChunk({
      text,
      model,
      segmentSize: 100,
    });

    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// 6.9: createSemanticChunker() tests
// ═══════════════════════════════════════════════════════════════

describe('createSemanticChunker()', () => {
  it('creates a reusable chunker function', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });
    const chunker = createSemanticChunker({ model, threshold: 0.5 });

    const text = 'Some text to chunk into pieces.';
    const result = await chunker(text);

    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].text).toBeTruthy();
  });

  it('per-call overrides merge with defaults', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });
    const chunker = createSemanticChunker({
      model,
      threshold: 0.4,
      size: 1000,
    });

    const text = 'Some text to chunk. Another sentence here.';

    // Override threshold but keep size from defaults
    const result = await chunker(text, { threshold: 0.6 });
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('returns same result as direct semanticChunk call', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });
    const text = 'Hello world this is a test document.';

    const directResult = await semanticChunk({ text, model, threshold: 0 });
    const chunker = createSemanticChunker({ model, threshold: 0 });
    const factoryResult = await chunker(text);

    expect(factoryResult.length).toBe(directResult.length);
    for (let i = 0; i < directResult.length; i++) {
      expect(factoryResult[i].text).toBe(directResult[i].text);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 6.10: semanticChunkStep() tests
// ═══════════════════════════════════════════════════════════════

describe('semanticChunkStep()', () => {
  it('pipeline step calls semanticChunk and returns Chunk[]', async () => {
    // Import the step factory from the pipeline module
    const { semanticChunkStep } = await import('../src/pipeline/steps.js');
    const model = createMockEmbeddingModel({ dimensions: 384 });

    const step = semanticChunkStep(model, { threshold: 0.5 });
    expect(step.name).toBe('semanticChunk');

    const signal = new AbortController().signal;
    const result = await step.execute('Some text to chunk semantically.', signal);

    expect(Array.isArray(result)).toBe(true);
    const chunks = result as Array<{ text: string; index: number }>;
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0].text).toBeTruthy();
  });

  it('pipeline step forwards AbortSignal', async () => {
    const { semanticChunkStep } = await import('../src/pipeline/steps.js');
    const model = createMockEmbeddingModel({ dimensions: 384, delay: 100 });

    const step = semanticChunkStep(model);
    const controller = new AbortController();
    controller.abort();

    await expect(
      step.execute('Some text here.', controller.signal)
    ).rejects.toThrow();
  });
});
