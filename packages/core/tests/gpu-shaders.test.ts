/**
 * @fileoverview Tests for WGSL shader source strings.
 *
 * Verifies that shader source strings are well-formed and contain
 * expected WGSL keywords. Actual GPU execution tests require a browser
 * environment; these tests validate the shader code structure.
 */

import { describe, it, expect } from 'vitest';
import {
  COSINE_DISTANCE_SHADER,
  EUCLIDEAN_DISTANCE_SHADER,
  DOT_PRODUCT_DISTANCE_SHADER,
  getShaderSource,
} from '../src/hnsw/gpu/shaders.js';

describe('WGSL Shader Sources', () => {
  describe('COSINE_DISTANCE_SHADER', () => {
    it('should be a non-empty string', () => {
      expect(typeof COSINE_DISTANCE_SHADER).toBe('string');
      expect(COSINE_DISTANCE_SHADER.length).toBeGreaterThan(0);
    });

    it('should contain expected WGSL keywords', () => {
      expect(COSINE_DISTANCE_SHADER).toContain('@compute');
      expect(COSINE_DISTANCE_SHADER).toContain('@workgroup_size(256)');
      expect(COSINE_DISTANCE_SHADER).toContain('@group(0)');
      expect(COSINE_DISTANCE_SHADER).toContain('@binding(0)');
      expect(COSINE_DISTANCE_SHADER).toContain('@binding(1)');
      expect(COSINE_DISTANCE_SHADER).toContain('@binding(2)');
      expect(COSINE_DISTANCE_SHADER).toContain('@binding(3)');
    });

    it('should declare the Params struct', () => {
      expect(COSINE_DISTANCE_SHADER).toContain('struct Params');
      expect(COSINE_DISTANCE_SHADER).toContain('dimensions: u32');
      expect(COSINE_DISTANCE_SHADER).toContain('candidate_count: u32');
    });

    it('should contain cosine distance computation', () => {
      expect(COSINE_DISTANCE_SHADER).toContain('dot_product');
      expect(COSINE_DISTANCE_SHADER).toContain('norm_a');
      expect(COSINE_DISTANCE_SHADER).toContain('norm_b');
      expect(COSINE_DISTANCE_SHADER).toContain('magnitude');
      expect(COSINE_DISTANCE_SHADER).toContain('1.0 - dot_product / magnitude');
    });

    it('should handle zero magnitude vectors', () => {
      expect(COSINE_DISTANCE_SHADER).toContain('magnitude == 0.0');
      expect(COSINE_DISTANCE_SHADER).toContain('results[idx] = 1.0');
    });
  });

  describe('EUCLIDEAN_DISTANCE_SHADER', () => {
    it('should be a non-empty string', () => {
      expect(typeof EUCLIDEAN_DISTANCE_SHADER).toBe('string');
      expect(EUCLIDEAN_DISTANCE_SHADER.length).toBeGreaterThan(0);
    });

    it('should contain expected WGSL keywords', () => {
      expect(EUCLIDEAN_DISTANCE_SHADER).toContain('@compute');
      expect(EUCLIDEAN_DISTANCE_SHADER).toContain('@workgroup_size(256)');
      expect(EUCLIDEAN_DISTANCE_SHADER).toContain('@group(0)');
      expect(EUCLIDEAN_DISTANCE_SHADER).toContain('@binding(0)');
    });

    it('should contain Euclidean distance computation', () => {
      expect(EUCLIDEAN_DISTANCE_SHADER).toContain('diff');
      expect(EUCLIDEAN_DISTANCE_SHADER).toContain('sqrt(sum)');
    });
  });

  describe('DOT_PRODUCT_DISTANCE_SHADER', () => {
    it('should be a non-empty string', () => {
      expect(typeof DOT_PRODUCT_DISTANCE_SHADER).toBe('string');
      expect(DOT_PRODUCT_DISTANCE_SHADER.length).toBeGreaterThan(0);
    });

    it('should contain expected WGSL keywords', () => {
      expect(DOT_PRODUCT_DISTANCE_SHADER).toContain('@compute');
      expect(DOT_PRODUCT_DISTANCE_SHADER).toContain('@workgroup_size(256)');
    });

    it('should negate the dot product for HNSW compatibility', () => {
      expect(DOT_PRODUCT_DISTANCE_SHADER).toContain('-dot_sum');
    });
  });

  describe('getShaderSource()', () => {
    it('should return cosine shader for "cosine" metric', () => {
      const source = getShaderSource('cosine');
      expect(source).toBe(COSINE_DISTANCE_SHADER);
    });

    it('should return euclidean shader for "euclidean" metric', () => {
      const source = getShaderSource('euclidean');
      expect(source).toBe(EUCLIDEAN_DISTANCE_SHADER);
    });

    it('should return dot product shader for "dot" metric', () => {
      const source = getShaderSource('dot');
      expect(source).toBe(DOT_PRODUCT_DISTANCE_SHADER);
    });

    it('should return non-empty strings for all metrics', () => {
      const metrics = ['cosine', 'euclidean', 'dot'] as const;
      for (const metric of metrics) {
        const source = getShaderSource(metric);
        expect(source.length).toBeGreaterThan(100);
      }
    });

    it('should return cosine shader as default for unknown metric', () => {
      const source = getShaderSource('unknown' as any);
      expect(source).toBe(COSINE_DISTANCE_SHADER);
    });
  });
});
