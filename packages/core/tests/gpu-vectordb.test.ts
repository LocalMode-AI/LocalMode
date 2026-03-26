/**
 * @fileoverview Integration tests for VectorDB with GPU acceleration.
 *
 * Tests that VectorDB with enableGPU works correctly with CPU fallback,
 * produces identical results to non-GPU VectorDB, and properly cleans
 * up GPU resources on close().
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createVectorDB, MemoryStorage } from '../src/index.js';
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
    vec[i] = (s / 0x7fffffff) * 2 - 1;
  }
  return vec;
}

// ============================================================================
// Tests
// ============================================================================

describe('VectorDB with GPU acceleration', () => {
  const dimensions = 8;
  let db: VectorDB | null = null;

  afterEach(async () => {
    if (db) {
      await db.close();
      db = null;
    }
  });

  describe('enableGPU flag', () => {
    it('should create VectorDB with enableGPU: true', async () => {
      db = await createVectorDB({
        name: 'gpu-test-1',
        dimensions,
        storage: 'memory',
        enableGPU: true,
      });

      expect(db).toBeDefined();
    });

    it('should add and search with GPU enabled', async () => {
      db = await createVectorDB({
        name: 'gpu-test-2',
        dimensions,
        storage: 'memory',
        enableGPU: true,
      });

      const v1 = createTestVector(dimensions, 1);
      const v2 = createTestVector(dimensions, 2);
      const v3 = createTestVector(dimensions, 3);

      await db.add({ id: 'v1', vector: v1 });
      await db.add({ id: 'v2', vector: v2 });
      await db.add({ id: 'v3', vector: v3 });

      const results = await db.search(v1, { k: 2 });

      expect(results.length).toBeLessThanOrEqual(2);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe('v1'); // exact match
    });

    it('should support enableGPU combined with indexOptions.gpu', async () => {
      db = await createVectorDB({
        name: 'gpu-test-3',
        dimensions,
        storage: 'memory',
        enableGPU: true,
        indexOptions: {
          gpu: { batchThreshold: 128 },
        },
      });

      expect(db).toBeDefined();
    });
  });

  describe('GPU results match non-GPU results', () => {
    it('should produce same search results as non-GPU VectorDB', async () => {
      // Create GPU-enabled DB
      const gpuDb = await createVectorDB({
        name: 'gpu-compare-1',
        dimensions,
        storage: 'memory',
        enableGPU: true,
      });

      // Create non-GPU DB
      const cpuDb = await createVectorDB({
        name: 'cpu-compare-1',
        dimensions,
        storage: 'memory',
      });

      // Add same vectors to both
      const vectors = Array.from({ length: 20 }, (_, i) =>
        createTestVector(dimensions, i + 100),
      );

      for (let i = 0; i < vectors.length; i++) {
        await gpuDb.add({ id: `v${i}`, vector: vectors[i] });
        await cpuDb.add({ id: `v${i}`, vector: vectors[i] });
      }

      // Search both
      const query = createTestVector(dimensions, 999);
      const gpuResults = await gpuDb.search(query, { k: 5 });
      const cpuResults = await cpuDb.search(query, { k: 5 });

      // Results should be identical (CPU fallback in test env)
      expect(gpuResults.length).toBe(cpuResults.length);
      for (let i = 0; i < gpuResults.length; i++) {
        expect(gpuResults[i].id).toBe(cpuResults[i].id);
        expect(gpuResults[i].score).toBeCloseTo(cpuResults[i].score, 4);
      }

      await gpuDb.close();
      await cpuDb.close();
      db = null; // already closed
    });
  });

  describe('backward compatibility', () => {
    it('should work without enableGPU', async () => {
      db = await createVectorDB({
        name: 'compat-1',
        dimensions,
        storage: 'memory',
      });

      const v1 = createTestVector(dimensions, 1);
      await db.add({ id: 'v1', vector: v1 });

      const results = await db.search(v1, { k: 1 });
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('v1');
    });

    it('should work with all operations without GPU', async () => {
      db = await createVectorDB({
        name: 'compat-2',
        dimensions,
        storage: 'memory',
      });

      const v1 = createTestVector(dimensions, 1);
      const v2 = createTestVector(dimensions, 2);

      // Add
      await db.add({ id: 'v1', vector: v1 });
      await db.add({ id: 'v2', vector: v2, metadata: { tag: 'test' } });

      // Search
      const results = await db.search(v1, { k: 2 });
      expect(results.length).toBe(2);

      // Get
      const doc = await db.get('v1');
      expect(doc).not.toBeNull();

      // Update
      const v3 = createTestVector(dimensions, 3);
      await db.update('v1', { vector: v3 });

      // Delete
      await db.delete('v2');
      const afterDelete = await db.get('v2');
      expect(afterDelete).toBeNull();

      // Stats
      const stats = await db.stats();
      expect(stats.count).toBe(1);
    });
  });

  describe('GPU resource cleanup', () => {
    it('should close without error when GPU enabled', async () => {
      db = await createVectorDB({
        name: 'gpu-cleanup-1',
        dimensions,
        storage: 'memory',
        enableGPU: true,
      });

      await db.add({ id: 'v1', vector: createTestVector(dimensions, 1) });
      await expect(db.close()).resolves.toBeUndefined();
      db = null; // already closed
    });

    it('should clear without error when GPU enabled', async () => {
      db = await createVectorDB({
        name: 'gpu-cleanup-2',
        dimensions,
        storage: 'memory',
        enableGPU: true,
      });

      await db.add({ id: 'v1', vector: createTestVector(dimensions, 1) });
      await db.clear();

      const stats = await db.stats();
      expect(stats.count).toBe(0);
    });
  });
});
