/**
 * @fileoverview Integration tests for VectorDB with product quantization (PQ).
 *
 * Tests the full lifecycle: create PQ-quantized VectorDB, add/addMany,
 * get/search/update/delete, export/import, recalibrate, backward compatibility,
 * and recall benchmarks.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createVectorDB, trainPQ, pqQuantize, pqDequantize } from '../src/index.js';
import type { VectorDB } from '../src/index.js';

// ============================================================================
// Helper utilities
// ============================================================================

/** Create a deterministic pseudo-random vector */
function createTestVector(dimensions: number, seed: number): Float32Array {
  const vec = new Float32Array(dimensions);
  let s = seed;
  for (let i = 0; i < dimensions; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    vec[i] = (s / 0x7fffffff) * 2 - 1; // Range [-1, 1]
  }
  return vec;
}

/**
 * Generate Gaussian-like normalized vectors (more realistic for embeddings).
 */
function createGaussianVector(dimensions: number, seed: number): Float32Array {
  const vec = new Float32Array(dimensions);
  let s = seed;
  for (let i = 0; i < dimensions; i++) {
    let sum = 0;
    for (let j = 0; j < 4; j++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      sum += (s / 0x7fffffff) * 2 - 1;
    }
    vec[i] = sum / 4;
  }

  // Normalize
  let norm = 0;
  for (let i = 0; i < dimensions; i++) {
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dimensions; i++) {
      vec[i] /= norm;
    }
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
// PQ VectorDB integration tests
// ============================================================================

describe('VectorDB with PQ quantization', () => {
  // Use 48 dimensions (divisible by default subvectors=48)
  // But for faster tests, use custom subvectors
  const dimensions = 48;
  let db: VectorDB;

  afterEach(async () => {
    if (db) {
      await db.close();
    }
  });

  it('creates a PQ-quantized VectorDB and adds a document', async () => {
    db = await createVectorDB({
      name: 'test-pq-basic',
      dimensions,
      storage: 'memory',
      quantization: { type: 'pq', subvectors: 6, centroids: 16, maxIterations: 5 },
    });

    const vector = createTestVector(dimensions, 1);
    await db.add({ id: 'doc1', vector, metadata: { title: 'Test' } });

    const stats = await db.stats();
    expect(stats.count).toBe(1);
  });

  it('get() returns Float32Array of correct dimensions', async () => {
    db = await createVectorDB({
      name: 'test-pq-get',
      dimensions,
      storage: 'memory',
      quantization: { type: 'pq', subvectors: 6, centroids: 16, maxIterations: 5 },
    });

    const original = createTestVector(dimensions, 42);
    await db.add({ id: 'doc1', vector: original, metadata: { test: true } });

    const result = await db.get('doc1');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('doc1');
    expect(result!.vector).toBeInstanceOf(Float32Array);
    expect(result!.vector.length).toBe(dimensions);
    expect(result!.metadata).toEqual({ test: true });
  });

  it('addMany works with PQ quantization', async () => {
    db = await createVectorDB({
      name: 'test-pq-addmany',
      dimensions,
      storage: 'memory',
      quantization: { type: 'pq', subvectors: 6, centroids: 16, maxIterations: 5 },
    });

    const docs = Array.from({ length: 50 }, (_, i) => ({
      id: `doc${i}`,
      vector: createTestVector(dimensions, i),
      metadata: { index: i },
    }));

    await db.addMany(docs);

    const stats = await db.stats();
    expect(stats.count).toBe(50);
  });

  it('search returns correct results with PQ', async () => {
    db = await createVectorDB({
      name: 'test-pq-search',
      dimensions,
      storage: 'memory',
      quantization: { type: 'pq', subvectors: 6, centroids: 16, maxIterations: 5 },
    });

    const docs = Array.from({ length: 30 }, (_, i) => ({
      id: `doc${i}`,
      vector: createTestVector(dimensions, i),
    }));

    await db.addMany(docs);

    // Search for the first vector -- should find itself as best match
    // (HNSW uses Float32, so search is exact)
    const results = await db.search(docs[0].vector, { k: 5 });

    expect(results.length).toBe(5);
    expect(results[0].id).toBe('doc0');
    expect(results[0].score).toBeGreaterThan(0.9);
  });

  it('search with includeVectors returns Float32Array', async () => {
    db = await createVectorDB({
      name: 'test-pq-include-vectors',
      dimensions,
      storage: 'memory',
      quantization: { type: 'pq', subvectors: 6, centroids: 16, maxIterations: 5 },
    });

    const original = createTestVector(dimensions, 1);
    await db.add({ id: 'doc1', vector: original });

    const results = await db.search(original, { k: 1, includeVectors: true });
    expect(results[0].vector).toBeInstanceOf(Float32Array);
    expect(results[0].vector!.length).toBe(dimensions);
  });

  it('update() works with PQ', async () => {
    db = await createVectorDB({
      name: 'test-pq-update',
      dimensions,
      storage: 'memory',
      quantization: { type: 'pq', subvectors: 6, centroids: 16, maxIterations: 5 },
    });

    const v1 = createTestVector(dimensions, 1);
    await db.add({ id: 'doc1', vector: v1 });

    const v2 = createTestVector(dimensions, 2);
    await db.update('doc1', { vector: v2 });

    // HNSW index should find the updated vector
    const results = await db.search(v2, { k: 1 });
    expect(results[0].id).toBe('doc1');
  });

  it('delete() works with PQ', async () => {
    db = await createVectorDB({
      name: 'test-pq-delete',
      dimensions,
      storage: 'memory',
      quantization: { type: 'pq', subvectors: 6, centroids: 16, maxIterations: 5 },
    });

    await db.add({ id: 'doc1', vector: createTestVector(dimensions, 1) });
    await db.add({ id: 'doc2', vector: createTestVector(dimensions, 2) });

    await db.delete('doc1');

    const result = await db.get('doc1');
    expect(result).toBeNull();

    const stats = await db.stats();
    expect(stats.count).toBe(1);
  });

  it('clear() resets PQ codebook', async () => {
    db = await createVectorDB({
      name: 'test-pq-clear',
      dimensions,
      storage: 'memory',
      quantization: { type: 'pq', subvectors: 6, centroids: 16, maxIterations: 5 },
    });

    await db.add({ id: 'doc1', vector: createTestVector(dimensions, 1) });
    await db.clear();

    const stats = await db.stats();
    expect(stats.count).toBe(0);

    // Should be able to add new vectors (retrains codebook from scratch)
    await db.add({ id: 'doc2', vector: createTestVector(dimensions, 2) });
    const stats2 = await db.stats();
    expect(stats2.count).toBe(1);
  });
});

// ============================================================================
// Backward compatibility tests
// ============================================================================

describe('VectorDB backward compatibility with PQ upgrade', () => {
  it('scalar-quantized VectorDB works after PQ code is added', async () => {
    const db = await createVectorDB({
      name: 'test-pq-backward-scalar',
      dimensions: 16,
      storage: 'memory',
      quantization: { type: 'scalar' },
    });

    const v1 = createTestVector(16, 1);
    await db.add({ id: 'doc1', vector: v1 });

    const result = await db.get('doc1');
    expect(result).not.toBeNull();
    expect(result!.vector).toBeInstanceOf(Float32Array);
    expect(result!.vector.length).toBe(16);

    const sim = cosineSim(v1, result!.vector);
    expect(sim).toBeGreaterThan(0.95);

    const results = await db.search(v1, { k: 1 });
    expect(results[0].id).toBe('doc1');

    await db.close();
  });

  it('unquantized VectorDB works after PQ code is added', async () => {
    const db = await createVectorDB({
      name: 'test-pq-backward-none',
      dimensions: 8,
      storage: 'memory',
    });

    const vector = new Float32Array([1, 0, 0, 0, 0, 0, 0, 0]);
    await db.add({ id: 'doc1', vector, metadata: { type: 'test' } });

    const result = await db.get('doc1');
    expect(result).not.toBeNull();
    // Without quantization, vectors should be exact
    expect(result!.vector).toEqual(vector);

    await db.close();
  });

  it('recalibrate throws when quantization is not enabled', async () => {
    const db = await createVectorDB({
      name: 'test-pq-backward-recalibrate',
      dimensions: 8,
      storage: 'memory',
    });

    await expect(db.recalibrate()).rejects.toThrow(/quantization is not enabled/);

    await db.close();
  });
});

// ============================================================================
// Export / Import with PQ
// ============================================================================

describe('VectorDB export/import with PQ', () => {
  const dimensions = 48;

  it('export dequantizes PQ vectors to Float32 values', async () => {
    const db = await createVectorDB({
      name: 'test-pq-export',
      dimensions,
      storage: 'memory',
      quantization: { type: 'pq', subvectors: 6, centroids: 16, maxIterations: 5 },
    });

    const original = createTestVector(dimensions, 42);
    await db.add({ id: 'doc1', vector: original });

    const blob = await db.export();
    const data = JSON.parse(await blob.text());

    // Exported vectors should be number arrays (dequantized from PQ)
    expect(data.collections[0].documents[0].vector).toBeInstanceOf(Array);
    expect(data.collections[0].documents[0].vector.length).toBe(dimensions);

    // All values should be finite floats (not centroid indices)
    for (const val of data.collections[0].documents[0].vector) {
      expect(typeof val).toBe('number');
      expect(isFinite(val)).toBe(true);
    }

    await db.close();
  });

  it('import into PQ DB trains codebook and encodes vectors', async () => {
    // Create source DB with data (no quantization)
    const sourceDb = await createVectorDB({
      name: 'test-pq-import-source',
      dimensions,
      storage: 'memory',
    });

    const vecs = Array.from({ length: 20 }, (_, i) => createTestVector(dimensions, i));
    for (let i = 0; i < 20; i++) {
      await sourceDb.add({ id: `doc${i}`, vector: vecs[i] });
    }
    const blob = await sourceDb.export();
    await sourceDb.close();

    // Import into PQ-quantized DB
    const targetDb = await createVectorDB({
      name: 'test-pq-import-target',
      dimensions,
      storage: 'memory',
      quantization: { type: 'pq', subvectors: 6, centroids: 16, maxIterations: 5 },
    });

    await targetDb.import(blob, { mode: 'replace' });

    // Verify data is searchable
    const results = await targetDb.search(vecs[0], { k: 1 });
    expect(results[0].id).toBe('doc0');

    // Verify get returns Float32Array
    const doc = await targetDb.get('doc0');
    expect(doc).not.toBeNull();
    expect(doc!.vector).toBeInstanceOf(Float32Array);
    expect(doc!.vector.length).toBe(dimensions);

    await targetDb.close();
  });
});

// ============================================================================
// Recalibrate with PQ
// ============================================================================

describe('VectorDB recalibrate() with PQ', () => {
  const dimensions = 48;

  it('retrains codebook and re-encodes vectors', async () => {
    const db = await createVectorDB({
      name: 'test-pq-recalibrate',
      dimensions,
      storage: 'memory',
      quantization: { type: 'pq', subvectors: 6, centroids: 16, maxIterations: 5 },
    });

    // Add vectors
    for (let i = 0; i < 30; i++) {
      await db.add({ id: `doc${i}`, vector: createTestVector(dimensions, i) });
    }

    // Recalibrate
    let progressCalled = false;
    await db.recalibrate({
      onProgress: (completed, total) => {
        progressCalled = true;
        expect(completed).toBeLessThanOrEqual(total);
        expect(total).toBe(30);
      },
    });

    expect(progressCalled).toBe(true);

    // Search should still work
    const results = await db.search(createTestVector(dimensions, 0), { k: 1 });
    expect(results[0].id).toBe('doc0');

    // Get should return valid vectors
    const doc = await db.get('doc0');
    expect(doc).not.toBeNull();
    expect(doc!.vector).toBeInstanceOf(Float32Array);
    expect(doc!.vector.length).toBe(dimensions);

    await db.close();
  });

  it('supports AbortSignal during PQ recalibration', async () => {
    const db = await createVectorDB({
      name: 'test-pq-recalibrate-abort',
      dimensions,
      storage: 'memory',
      quantization: { type: 'pq', subvectors: 6, centroids: 16, maxIterations: 5 },
    });

    for (let i = 0; i < 10; i++) {
      await db.add({ id: `doc${i}`, vector: createTestVector(dimensions, i) });
    }

    const controller = new AbortController();
    controller.abort();

    await expect(
      db.recalibrate({ abortSignal: controller.signal })
    ).rejects.toThrow();

    await db.close();
  });
});

// ============================================================================
// Recall benchmark
// ============================================================================

describe('PQ recall quality', () => {
  it('achieves >85% recall@10 with PQ quantization', async () => {
    const dimensions = 384;
    const numDocs = 200;
    const numQueries = 20;
    const k = 10;

    // Use Gaussian-like vectors for more realistic distribution
    const vectors = Array.from({ length: numDocs + numQueries }, (_, i) =>
      createGaussianVector(dimensions, i * 13 + 5)
    );

    const docVectors = vectors.slice(0, numDocs);
    const queryVectors = vectors.slice(numDocs);

    // Create baseline DB (no quantization)
    const baselineDb = await createVectorDB({
      name: 'test-pq-recall-baseline',
      dimensions,
      storage: 'memory',
    });

    // Create PQ-quantized DB
    const pqDb = await createVectorDB({
      name: 'test-pq-recall-pq',
      dimensions,
      storage: 'memory',
      quantization: { type: 'pq', subvectors: 48, centroids: 128, maxIterations: 10 },
    });

    // Add same vectors to both
    const docs = docVectors.map((v, i) => ({ id: `doc${i}`, vector: v }));
    await baselineDb.addMany(docs);
    await pqDb.addMany(docs);

    // HNSW search uses Float32 in both cases (Phase 1),
    // so recall should be ~100% since search quality is identical.
    // The test validates that PQ encoding/decoding doesn't corrupt
    // the in-memory HNSW index.
    let totalRecall = 0;

    for (let q = 0; q < numQueries; q++) {
      const query = queryVectors[q];

      const baselineResults = await baselineDb.search(query, { k });
      const pqResults = await pqDb.search(query, { k });

      const baselineIds = new Set(baselineResults.map((r) => r.id));

      let hits = 0;
      for (const r of pqResults) {
        if (baselineIds.has(r.id)) hits++;
      }

      totalRecall += hits / k;
    }

    const avgRecall = totalRecall / numQueries;

    // Since both use Float32 HNSW in Phase 1, recall should be very high
    expect(avgRecall).toBeGreaterThan(0.85);

    await baselineDb.close();
    await pqDb.close();
  });

  it('PQ dequantized vectors preserve cosine similarity (standalone test)', () => {
    // Pure PQ test without VectorDB, testing the compression quality
    const dimensions = 384;
    const numVectors = 500;

    const vectors = Array.from({ length: numVectors }, (_, i) =>
      createGaussianVector(dimensions, i * 17 + 42)
    );

    const codebook = trainPQ(vectors, {
      subvectors: 48,
      centroids: Math.min(256, numVectors),
      maxIterations: 15,
    });

    // Check that dequantized vectors are still similar to originals
    let totalSim = 0;
    const testCount = 100;

    for (let i = 0; i < testCount; i++) {
      const original = vectors[i];
      const encoded = pqQuantize(original, codebook);
      const decoded = pqDequantize(encoded, codebook);
      totalSim += cosineSim(original, decoded);
    }

    const avgSim = totalSim / testCount;
    expect(avgSim).toBeGreaterThan(0.8);
  });
});
