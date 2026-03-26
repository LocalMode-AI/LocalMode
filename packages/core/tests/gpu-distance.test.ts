/**
 * @fileoverview Tests for GPU distance computation with CPU fallback.
 *
 * Since WebGPU is not available in Node.js test environments,
 * these tests verify the CPU fallback path of createGPUDistanceComputer().
 * The fallback uses the same distance functions as the CPU HNSW index,
 * ensuring identical results.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createGPUDistanceComputer } from '../src/hnsw/gpu/distance-gpu.js';
import {
  cosineDistance,
  euclideanDistance,
  dotProduct,
  getDistanceFunction,
} from '../src/hnsw/distance.js';
import type { GPUDistanceComputer } from '../src/hnsw/gpu/types.js';

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

/** Generate an array of random candidate vectors */
function createCandidateVectors(count: number, dimensions: number, baseSeed: number): Float32Array[] {
  const candidates: Float32Array[] = [];
  for (let i = 0; i < count; i++) {
    candidates.push(createTestVector(dimensions, baseSeed + i));
  }
  return candidates;
}

// ============================================================================
// Tests
// ============================================================================

describe('createGPUDistanceComputer()', () => {
  let computer: GPUDistanceComputer;

  afterEach(() => {
    computer?.destroy();
  });

  describe('CPU fallback (no WebGPU in test env)', () => {
    it('should create a computer successfully', async () => {
      computer = await createGPUDistanceComputer();
      expect(computer).toBeDefined();
      expect(typeof computer.computeDistances).toBe('function');
      expect(typeof computer.destroy).toBe('function');
    });

    it('should invoke onFallback when WebGPU is unavailable', async () => {
      const onFallback = vi.fn();
      computer = await createGPUDistanceComputer({ onFallback });
      expect(onFallback).toHaveBeenCalledWith('WebGPU not available');
    });

    it('should compute cosine distances correctly via CPU fallback', async () => {
      computer = await createGPUDistanceComputer();

      const query = new Float32Array([1, 0, 0, 0]);
      const candidates = [
        new Float32Array([1, 0, 0, 0]), // identical
        new Float32Array([0, 1, 0, 0]), // orthogonal
        new Float32Array([0.9, 0.1, 0, 0]), // similar
      ];

      const results = await computer.computeDistances(query, candidates, 'cosine');

      expect(results).toBeInstanceOf(Float32Array);
      expect(results.length).toBe(3);
      expect(results[0]).toBeCloseTo(0, 5); // identical = 0 distance
      expect(results[1]).toBeCloseTo(1, 5); // orthogonal = 1 distance
      expect(results[2]).toBeCloseTo(cosineDistance(query, candidates[2]), 5);
    });

    it('should compute euclidean distances correctly via CPU fallback', async () => {
      computer = await createGPUDistanceComputer();

      const query = new Float32Array([0, 0]);
      const candidates = [
        new Float32Array([3, 4]), // distance = 5
        new Float32Array([0, 0]), // distance = 0
        new Float32Array([1, 0]), // distance = 1
      ];

      const results = await computer.computeDistances(query, candidates, 'euclidean');

      expect(results[0]).toBeCloseTo(5, 5);
      expect(results[1]).toBeCloseTo(0, 5);
      expect(results[2]).toBeCloseTo(1, 5);
    });

    it('should compute dot product distances correctly via CPU fallback', async () => {
      computer = await createGPUDistanceComputer();

      const query = new Float32Array([1, 2, 3]);
      const candidates = [
        new Float32Array([4, 5, 6]), // dot = 32, negated = -32
        new Float32Array([0, 0, 0]), // dot = 0, negated = 0
      ];

      const results = await computer.computeDistances(query, candidates, 'dot');

      const dotFn = getDistanceFunction('dot');
      expect(results[0]).toBeCloseTo(dotFn(query, candidates[0]), 5);
      expect(results[1]).toBeCloseTo(0, 5);
    });

    it('should handle empty candidates', async () => {
      computer = await createGPUDistanceComputer();

      const query = new Float32Array([1, 0, 0]);
      const results = await computer.computeDistances(query, [], 'cosine');

      expect(results).toBeInstanceOf(Float32Array);
      expect(results.length).toBe(0);
    });

    it('should handle zero-magnitude vectors for cosine', async () => {
      computer = await createGPUDistanceComputer();

      const query = new Float32Array([0, 0, 0]);
      const candidates = [new Float32Array([1, 2, 3])];

      const results = await computer.computeDistances(query, candidates, 'cosine');

      // CPU cosineDistance returns 1 for zero vectors (1 - 0 = 1)
      expect(results[0]).toBeCloseTo(1, 5);
    });
  });

  describe('batch threshold', () => {
    it('should invoke onFallback for below-threshold calls', async () => {
      const onFallback = vi.fn();
      computer = await createGPUDistanceComputer({ batchThreshold: 64, onFallback });

      const query = createTestVector(4, 42);
      const candidates = createCandidateVectors(30, 4, 100);

      await computer.computeDistances(query, candidates, 'cosine');

      // Should have been called for initial WebGPU unavailable + below threshold
      const calls = onFallback.mock.calls.map(c => c[0] as string);
      expect(calls.some(c => c.includes('below threshold'))).toBe(true);
    });

    it('should use custom batch threshold', async () => {
      const onFallback = vi.fn();
      computer = await createGPUDistanceComputer({ batchThreshold: 10, onFallback });

      const query = createTestVector(4, 42);
      const belowThreshold = createCandidateVectors(5, 4, 100);
      const aboveThreshold = createCandidateVectors(15, 4, 200);

      await computer.computeDistances(query, belowThreshold, 'cosine');
      const belowCalls = onFallback.mock.calls.filter(
        c => (c[0] as string).includes('below threshold')
      );
      expect(belowCalls.length).toBe(1);

      // Above threshold — in test env, falls back to WebGPU unavailable
      await computer.computeDistances(query, aboveThreshold, 'cosine');
      const aboveCalls = onFallback.mock.calls.filter(
        c => (c[0] as string).includes('WebGPU not available')
      );
      expect(aboveCalls.length).toBeGreaterThan(0);
    });

    it('should respect default threshold of 64', async () => {
      const onFallback = vi.fn();
      computer = await createGPUDistanceComputer({ onFallback });

      const query = createTestVector(4, 42);
      const candidates63 = createCandidateVectors(63, 4, 100);
      const candidates65 = createCandidateVectors(65, 4, 200);

      // Clear initial onFallback calls
      onFallback.mockClear();

      await computer.computeDistances(query, candidates63, 'cosine');
      const belowCalls = onFallback.mock.calls.filter(
        c => (c[0] as string).includes('below threshold')
      );
      expect(belowCalls.length).toBe(1);

      onFallback.mockClear();

      // 65 is above threshold — but GPU not available, so falls back for that reason
      await computer.computeDistances(query, candidates65, 'cosine');
      const gpuCalls = onFallback.mock.calls.filter(
        c => (c[0] as string).includes('WebGPU not available')
      );
      expect(gpuCalls.length).toBe(1);
    });
  });

  describe('destroy lifecycle', () => {
    it('should destroy without error', async () => {
      computer = await createGPUDistanceComputer();
      expect(() => computer.destroy()).not.toThrow();
    });

    it('should throw on computeDistances after destroy', async () => {
      computer = await createGPUDistanceComputer();
      computer.destroy();

      await expect(
        computer.computeDistances(
          new Float32Array([1, 0, 0]),
          [new Float32Array([0, 1, 0])],
          'cosine',
        ),
      ).rejects.toThrow(/destroyed/i);
    });

    it('should be safe to call destroy multiple times', async () => {
      computer = await createGPUDistanceComputer();
      computer.destroy();
      expect(() => computer.destroy()).not.toThrow();
    });
  });

  describe('CPU-vs-GPU accuracy (CPU fallback validation)', () => {
    it('should match CPU cosine distance for 1000 random vector pairs', async () => {
      computer = await createGPUDistanceComputer({ batchThreshold: 1 });
      const dimensions = 384;
      const query = createTestVector(dimensions, 42);
      const candidates = createCandidateVectors(1000, dimensions, 1000);

      const gpuResults = await computer.computeDistances(query, candidates, 'cosine');

      for (let i = 0; i < candidates.length; i++) {
        const cpuResult = cosineDistance(query, candidates[i]);
        expect(Math.abs(gpuResults[i] - cpuResult)).toBeLessThan(1e-5);
      }
    });

    it('should match CPU euclidean distance for 1000 random vector pairs', async () => {
      computer = await createGPUDistanceComputer({ batchThreshold: 1 });
      const dimensions = 384;
      const query = createTestVector(dimensions, 99);
      const candidates = createCandidateVectors(1000, dimensions, 2000);

      const gpuResults = await computer.computeDistances(query, candidates, 'euclidean');

      for (let i = 0; i < candidates.length; i++) {
        const cpuResult = euclideanDistance(query, candidates[i]);
        expect(Math.abs(gpuResults[i] - cpuResult)).toBeLessThan(1e-5);
      }
    });

    it('should match CPU dot product distance for 1000 random vector pairs', async () => {
      computer = await createGPUDistanceComputer({ batchThreshold: 1 });
      const dimensions = 384;
      const query = createTestVector(dimensions, 77);
      const candidates = createCandidateVectors(1000, dimensions, 3000);

      const gpuResults = await computer.computeDistances(query, candidates, 'dot');

      const dotFn = getDistanceFunction('dot');
      for (let i = 0; i < candidates.length; i++) {
        const cpuResult = dotFn(query, candidates[i]);
        expect(Math.abs(gpuResults[i] - cpuResult)).toBeLessThan(1e-5);
      }
    });
  });
});
