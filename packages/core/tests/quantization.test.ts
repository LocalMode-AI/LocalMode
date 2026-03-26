/**
 * @fileoverview Tests for vector quantization (scalar quantization / SQ8).
 *
 * Tests calibration, quantize/dequantize round-trip accuracy,
 * VectorDB integration with quantization, and backward compatibility.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  calibrate,
  scalarQuantize,
  scalarDequantize,
  mergeCalibration,
  createVectorDB,
  MemoryStorage,
} from '../src/index.js';
import type {
  ScalarCalibrationData,
  VectorDB,
} from '../src/index.js';

// ============================================================================
// Helper utilities
// ============================================================================

/** Create a deterministic pseudo-random vector */
function createTestVector(dimensions: number, seed: number): Float32Array {
  const vec = new Float32Array(dimensions);
  let s = seed;
  for (let i = 0; i < dimensions; i++) {
    // Simple LCG for deterministic randomness
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    vec[i] = (s / 0x7fffffff) * 2 - 1; // Range [-1, 1]
  }
  return vec;
}

/** Compute cosine similarity between two vectors */
function cosineSim(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const mag = Math.sqrt(normA) * Math.sqrt(normB);
  return mag === 0 ? 0 : dot / mag;
}

// ============================================================================
// Scalar quantization unit tests
// ============================================================================

describe('calibrate()', () => {
  it('computes per-dimension min and max from vectors', () => {
    const vectors = [
      new Float32Array([0.1, -0.5, 0.3]),
      new Float32Array([0.4, 0.2, -0.1]),
      new Float32Array([0.2, 0.0, 0.5]),
    ];

    const result = calibrate(vectors);

    expect(result.min).toBeInstanceOf(Float32Array);
    expect(result.max).toBeInstanceOf(Float32Array);
    expect(result.min.length).toBe(3);
    expect(result.max.length).toBe(3);

    // Dimension 0: min=0.1, max=0.4
    expect(result.min[0]).toBeCloseTo(0.1, 5);
    expect(result.max[0]).toBeCloseTo(0.4, 5);

    // Dimension 1: min=-0.5, max=0.2
    expect(result.min[1]).toBeCloseTo(-0.5, 5);
    expect(result.max[1]).toBeCloseTo(0.2, 5);

    // Dimension 2: min=-0.1, max=0.5
    expect(result.min[2]).toBeCloseTo(-0.1, 5);
    expect(result.max[2]).toBeCloseTo(0.5, 5);
  });

  it('handles single vector', () => {
    const vectors = [new Float32Array([1.0, 2.0, 3.0])];
    const result = calibrate(vectors);

    // min and max should be the same
    for (let i = 0; i < 3; i++) {
      expect(result.min[i]).toBe(result.max[i]);
    }
  });

  it('throws on empty vector array', () => {
    expect(() => calibrate([])).toThrow(/Cannot calibrate with zero vectors/);
  });

  it('handles negative-only values', () => {
    const vectors = [
      new Float32Array([-3, -2, -1]),
      new Float32Array([-5, -4, -3]),
    ];
    const result = calibrate(vectors);

    expect(result.min[0]).toBeCloseTo(-5, 5);
    expect(result.max[0]).toBeCloseTo(-3, 5);
  });

  it('handles high-dimensional vectors', () => {
    const dims = 384;
    const vectors = Array.from({ length: 100 }, (_, i) => createTestVector(dims, i));
    const result = calibrate(vectors);

    expect(result.min.length).toBe(dims);
    expect(result.max.length).toBe(dims);

    // All min values should be <= max values
    for (let d = 0; d < dims; d++) {
      expect(result.min[d]).toBeLessThanOrEqual(result.max[d]);
    }
  });
});

describe('scalarQuantize() / scalarDequantize() round-trip', () => {
  let calibration: ScalarCalibrationData;

  beforeEach(() => {
    // Calibrate from 100 random vectors
    const vectors = Array.from({ length: 100 }, (_, i) => createTestVector(8, i));
    calibration = calibrate(vectors);
  });

  it('produces Uint8Array output', () => {
    const vector = createTestVector(8, 42);
    const quantized = scalarQuantize(vector, calibration);

    expect(quantized).toBeInstanceOf(Uint8Array);
    expect(quantized.length).toBe(8);
  });

  it('values are in [0, 255] range', () => {
    const vector = createTestVector(8, 42);
    const quantized = scalarQuantize(vector, calibration);

    for (let i = 0; i < quantized.length; i++) {
      expect(quantized[i]).toBeGreaterThanOrEqual(0);
      expect(quantized[i]).toBeLessThanOrEqual(255);
    }
  });

  it('round-trip preserves vector approximately', () => {
    const vector = createTestVector(8, 42);
    const quantized = scalarQuantize(vector, calibration);
    const restored = scalarDequantize(quantized, calibration);

    expect(restored).toBeInstanceOf(Float32Array);
    expect(restored.length).toBe(8);

    // Each dimension should be close to original (within quantization error)
    for (let i = 0; i < 8; i++) {
      const range = calibration.max[i] - calibration.min[i];
      const maxError = range / 255; // Max quantization step
      expect(Math.abs(restored[i] - vector[i])).toBeLessThanOrEqual(maxError + 1e-6);
    }
  });

  it('round-trip preserves cosine similarity >0.99 for typical vectors', () => {
    // Use higher dimensions for more meaningful cosine similarity
    const dims = 384;
    const vectors = Array.from({ length: 200 }, (_, i) => createTestVector(dims, i));
    const cal = calibrate(vectors);

    let totalSimilarity = 0;
    const testCount = 50;

    for (let i = 0; i < testCount; i++) {
      const original = vectors[i];
      const quantized = scalarQuantize(original, cal);
      const restored = scalarDequantize(quantized, cal);
      totalSimilarity += cosineSim(original, restored);
    }

    const avgSimilarity = totalSimilarity / testCount;
    expect(avgSimilarity).toBeGreaterThan(0.99);
  });

  it('handles constant dimensions correctly', () => {
    // All same values in one dimension
    const vectors = [
      new Float32Array([5.0, 0.0]),
      new Float32Array([5.0, 1.0]),
      new Float32Array([5.0, -1.0]),
    ];
    const cal = calibrate(vectors);

    const quantized = scalarQuantize(new Float32Array([5.0, 0.5]), cal);
    const restored = scalarDequantize(quantized, cal);

    // Constant dimension should restore to the original constant value
    expect(restored[0]).toBeCloseTo(5.0, 5);
    // Variable dimension should be approximately correct
    expect(restored[1]).toBeCloseTo(0.5, 1);
  });

  it('clamps values outside calibrated range', () => {
    const cal: ScalarCalibrationData = {
      min: new Float32Array([0.0]),
      max: new Float32Array([1.0]),
    };

    // Value below range
    const qLow = scalarQuantize(new Float32Array([-0.5]), cal);
    expect(qLow[0]).toBe(0);

    // Value above range
    const qHigh = scalarQuantize(new Float32Array([1.5]), cal);
    expect(qHigh[0]).toBe(255);
  });
});

describe('mergeCalibration()', () => {
  it('expands ranges to encompass both calibrations', () => {
    const a: ScalarCalibrationData = {
      min: new Float32Array([0.0, -1.0]),
      max: new Float32Array([1.0, 0.5]),
    };
    const b: ScalarCalibrationData = {
      min: new Float32Array([-0.5, 0.0]),
      max: new Float32Array([0.5, 2.0]),
    };

    const merged = mergeCalibration(a, b);

    expect(merged.min[0]).toBeCloseTo(-0.5, 5);
    expect(merged.min[1]).toBeCloseTo(-1.0, 5);
    expect(merged.max[0]).toBeCloseTo(1.0, 5);
    expect(merged.max[1]).toBeCloseTo(2.0, 5);
  });
});

// ============================================================================
// VectorDB integration with quantization
// ============================================================================

describe('VectorDB with quantization', () => {
  let db: VectorDB;
  const dimensions = 16;

  afterEach(async () => {
    if (db) {
      await db.close();
    }
  });

  it('creates a quantized VectorDB and adds documents', async () => {
    db = await createVectorDB({
      name: 'test-quantized',
      dimensions,
      storage: 'memory',
      quantization: { type: 'scalar' },
    });

    const vector = createTestVector(dimensions, 1);
    await db.add({ id: 'doc1', vector, metadata: { title: 'Test' } });

    const stats = await db.stats();
    expect(stats.count).toBe(1);
  });

  it('search returns correct results with quantized vectors', async () => {
    db = await createVectorDB({
      name: 'test-quantized-search',
      dimensions,
      storage: 'memory',
      quantization: { type: 'scalar' },
    });

    // Add multiple vectors
    const vectors: Float32Array[] = [];
    for (let i = 0; i < 20; i++) {
      const vec = createTestVector(dimensions, i);
      vectors.push(vec);
      await db.add({ id: `doc${i}`, vector: vec });
    }

    // Search for the first vector — should find itself as the best match
    const results = await db.search(vectors[0], { k: 5 });

    expect(results.length).toBe(5);
    expect(results[0].id).toBe('doc0');
    expect(results[0].score).toBeGreaterThan(0.9);
  });

  it('addMany works with quantization', async () => {
    db = await createVectorDB({
      name: 'test-quantized-addmany',
      dimensions,
      storage: 'memory',
      quantization: { type: 'scalar' },
    });

    const docs = Array.from({ length: 50 }, (_, i) => ({
      id: `doc${i}`,
      vector: createTestVector(dimensions, i),
      metadata: { index: i },
    }));

    await db.addMany(docs);

    const stats = await db.stats();
    expect(stats.count).toBe(50);

    // Search should work
    const results = await db.search(docs[0].vector, { k: 1 });
    expect(results[0].id).toBe('doc0');
  });

  it('get() returns dequantized vectors', async () => {
    db = await createVectorDB({
      name: 'test-quantized-get',
      dimensions,
      storage: 'memory',
      quantization: { type: 'scalar' },
    });

    const originalVector = createTestVector(dimensions, 42);
    await db.add({ id: 'doc1', vector: originalVector, metadata: { test: true } });

    const result = await db.get('doc1');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('doc1');
    expect(result!.vector).toBeInstanceOf(Float32Array);
    expect(result!.vector.length).toBe(dimensions);
    expect(result!.metadata).toEqual({ test: true });

    // The returned vector should be close to original (within quantization error)
    const similarity = cosineSim(originalVector, result!.vector);
    expect(similarity).toBeGreaterThan(0.95);
  });

  it('update() works with quantized vectors', async () => {
    db = await createVectorDB({
      name: 'test-quantized-update',
      dimensions,
      storage: 'memory',
      quantization: { type: 'scalar' },
    });

    const v1 = createTestVector(dimensions, 1);
    await db.add({ id: 'doc1', vector: v1 });

    const v2 = createTestVector(dimensions, 2);
    await db.update('doc1', { vector: v2 });

    // Search should find the updated vector
    const results = await db.search(v2, { k: 1 });
    expect(results[0].id).toBe('doc1');
  });

  it('delete() works with quantized vectors', async () => {
    db = await createVectorDB({
      name: 'test-quantized-delete',
      dimensions,
      storage: 'memory',
      quantization: { type: 'scalar' },
    });

    await db.add({ id: 'doc1', vector: createTestVector(dimensions, 1) });
    await db.add({ id: 'doc2', vector: createTestVector(dimensions, 2) });

    await db.delete('doc1');

    const result = await db.get('doc1');
    expect(result).toBeNull();

    const stats = await db.stats();
    expect(stats.count).toBe(1);
  });

  it('clear() resets calibration', async () => {
    db = await createVectorDB({
      name: 'test-quantized-clear',
      dimensions,
      storage: 'memory',
      quantization: { type: 'scalar' },
    });

    await db.add({ id: 'doc1', vector: createTestVector(dimensions, 1) });
    await db.clear();

    const stats = await db.stats();
    expect(stats.count).toBe(0);

    // Should be able to add new vectors (recalibrates from scratch)
    await db.add({ id: 'doc2', vector: createTestVector(dimensions, 2) });
    const stats2 = await db.stats();
    expect(stats2.count).toBe(1);
  });

  it('search with includeVectors returns dequantized vectors', async () => {
    db = await createVectorDB({
      name: 'test-quantized-includevectors',
      dimensions,
      storage: 'memory',
      quantization: { type: 'scalar' },
    });

    const original = createTestVector(dimensions, 1);
    await db.add({ id: 'doc1', vector: original });

    const results = await db.search(original, { k: 1, includeVectors: true });
    expect(results[0].vector).toBeInstanceOf(Float32Array);
    expect(results[0].vector!.length).toBe(dimensions);

    const similarity = cosineSim(original, results[0].vector!);
    expect(similarity).toBeGreaterThan(0.95);
  });
});

// ============================================================================
// Backward compatibility
// ============================================================================

describe('VectorDB backward compatibility (no quantization)', () => {
  let db: VectorDB;
  const dimensions = 8;

  afterEach(async () => {
    if (db) {
      await db.close();
    }
  });

  it('existing VectorDB without quantization works unchanged', async () => {
    db = await createVectorDB({
      name: 'test-no-quant',
      dimensions,
      storage: 'memory',
    });

    const vector = new Float32Array([1, 0, 0, 0, 0, 0, 0, 0]);
    await db.add({ id: 'doc1', vector, metadata: { type: 'test' } });

    const result = await db.get('doc1');
    expect(result).not.toBeNull();
    // Without quantization, vectors should be exact
    expect(result!.vector).toEqual(vector);
  });

  it('search works without quantization', async () => {
    db = await createVectorDB({
      name: 'test-no-quant-search',
      dimensions,
      storage: 'memory',
    });

    await db.add({ id: 'v1', vector: new Float32Array([1, 0, 0, 0, 0, 0, 0, 0]) });
    await db.add({ id: 'v2', vector: new Float32Array([0, 1, 0, 0, 0, 0, 0, 0]) });
    await db.add({ id: 'v3', vector: new Float32Array([0.9, 0.1, 0, 0, 0, 0, 0, 0]) });

    const results = await db.search(new Float32Array([1, 0, 0, 0, 0, 0, 0, 0]), { k: 2 });
    expect(results.length).toBe(2);
    expect(results[0].id).toBe('v1');
    expect(results[1].id).toBe('v3');
  });

  it('recalibrate throws when quantization is not enabled', async () => {
    db = await createVectorDB({
      name: 'test-no-quant-recalibrate',
      dimensions,
      storage: 'memory',
    });

    await expect(db.recalibrate()).rejects.toThrow(/quantization is not enabled/);
  });
});

// ============================================================================
// Recalibrate
// ============================================================================

describe('VectorDB recalibrate()', () => {
  let db: VectorDB;
  const dimensions = 16;

  afterEach(async () => {
    if (db) {
      await db.close();
    }
  });

  it('recalibrates from current vectors', async () => {
    db = await createVectorDB({
      name: 'test-recalibrate',
      dimensions,
      storage: 'memory',
      quantization: { type: 'scalar' },
    });

    // Add initial vectors
    for (let i = 0; i < 20; i++) {
      await db.add({ id: `doc${i}`, vector: createTestVector(dimensions, i) });
    }

    // Recalibrate
    let progressCalled = false;
    await db.recalibrate({
      onProgress: (completed, total) => {
        progressCalled = true;
        expect(completed).toBeLessThanOrEqual(total);
        expect(total).toBe(20);
      },
    });

    expect(progressCalled).toBe(true);

    // Search should still work
    const results = await db.search(createTestVector(dimensions, 0), { k: 1 });
    expect(results[0].id).toBe('doc0');
  });

  it('supports AbortSignal', async () => {
    db = await createVectorDB({
      name: 'test-recalibrate-abort',
      dimensions,
      storage: 'memory',
      quantization: { type: 'scalar' },
    });

    for (let i = 0; i < 10; i++) {
      await db.add({ id: `doc${i}`, vector: createTestVector(dimensions, i) });
    }

    const controller = new AbortController();
    controller.abort();

    await expect(
      db.recalibrate({ abortSignal: controller.signal })
    ).rejects.toThrow();
  });
});

// ============================================================================
// Export/Import with quantization
// ============================================================================

describe('VectorDB export/import with quantization', () => {
  const dimensions = 8;

  it('export dequantizes vectors for portability', async () => {
    const db = await createVectorDB({
      name: 'test-export-quant',
      dimensions,
      storage: 'memory',
      quantization: { type: 'scalar' },
    });

    const original = new Float32Array([0.5, -0.3, 0.8, 0.1, -0.5, 0.2, 0.7, -0.1]);
    await db.add({ id: 'doc1', vector: original });

    const blob = await db.export();
    const data = JSON.parse(await blob.text());

    // Exported vectors should be number arrays (dequantized)
    expect(data.collections[0].documents[0].vector).toBeInstanceOf(Array);
    expect(data.collections[0].documents[0].vector.length).toBe(dimensions);

    await db.close();
  });

  it('import re-quantizes vectors if quantization is enabled', async () => {
    // Create source DB with data
    const sourceDb = await createVectorDB({
      name: 'test-import-source',
      dimensions,
      storage: 'memory',
    });

    const vecs = [
      new Float32Array([0.5, -0.3, 0.8, 0.1, -0.5, 0.2, 0.7, -0.1]),
      new Float32Array([-0.2, 0.4, -0.6, 0.3, 0.1, -0.8, 0.5, 0.9]),
    ];

    await sourceDb.add({ id: 'doc1', vector: vecs[0] });
    await sourceDb.add({ id: 'doc2', vector: vecs[1] });
    const blob = await sourceDb.export();
    await sourceDb.close();

    // Import into quantized DB
    const targetDb = await createVectorDB({
      name: 'test-import-target',
      dimensions,
      storage: 'memory',
      quantization: { type: 'scalar' },
    });

    await targetDb.import(blob, { mode: 'replace' });

    // Verify data is searchable
    const results = await targetDb.search(vecs[0], { k: 1 });
    expect(results[0].id).toBe('doc1');

    await targetDb.close();
  });
});

// ============================================================================
// Recall benchmark
// ============================================================================

describe('Quantization recall quality', () => {
  it('achieves >95% recall@10 with scalar quantization', async () => {
    const dimensions = 64;
    const numDocs = 200;
    const numQueries = 20;
    const k = 10;

    // Create baseline DB (no quantization)
    const baselineDb = await createVectorDB({
      name: 'test-recall-baseline',
      dimensions,
      storage: 'memory',
    });

    // Create quantized DB
    const quantizedDb = await createVectorDB({
      name: 'test-recall-quantized',
      dimensions,
      storage: 'memory',
      quantization: { type: 'scalar' },
    });

    // Add same vectors to both
    const docs = Array.from({ length: numDocs }, (_, i) => ({
      id: `doc${i}`,
      vector: createTestVector(dimensions, i),
    }));

    await baselineDb.addMany(docs);
    await quantizedDb.addMany(docs);

    // Run queries and measure recall
    let totalRecall = 0;

    for (let q = 0; q < numQueries; q++) {
      const query = createTestVector(dimensions, numDocs + q);

      const baselineResults = await baselineDb.search(query, { k });
      const quantizedResults = await quantizedDb.search(query, { k });

      const baselineIds = new Set(baselineResults.map((r) => r.id));
      const quantizedIds = quantizedResults.map((r) => r.id);

      let hits = 0;
      for (const id of quantizedIds) {
        if (baselineIds.has(id)) hits++;
      }

      totalRecall += hits / k;
    }

    const avgRecall = totalRecall / numQueries;

    // Recall should be >95%
    expect(avgRecall).toBeGreaterThan(0.95);

    await baselineDb.close();
    await quantizedDb.close();
  });
});
