/**
 * @fileoverview Integration tests for VectorDB with storage compression.
 *
 * Tests compressed VectorDB creation, add/get/search operations,
 * export/import, backward compatibility, getCompressionStats(),
 * and interaction with vector quantization.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createVectorDB,
  getCompressionStats,
  MemoryStorage,
} from '../src/index.js';
import type { VectorDB } from '../src/index.js';

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

const DIMENSIONS = 32;

// ============================================================================
// Compressed VectorDB -- basic operations
// ============================================================================

describe('Compressed VectorDB', () => {
  let db: VectorDB;

  beforeEach(async () => {
    db = await createVectorDB({
      name: 'compressed-test',
      dimensions: DIMENSIONS,
      storage: 'memory',
      compression: { type: 'sq8' },
    });
  });

  it('add() and get() returns Float32Array vector', async () => {
    const vector = createTestVector(DIMENSIONS, 1);
    await db.add({ id: 'doc1', vector, metadata: { title: 'test' } });

    const result = await db.get('doc1');
    expect(result).not.toBeNull();
    expect(result!.vector).toBeInstanceOf(Float32Array);
    expect(result!.vector.length).toBe(DIMENSIONS);
    expect(result!.metadata).toEqual({ title: 'test' });
  });

  it('get() returns approximate vector after compression', async () => {
    const vector = createTestVector(DIMENSIONS, 1);
    await db.add({ id: 'doc1', vector });

    const result = await db.get('doc1');
    expect(result).not.toBeNull();

    // Cosine similarity between original and decompressed should be very high
    const sim = cosineSim(vector, result!.vector);
    expect(sim).toBeGreaterThan(0.99);
  });

  it('addMany() works with compression', async () => {
    const docs = [];
    for (let i = 0; i < 50; i++) {
      docs.push({
        id: `doc${i}`,
        vector: createTestVector(DIMENSIONS, i),
        metadata: { index: i },
      });
    }

    await db.addMany(docs);

    for (let i = 0; i < 5; i++) {
      const result = await db.get(`doc${i}`);
      expect(result).not.toBeNull();
      expect(result!.vector).toBeInstanceOf(Float32Array);
    }
  });

  it('search() returns correct results with compressed storage', async () => {
    const vectors: Float32Array[] = [];
    for (let i = 0; i < 20; i++) {
      const vec = createTestVector(DIMENSIONS, i);
      vectors.push(vec);
      await db.add({ id: `doc${i}`, vector: vec });
    }

    // Search for the first vector — should find it as top result
    const results = await db.search(vectors[0], { k: 5 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe('doc0');
  });

  it('search() with includeVectors returns Float32Array', async () => {
    const vector = createTestVector(DIMENSIONS, 42);
    await db.add({ id: 'doc1', vector });

    const results = await db.search(vector, { k: 1, includeVectors: true });
    expect(results).toHaveLength(1);
    expect(results[0].vector).toBeInstanceOf(Float32Array);
    expect(results[0].vector!.length).toBe(DIMENSIONS);
  });

  it('search results are identical to uncompressed VectorDB', async () => {
    // Create compressed and uncompressed DBs with the same data
    const uncompressedDb = await createVectorDB({
      name: 'uncompressed-test',
      dimensions: DIMENSIONS,
      storage: 'memory',
    });

    const docs = [];
    for (let i = 0; i < 20; i++) {
      docs.push({
        id: `doc${i}`,
        vector: createTestVector(DIMENSIONS, i),
      });
    }

    await db.addMany(docs);
    await uncompressedDb.addMany(docs);

    // Search should return the same IDs and scores
    const query = createTestVector(DIMENSIONS, 999);
    const compressedResults = await db.search(query, { k: 5 });
    const uncompressedResults = await uncompressedDb.search(query, { k: 5 });

    // IDs should be the same since HNSW uses original Float32 vectors in both cases
    expect(compressedResults.map((r) => r.id)).toEqual(
      uncompressedResults.map((r) => r.id)
    );

    // Scores should be very close (HNSW operates on same data)
    for (let i = 0; i < compressedResults.length; i++) {
      expect(compressedResults[i].score).toBeCloseTo(
        uncompressedResults[i].score,
        5
      );
    }

    await uncompressedDb.close();
  });

  it('update() re-compresses vector', async () => {
    // Add initial batch to establish a good calibration range
    const docs = [];
    for (let i = 0; i < 20; i++) {
      docs.push({ id: `doc${i}`, vector: createTestVector(DIMENSIONS, i) });
    }
    await db.addMany(docs);

    // Update one document with a vector from the same distribution
    const updated = createTestVector(DIMENSIONS, 999);
    await db.update('doc0', { vector: updated });

    const result = await db.get('doc0');
    expect(result).not.toBeNull();
    expect(result!.vector).toBeInstanceOf(Float32Array);
    expect(result!.vector.length).toBe(DIMENSIONS);

    // The returned vector should be the compressed/decompressed version of the updated vector
    // not the original. We check cosine similarity to the updated vector is high.
    const sim = cosineSim(result!.vector, updated);
    expect(sim).toBeGreaterThan(0.95);
  });

  it('clear() resets compression calibration', async () => {
    await db.add({ id: 'doc1', vector: createTestVector(DIMENSIONS, 1) });
    await db.clear();

    // Should be able to add new vectors (recalibrates)
    await db.add({ id: 'doc2', vector: createTestVector(DIMENSIONS, 2) });
    const result = await db.get('doc2');
    expect(result).not.toBeNull();
    expect(result!.vector).toBeInstanceOf(Float32Array);
  });
});

// ============================================================================
// Backward compatibility
// ============================================================================

describe('Backward compatibility', () => {
  it('uncompressed VectorDB works identically after upgrade', async () => {
    const db = await createVectorDB({
      name: 'compat-test',
      dimensions: DIMENSIONS,
      storage: 'memory',
    });

    const vector = createTestVector(DIMENSIONS, 1);
    await db.add({ id: 'doc1', vector, metadata: { title: 'test' } });

    // All operations should work as before
    const result = await db.get('doc1');
    expect(result).not.toBeNull();
    expect(result!.vector).toBeInstanceOf(Float32Array);
    expect(result!.metadata).toEqual({ title: 'test' });

    // Vector should be exact (no compression)
    for (let i = 0; i < DIMENSIONS; i++) {
      expect(result!.vector[i]).toBe(vector[i]);
    }

    const searchResults = await db.search(vector, { k: 1 });
    expect(searchResults).toHaveLength(1);
    expect(searchResults[0].id).toBe('doc1');

    await db.close();
  });

  it('default createVectorDB does not compress', async () => {
    const db = await createVectorDB({
      name: 'default-test',
      dimensions: DIMENSIONS,
      storage: 'memory',
    });

    const vector = createTestVector(DIMENSIONS, 1);
    await db.add({ id: 'doc1', vector });

    const result = await db.get('doc1');
    expect(result).not.toBeNull();

    // Vector should be exact — no compression applied
    for (let i = 0; i < DIMENSIONS; i++) {
      expect(result!.vector[i]).toBe(vector[i]);
    }

    await db.close();
  });
});

// ============================================================================
// Export / Import
// ============================================================================

describe('Export / Import with compression', () => {
  it('export from compressed DB produces Float32 values', async () => {
    const db = await createVectorDB({
      name: 'export-test',
      dimensions: DIMENSIONS,
      storage: 'memory',
      compression: { type: 'sq8' },
    });

    const vector = createTestVector(DIMENSIONS, 1);
    await db.add({ id: 'doc1', vector });

    const blob = await db.export();
    const text = await blob.text();
    const data = JSON.parse(text);

    // Exported vector should be number[] (decompressed Float32 values)
    const exportedVector = data.collections[0].documents[0].vector;
    expect(Array.isArray(exportedVector)).toBe(true);
    expect(exportedVector.length).toBe(DIMENSIONS);

    // Values should be approximate (decompressed)
    for (let i = 0; i < DIMENSIONS; i++) {
      expect(typeof exportedVector[i]).toBe('number');
    }

    await db.close();
  });

  it('import into compressed DB re-compresses vectors', async () => {
    // Create a source DB (uncompressed) and export
    const sourceDb = await createVectorDB({
      name: 'source-test',
      dimensions: DIMENSIONS,
      storage: 'memory',
    });

    const vector = createTestVector(DIMENSIONS, 1);
    await sourceDb.add({ id: 'doc1', vector });
    const blob = await sourceDb.export();
    await sourceDb.close();

    // Import into compressed DB
    const targetDb = await createVectorDB({
      name: 'target-test',
      dimensions: DIMENSIONS,
      storage: 'memory',
      compression: { type: 'sq8' },
    });

    await targetDb.import(blob);

    // Verify the imported vector is decompressed on read
    const result = await targetDb.get('doc1');
    expect(result).not.toBeNull();
    expect(result!.vector).toBeInstanceOf(Float32Array);

    // It should be approximately equal to the original
    const sim = cosineSim(result!.vector, vector);
    expect(sim).toBeGreaterThan(0.99);

    await targetDb.close();
  });
});

// ============================================================================
// getCompressionStats()
// ============================================================================

describe('getCompressionStats()', () => {
  it('returns correct stats for compressed collection', async () => {
    const db = await createVectorDB({
      name: 'stats-test',
      dimensions: DIMENSIONS,
      storage: 'memory',
      compression: { type: 'sq8' },
    });

    for (let i = 0; i < 100; i++) {
      await db.add({ id: `doc${i}`, vector: createTestVector(DIMENSIONS, i) });
    }

    const stats = await getCompressionStats(db);

    expect(stats.enabled).toBe(true);
    expect(stats.type).toBe('sq8');
    expect(stats.vectorCount).toBe(100);
    expect(stats.dimensions).toBe(DIMENSIONS);
    expect(stats.originalSizeBytes).toBe(100 * DIMENSIONS * 4);
    expect(stats.compressedSizeBytes).toBe(100 * DIMENSIONS * 1);
    expect(stats.ratio).toBe(4.0);

    await db.close();
  });

  it('returns ratio 1.0 for uncompressed collection', async () => {
    const db = await createVectorDB({
      name: 'stats-uncompressed',
      dimensions: DIMENSIONS,
      storage: 'memory',
    });

    for (let i = 0; i < 10; i++) {
      await db.add({ id: `doc${i}`, vector: createTestVector(DIMENSIONS, i) });
    }

    const stats = await getCompressionStats(db);

    expect(stats.enabled).toBe(false);
    expect(stats.type).toBe('none');
    expect(stats.ratio).toBe(1.0);
    expect(stats.originalSizeBytes).toBe(stats.compressedSizeBytes);

    await db.close();
  });

  it('returns correct stats for empty compressed collection', async () => {
    const db = await createVectorDB({
      name: 'stats-empty',
      dimensions: DIMENSIONS,
      storage: 'memory',
      compression: { type: 'sq8' },
    });

    const stats = await getCompressionStats(db);

    expect(stats.enabled).toBe(true);
    expect(stats.vectorCount).toBe(0);
    expect(stats.originalSizeBytes).toBe(0);
    expect(stats.compressedSizeBytes).toBe(0);
    expect(stats.ratio).toBe(1.0); // 0/0 defaults to 1.0

    await db.close();
  });
});

// ============================================================================
// Compression + Quantization interaction
// ============================================================================

describe('Compression + Quantization interaction', () => {
  it('warns when both compression and quantization are enabled', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const db = await createVectorDB({
      name: 'both-test',
      dimensions: DIMENSIONS,
      storage: 'memory',
      quantization: { type: 'scalar' },
      compression: { type: 'sq8' },
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Storage compression has no effect when vector quantization')
    );

    // Should still work — quantization takes effect
    const vector = createTestVector(DIMENSIONS, 1);
    await db.add({ id: 'doc1', vector });

    const result = await db.get('doc1');
    expect(result).not.toBeNull();
    expect(result!.vector).toBeInstanceOf(Float32Array);

    warnSpy.mockRestore();
    await db.close();
  });
});

// ============================================================================
// compression: { type: 'none' }
// ============================================================================

describe('compression: { type: "none" }', () => {
  it('behaves identically to no compression config', async () => {
    const dbNone = await createVectorDB({
      name: 'none-test',
      dimensions: DIMENSIONS,
      storage: 'memory',
      compression: { type: 'none' },
    });

    const dbDefault = await createVectorDB({
      name: 'default-test-2',
      dimensions: DIMENSIONS,
      storage: 'memory',
    });

    const vector = createTestVector(DIMENSIONS, 1);
    await dbNone.add({ id: 'doc1', vector });
    await dbDefault.add({ id: 'doc1', vector });

    const resultNone = await dbNone.get('doc1');
    const resultDefault = await dbDefault.get('doc1');

    expect(resultNone).not.toBeNull();
    expect(resultDefault).not.toBeNull();

    // Both should return exact vectors (no compression)
    for (let i = 0; i < DIMENSIONS; i++) {
      expect(resultNone!.vector[i]).toBe(resultDefault!.vector[i]);
      expect(resultNone!.vector[i]).toBe(vector[i]);
    }

    await dbNone.close();
    await dbDefault.close();
  });
});
