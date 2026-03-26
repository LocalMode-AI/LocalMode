/**
 * @fileoverview Performance benchmarks for CPU distance computation.
 *
 * Provides baseline measurements for batch distance computation
 * at various candidate counts and dimensions. GPU benchmarks require
 * a browser environment and are not included here.
 */

import { bench, describe } from 'vitest';
import { cosineDistance, euclideanDistance, dotProduct } from '../src/hnsw/distance.js';

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

/** Pre-generate test data */
function generateTestData(candidateCount: number, dimensions: number) {
  const query = createTestVector(dimensions, 42);
  const candidates: Float32Array[] = [];
  for (let i = 0; i < candidateCount; i++) {
    candidates.push(createTestVector(dimensions, 100 + i));
  }
  return { query, candidates };
}

describe('CPU batch distance — 384 dimensions', () => {
  const dims = 384;

  describe('cosine distance', () => {
    const data64 = generateTestData(64, dims);
    const data256 = generateTestData(256, dims);
    const data1024 = generateTestData(1024, dims);

    bench('64 candidates', () => {
      for (const c of data64.candidates) {
        cosineDistance(data64.query, c);
      }
    });

    bench('256 candidates', () => {
      for (const c of data256.candidates) {
        cosineDistance(data256.query, c);
      }
    });

    bench('1024 candidates', () => {
      for (const c of data1024.candidates) {
        cosineDistance(data1024.query, c);
      }
    });
  });

  describe('euclidean distance', () => {
    const data64 = generateTestData(64, dims);
    const data256 = generateTestData(256, dims);
    const data1024 = generateTestData(1024, dims);

    bench('64 candidates', () => {
      for (const c of data64.candidates) {
        euclideanDistance(data64.query, c);
      }
    });

    bench('256 candidates', () => {
      for (const c of data256.candidates) {
        euclideanDistance(data256.query, c);
      }
    });

    bench('1024 candidates', () => {
      for (const c of data1024.candidates) {
        euclideanDistance(data1024.query, c);
      }
    });
  });

  describe('dot product distance', () => {
    const data64 = generateTestData(64, dims);
    const data256 = generateTestData(256, dims);
    const data1024 = generateTestData(1024, dims);

    bench('64 candidates', () => {
      for (const c of data64.candidates) {
        dotProduct(data64.query, c);
      }
    });

    bench('256 candidates', () => {
      for (const c of data256.candidates) {
        dotProduct(data256.query, c);
      }
    });

    bench('1024 candidates', () => {
      for (const c of data1024.candidates) {
        dotProduct(data1024.query, c);
      }
    });
  });
});
