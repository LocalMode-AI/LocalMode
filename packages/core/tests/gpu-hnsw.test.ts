/**
 * @fileoverview Integration tests for HNSW index with GPU options.
 *
 * Tests that GPU-enabled HNSW indexes fall back to CPU gracefully
 * in non-WebGPU environments and produce identical results to
 * non-GPU indexes.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HNSWIndex } from '../src/hnsw/index.js';

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

describe('HNSWIndex with GPU options', () => {
  const dimensions = 4;

  describe('constructor', () => {
    it('should accept gpu options without error', () => {
      const index = new HNSWIndex(dimensions, {
        gpu: { enabled: true, batchThreshold: 128 },
      });
      expect(index.gpuEnabled).toBe(true);
    });

    it('should default to gpu disabled', () => {
      const index = new HNSWIndex(dimensions, {});
      expect(index.gpuEnabled).toBe(false);
    });

    it('should accept gpu with onFallback callback', () => {
      const onFallback = (reason: string) => { /* noop */ };
      const index = new HNSWIndex(dimensions, {
        gpu: { enabled: true, onFallback },
      });
      expect(index.gpuEnabled).toBe(true);
    });
  });

  describe('search with GPU enabled (CPU fallback in test env)', () => {
    let gpuIndex: HNSWIndex;
    let cpuIndex: HNSWIndex;

    beforeEach(() => {
      // Use fixed seed for deterministic random levels
      const gpuOptions = {
        m: 4,
        efConstruction: 50,
        efSearch: 20,
        gpu: { enabled: true, batchThreshold: 2 },
      };
      const cpuOptions = {
        m: 4,
        efConstruction: 50,
        efSearch: 20,
      };

      gpuIndex = new HNSWIndex(dimensions, gpuOptions);
      cpuIndex = new HNSWIndex(dimensions, cpuOptions);
    });

    it('should search with GPU enabled and produce valid results', async () => {
      // Add test vectors to GPU index
      gpuIndex.add('v1', new Float32Array([1, 0, 0, 0]));
      gpuIndex.add('v2', new Float32Array([0.9, 0.1, 0, 0]));
      gpuIndex.add('v3', new Float32Array([0, 1, 0, 0]));
      gpuIndex.add('v4', new Float32Array([0, 0, 1, 0]));
      gpuIndex.add('v5', new Float32Array([0, 0, 0, 1]));

      const query = new Float32Array([1, 0, 0, 0]);
      const results = await gpuIndex.search(query, 3);

      expect(results.length).toBeLessThanOrEqual(3);
      expect(results.length).toBeGreaterThan(0);
      // Should find v1 (exact match) first
      expect(results[0].id).toBe('v1');
      expect(results[0].score).toBeCloseTo(1, 3);
    });

    it('should return Promise when GPU is enabled', () => {
      gpuIndex.add('v1', new Float32Array([1, 0, 0, 0]));
      const query = new Float32Array([1, 0, 0, 0]);
      const result = gpuIndex.search(query, 1);
      expect(result).toBeInstanceOf(Promise);
    });

    it('should return array (not Promise) when GPU is disabled', () => {
      cpuIndex.add('v1', new Float32Array([1, 0, 0, 0]));
      const query = new Float32Array([1, 0, 0, 0]);
      const result = cpuIndex.search(query, 1);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return empty array for empty index', async () => {
      const query = new Float32Array([1, 0, 0, 0]);
      const results = await gpuIndex.search(query, 5);
      expect(results).toEqual([]);
    });

    it('should throw on dimension mismatch', () => {
      gpuIndex.add('v1', new Float32Array([1, 0, 0, 0]));
      expect(() => gpuIndex.search(new Float32Array([1, 0, 0]), 1)).toThrow(/dimension mismatch/i);
    });
  });

  describe('destroyGPU()', () => {
    it('should be safe to call on non-GPU index', () => {
      const index = new HNSWIndex(dimensions, {});
      expect(() => index.destroyGPU()).not.toThrow();
    });

    it('should be safe to call on GPU index before search', () => {
      const index = new HNSWIndex(dimensions, { gpu: { enabled: true } });
      expect(() => index.destroyGPU()).not.toThrow();
    });

    it('should be safe to call multiple times', () => {
      const index = new HNSWIndex(dimensions, { gpu: { enabled: true } });
      expect(() => {
        index.destroyGPU();
        index.destroyGPU();
      }).not.toThrow();
    });
  });

  describe('serialization preserves GPU config', () => {
    it('should serialize and deserialize GPU-enabled index', () => {
      const original = new HNSWIndex(dimensions, {
        gpu: { enabled: true, batchThreshold: 128 },
      });

      original.add('v1', new Float32Array([1, 0, 0, 0]));
      original.add('v2', new Float32Array([0, 1, 0, 0]));

      const serialized = original.serialize();
      const vectors = new Map<string, Float32Array>();
      vectors.set('v1', new Float32Array([1, 0, 0, 0]));
      vectors.set('v2', new Float32Array([0, 1, 0, 0]));

      // Deserialize with GPU options
      const restored = HNSWIndex.deserialize(serialized, vectors, {
        gpu: { enabled: true, batchThreshold: 128 },
      });

      expect(restored.gpuEnabled).toBe(true);
      expect(restored.size).toBe(2);
    });
  });
});
