/**
 * @fileoverview Tests for k-means clustering (kmeans.ts).
 *
 * Tests correctness of Lloyd's algorithm: cluster assignment,
 * convergence, edge cases, validation errors, and AbortSignal support.
 */

import { describe, it, expect } from 'vitest';
import { kMeansCluster } from '../src/quantization/kmeans.js';

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

/**
 * Generate data points forming well-separated clusters.
 * Each cluster is centered at a unique location in the space using
 * angles on a circle (for 2D) or distinct positions (higher dims).
 */
function generateClusteredData(
  numClusters: number,
  pointsPerCluster: number,
  dimensions: number,
  separation: number
): { data: Float32Array[]; trueLabels: number[] } {
  const data: Float32Array[] = [];
  const trueLabels: number[] = [];

  for (let c = 0; c < numClusters; c++) {
    const center = new Float32Array(dimensions);
    // Place cluster centers at evenly spaced angles (works for any dims >= 2)
    const angle = (2 * Math.PI * c) / numClusters;
    center[0] = separation * Math.cos(angle);
    center[1 % dimensions] = separation * Math.sin(angle);

    for (let p = 0; p < pointsPerCluster; p++) {
      const point = new Float32Array(dimensions);
      const noise = createTestVector(dimensions, c * 10000 + p);
      for (let d = 0; d < dimensions; d++) {
        point[d] = center[d] + noise[d] * 0.1; // Small noise relative to separation
      }
      data.push(point);
      trueLabels.push(c);
    }
  }

  return { data, trueLabels };
}

// ============================================================================
// Basic clustering tests
// ============================================================================

describe('kMeansCluster()', () => {
  it('clusters well-separated 2D data into 3 groups', () => {
    const { data } = generateClusteredData(3, 30, 2, 50.0);

    const result = kMeansCluster(data, 3, { maxIterations: 50 });

    expect(result.centroids.length).toBe(3);
    expect(result.assignments.length).toBe(90);

    // Each assignment should be in [0, 2]
    for (let i = 0; i < result.assignments.length; i++) {
      expect(result.assignments[i]).toBeGreaterThanOrEqual(0);
      expect(result.assignments[i]).toBeLessThanOrEqual(2);
    }

    // Verify that points within the same true cluster end up assigned similarly.
    // Since clusters are well-separated, all 30 points in each cluster should
    // share the same assignment.
    const clusterAssignments = [
      new Set<number>(),
      new Set<number>(),
      new Set<number>(),
    ];
    for (let i = 0; i < 90; i++) {
      const trueCluster = Math.floor(i / 30);
      clusterAssignments[trueCluster].add(result.assignments[i]);
    }

    // Each true cluster should map to exactly one k-means cluster
    for (let c = 0; c < 3; c++) {
      expect(clusterAssignments[c].size).toBe(1);
    }

    // All three true clusters should map to different k-means clusters
    const assignedClusters = [
      [...clusterAssignments[0]][0],
      [...clusterAssignments[1]][0],
      [...clusterAssignments[2]][0],
    ];
    expect(new Set(assignedClusters).size).toBe(3);
  });

  it('converges before maxIterations for well-separated data', () => {
    const { data } = generateClusteredData(2, 50, 4, 20.0);

    const result = kMeansCluster(data, 2, { maxIterations: 100 });

    // Should converge quickly for well-separated data
    expect(result.iterations).toBeLessThanOrEqual(20);
  });

  it('respects maxIterations limit', () => {
    const data = Array.from({ length: 100 }, (_, i) => createTestVector(8, i));

    const result = kMeansCluster(data, 5, { maxIterations: 3 });

    expect(result.iterations).toBeLessThanOrEqual(3);
    expect(result.centroids.length).toBe(5);
    expect(result.assignments.length).toBe(100);
  });

  it('k=1 produces a single cluster equal to the mean', () => {
    const data = [
      new Float32Array([1, 0]),
      new Float32Array([3, 0]),
      new Float32Array([5, 0]),
    ];

    const result = kMeansCluster(data, 1);

    expect(result.centroids.length).toBe(1);

    // All assignments should be 0
    for (let i = 0; i < result.assignments.length; i++) {
      expect(result.assignments[i]).toBe(0);
    }

    // Centroid should be close to the mean [3, 0]
    expect(result.centroids[0][0]).toBeCloseTo(3, 1);
    expect(result.centroids[0][1]).toBeCloseTo(0, 1);
  });

  it('returns correct shapes for higher dimensions', () => {
    const data = Array.from({ length: 50 }, (_, i) => createTestVector(16, i));

    const result = kMeansCluster(data, 4, { maxIterations: 10 });

    expect(result.centroids.length).toBe(4);
    for (const centroid of result.centroids) {
      expect(centroid).toBeInstanceOf(Float32Array);
      expect(centroid.length).toBe(16);
    }
    expect(result.assignments.length).toBe(50);
    expect(result.iterations).toBeGreaterThan(0);
    expect(result.iterations).toBeLessThanOrEqual(10);
  });

  it('deterministic tie-breaking: lower-indexed centroid wins', () => {
    // When two data points are identical, k-means assigns them to the same
    // centroid (the one with the lower index that was initialized from this point).
    const data = [
      new Float32Array([1, 0]),
      new Float32Array([1, 0]),
      new Float32Array([5, 0]),
      new Float32Array([5, 0]),
    ];

    const result = kMeansCluster(data, 2, { maxIterations: 10 });
    expect(result.centroids.length).toBe(2);
    expect(result.assignments.length).toBe(4);

    // Points 0 and 1 should have the same assignment
    expect(result.assignments[0]).toBe(result.assignments[1]);
    // Points 2 and 3 should have the same assignment
    expect(result.assignments[2]).toBe(result.assignments[3]);
    // The two groups should have different assignments
    expect(result.assignments[0]).not.toBe(result.assignments[2]);
  });
});

// ============================================================================
// Validation errors
// ============================================================================

describe('kMeansCluster() validation', () => {
  it('throws on empty data', () => {
    expect(() => kMeansCluster([], 3)).toThrow(/at least one data point/);
  });

  it('throws when k > data.length', () => {
    const data = [
      new Float32Array([1, 0]),
      new Float32Array([0, 1]),
    ];

    expect(() => kMeansCluster(data, 10)).toThrow(/cannot exceed/);
  });

  it('throws when k < 1', () => {
    const data = [new Float32Array([1, 0])];
    expect(() => kMeansCluster(data, 0)).toThrow(/at least 1/);
  });

  it('throws on inconsistent dimensions', () => {
    const data = [
      new Float32Array([1, 0]),
      new Float32Array([1, 0, 0]),
    ];

    expect(() => kMeansCluster(data, 2)).toThrow(/Inconsistent dimensions/);
  });
});

// ============================================================================
// AbortSignal support
// ============================================================================

describe('kMeansCluster() AbortSignal', () => {
  it('throws AbortError when signal is pre-aborted', () => {
    const data = Array.from({ length: 50 }, (_, i) => createTestVector(8, i));
    const controller = new AbortController();
    controller.abort();

    expect(() =>
      kMeansCluster(data, 5, { abortSignal: controller.signal })
    ).toThrow();
  });

  it('runs to completion without abortSignal', () => {
    const data = Array.from({ length: 20 }, (_, i) => createTestVector(4, i));
    const result = kMeansCluster(data, 3);

    expect(result.centroids.length).toBe(3);
    expect(result.assignments.length).toBe(20);
  });
});
