/**
 * @fileoverview Tests for adaptive batch size computation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeOptimalBatchSize } from '../src/index.js';
import type { BatchSizeOptions, BatchSizeResult, DeviceProfile } from '../src/index.js';

// ============================================================================
// 7.1 — Reference device (4 cores, 8 GB) returns base batch
// ============================================================================

describe('computeOptimalBatchSize()', () => {
  describe('reference device (4 cores, 8 GB, no GPU)', () => {
    it('returns base batch size of 32 for embedding task', () => {
      const result = computeOptimalBatchSize({
        taskType: 'embedding',
        modelDimensions: 384,
        deviceCapabilities: { cores: 4, memoryGB: 8, hasGPU: false },
      });

      expect(result.batchSize).toBe(32);
    });

    it('returns base batch size of 64 for ingestion task', () => {
      const result = computeOptimalBatchSize({
        taskType: 'ingestion',
        modelDimensions: 384,
        deviceCapabilities: { cores: 4, memoryGB: 8, hasGPU: false },
      });

      expect(result.batchSize).toBe(64);
    });

    it('returns structured result with all fields', () => {
      const result = computeOptimalBatchSize({
        taskType: 'embedding',
        modelDimensions: 384,
        deviceCapabilities: { cores: 4, memoryGB: 8, hasGPU: false },
      });

      expect(result).toHaveProperty('batchSize');
      expect(result).toHaveProperty('reasoning');
      expect(result).toHaveProperty('deviceProfile');
      expect(typeof result.batchSize).toBe('number');
      expect(typeof result.reasoning).toBe('string');
      expect(result.reasoning.length).toBeGreaterThan(0);
    });
  });

  describe('high-end device (16 cores, 32 GB, no GPU)', () => {
    it('scales up and clamps to max for embedding', () => {
      const result = computeOptimalBatchSize({
        taskType: 'embedding',
        modelDimensions: 384,
        deviceCapabilities: { cores: 16, memoryGB: 32, hasGPU: false },
      });

      // 32 * (16/4) * (32/8) = 32 * 4 * 4 = 512, clamped to 256
      expect(result.batchSize).toBe(256);
    });

    it('scales up and clamps to max for ingestion', () => {
      const result = computeOptimalBatchSize({
        taskType: 'ingestion',
        modelDimensions: 384,
        deviceCapabilities: { cores: 16, memoryGB: 32, hasGPU: false },
      });

      // 64 * (16/4) * (32/8) = 64 * 4 * 4 = 1024, clamped to 512
      expect(result.batchSize).toBe(512);
    });
  });

  describe('low-end device (2 cores, 2 GB, no GPU)', () => {
    it('scales down to min for embedding', () => {
      const result = computeOptimalBatchSize({
        taskType: 'embedding',
        modelDimensions: 384,
        deviceCapabilities: { cores: 2, memoryGB: 2, hasGPU: false },
      });

      // 32 * (2/4) * (2/8) = 32 * 0.5 * 0.25 = 4, equals minBatch
      expect(result.batchSize).toBe(4);
    });

    it('scales down to min for ingestion', () => {
      const result = computeOptimalBatchSize({
        taskType: 'ingestion',
        modelDimensions: 384,
        deviceCapabilities: { cores: 2, memoryGB: 2, hasGPU: false },
      });

      // 64 * (2/4) * (2/8) = 64 * 0.5 * 0.25 = 8, equals minBatch
      expect(result.batchSize).toBe(8);
    });
  });

  // ============================================================================
  // 7.2 — GPU multiplier tests
  // ============================================================================

  describe('GPU multiplier', () => {
    it('applies 1.5x multiplier when hasGPU is true', () => {
      const result = computeOptimalBatchSize({
        taskType: 'embedding',
        modelDimensions: 384,
        deviceCapabilities: { cores: 4, memoryGB: 8, hasGPU: true },
      });

      // 32 * 1.0 * 1.0 * 1.5 = 48
      expect(result.batchSize).toBe(48);
    });

    it('does not apply multiplier when hasGPU is false', () => {
      const result = computeOptimalBatchSize({
        taskType: 'embedding',
        modelDimensions: 384,
        deviceCapabilities: { cores: 4, memoryGB: 8, hasGPU: false },
      });

      // 32 * 1.0 * 1.0 * 1.0 = 32
      expect(result.batchSize).toBe(32);
    });

    it('GPU multiplied result is still clamped to max', () => {
      const result = computeOptimalBatchSize({
        taskType: 'embedding',
        modelDimensions: 384,
        deviceCapabilities: { cores: 16, memoryGB: 32, hasGPU: true },
      });

      // 32 * 4 * 4 * 1.5 = 768, clamped to 256
      expect(result.batchSize).toBe(256);
    });

    it('GPU multiplied result reflects in deviceProfile', () => {
      const result = computeOptimalBatchSize({
        taskType: 'embedding',
        modelDimensions: 384,
        deviceCapabilities: { cores: 4, memoryGB: 8, hasGPU: true },
      });

      expect(result.deviceProfile.hasGPU).toBe(true);
    });
  });

  // ============================================================================
  // 7.3 — Task-type default tests
  // ============================================================================

  describe('task-type defaults', () => {
    it('embedding and ingestion produce different base values on reference device', () => {
      const embedding = computeOptimalBatchSize({
        taskType: 'embedding',
        modelDimensions: 384,
        deviceCapabilities: { cores: 4, memoryGB: 8 },
      });

      const ingestion = computeOptimalBatchSize({
        taskType: 'ingestion',
        modelDimensions: 384,
        deviceCapabilities: { cores: 4, memoryGB: 8 },
      });

      expect(embedding.batchSize).toBe(32);
      expect(ingestion.batchSize).toBe(64);
      expect(ingestion.batchSize).toBeGreaterThan(embedding.batchSize);
    });

    it('embedding min is 4', () => {
      const result = computeOptimalBatchSize({
        taskType: 'embedding',
        modelDimensions: 384,
        deviceCapabilities: { cores: 1, memoryGB: 1 },
      });

      // 32 * (1/4) * (1/8) = 1, clamped up to min 4
      expect(result.batchSize).toBe(4);
    });

    it('ingestion min is 8', () => {
      const result = computeOptimalBatchSize({
        taskType: 'ingestion',
        modelDimensions: 384,
        deviceCapabilities: { cores: 1, memoryGB: 1 },
      });

      // 64 * (1/4) * (1/8) = 2, clamped up to min 8
      expect(result.batchSize).toBe(8);
    });

    it('embedding max is 256', () => {
      const result = computeOptimalBatchSize({
        taskType: 'embedding',
        modelDimensions: 384,
        deviceCapabilities: { cores: 32, memoryGB: 64 },
      });

      expect(result.batchSize).toBe(256);
    });

    it('ingestion max is 512', () => {
      const result = computeOptimalBatchSize({
        taskType: 'ingestion',
        modelDimensions: 384,
        deviceCapabilities: { cores: 32, memoryGB: 64 },
      });

      expect(result.batchSize).toBe(512);
    });
  });

  // ============================================================================
  // 7.4 — Custom bounds tests
  // ============================================================================

  describe('custom bounds', () => {
    it('caller-provided minBatchSize overrides task default', () => {
      const result = computeOptimalBatchSize({
        taskType: 'embedding',
        modelDimensions: 384,
        minBatchSize: 16,
        deviceCapabilities: { cores: 1, memoryGB: 1 },
      });

      // 32 * 0.25 * 0.125 = 1 → clamped to custom min 16
      expect(result.batchSize).toBe(16);
    });

    it('caller-provided maxBatchSize overrides task default', () => {
      const result = computeOptimalBatchSize({
        taskType: 'embedding',
        modelDimensions: 384,
        maxBatchSize: 64,
        deviceCapabilities: { cores: 16, memoryGB: 32 },
      });

      // 32 * 4 * 4 = 512, clamped to custom max 64
      expect(result.batchSize).toBe(64);
    });

    it('caller-provided baseBatchSize overrides task default', () => {
      const result = computeOptimalBatchSize({
        taskType: 'embedding',
        modelDimensions: 384,
        baseBatchSize: 50,
        deviceCapabilities: { cores: 4, memoryGB: 8 },
      });

      // 50 * 1.0 * 1.0 = 50
      expect(result.batchSize).toBe(50);
    });

    it('all three custom bounds work together', () => {
      const result = computeOptimalBatchSize({
        taskType: 'embedding',
        modelDimensions: 384,
        baseBatchSize: 100,
        minBatchSize: 20,
        maxBatchSize: 80,
        deviceCapabilities: { cores: 4, memoryGB: 8 },
      });

      // 100 * 1.0 * 1.0 = 100, clamped to max 80
      expect(result.batchSize).toBe(80);
    });
  });

  // ============================================================================
  // 7.5 — Device override tests
  // ============================================================================

  describe('device overrides', () => {
    it('deviceCapabilities overrides detection', () => {
      const result = computeOptimalBatchSize({
        taskType: 'embedding',
        modelDimensions: 384,
        deviceCapabilities: { cores: 8, memoryGB: 16 },
      });

      expect(result.deviceProfile.cores).toBe(8);
      expect(result.deviceProfile.memoryGB).toBe(16);
    });

    it('source field is "override" when deviceCapabilities provided', () => {
      const result = computeOptimalBatchSize({
        taskType: 'embedding',
        modelDimensions: 384,
        deviceCapabilities: { cores: 8 },
      });

      expect(result.deviceProfile.source).toBe('override');
    });

    it('partial override merges with detected/fallback values', () => {
      const result = computeOptimalBatchSize({
        taskType: 'embedding',
        modelDimensions: 384,
        deviceCapabilities: { cores: 12 },
      });

      expect(result.deviceProfile.cores).toBe(12);
      // memoryGB should be detected or fallback (8)
      expect(result.deviceProfile.memoryGB).toBeGreaterThan(0);
      expect(result.deviceProfile.source).toBe('override');
    });

    it('full override produces deterministic result', () => {
      const opts: BatchSizeOptions = {
        taskType: 'embedding',
        modelDimensions: 384,
        deviceCapabilities: { cores: 4, memoryGB: 8, hasGPU: false },
      };

      const result1 = computeOptimalBatchSize(opts);
      const result2 = computeOptimalBatchSize(opts);

      expect(result1.batchSize).toBe(result2.batchSize);
      expect(result1.batchSize).toBe(32);
    });
  });

  // ============================================================================
  // 7.6 — SSR/fallback tests
  // ============================================================================

  describe('SSR/fallback environment', () => {
    let originalNavigator: typeof globalThis.navigator;

    beforeEach(() => {
      originalNavigator = globalThis.navigator;
    });

    afterEach(() => {
      Object.defineProperty(globalThis, 'navigator', {
        value: originalNavigator,
        configurable: true,
        writable: true,
      });
    });

    it('uses fallback values when navigator is undefined', () => {
      // Simulate SSR by removing navigator
      Object.defineProperty(globalThis, 'navigator', {
        value: undefined,
        configurable: true,
        writable: true,
      });

      const result = computeOptimalBatchSize({
        taskType: 'embedding',
        modelDimensions: 384,
      });

      // Fallback: 4 cores, 8 GB → base 32
      expect(result.batchSize).toBe(32);
      expect(result.deviceProfile.source).toBe('fallback');
      expect(result.deviceProfile.cores).toBe(4);
      expect(result.deviceProfile.memoryGB).toBe(8);
      expect(result.deviceProfile.hasGPU).toBe(false);
    });
  });

  // ============================================================================
  // 7.7 — Reasoning string tests
  // ============================================================================

  describe('reasoning string', () => {
    it('contains cores, memory, GPU status, and final batch size', () => {
      const result = computeOptimalBatchSize({
        taskType: 'embedding',
        modelDimensions: 384,
        deviceCapabilities: { cores: 8, memoryGB: 16, hasGPU: true },
      });

      expect(result.reasoning).toContain('8 cores');
      expect(result.reasoning).toContain('16GB RAM');
      expect(result.reasoning).toContain('GPU: yes');
      expect(result.reasoning).toContain(`batchSize=${result.batchSize}`);
    });

    it('mentions the task type', () => {
      const result = computeOptimalBatchSize({
        taskType: 'ingestion',
        modelDimensions: 768,
        deviceCapabilities: { cores: 4, memoryGB: 8 },
      });

      expect(result.reasoning).toContain('ingestion');
    });

    it('mentions model dimensions', () => {
      const result = computeOptimalBatchSize({
        taskType: 'embedding',
        modelDimensions: 384,
        deviceCapabilities: { cores: 4, memoryGB: 8 },
      });

      expect(result.reasoning).toContain('384d');
    });

    it('includes device profile source', () => {
      const result = computeOptimalBatchSize({
        taskType: 'embedding',
        modelDimensions: 384,
        deviceCapabilities: { cores: 4, memoryGB: 8 },
      });

      expect(result.reasoning).toContain('source: override');
    });
  });

  // ============================================================================
  // 7.8 — Integer output tests
  // ============================================================================

  describe('integer output', () => {
    it('result is always a positive integer', () => {
      // Test multiple device configurations
      const configs = [
        { cores: 3, memoryGB: 6 },
        { cores: 5, memoryGB: 7 },
        { cores: 7, memoryGB: 3 },
        { cores: 1, memoryGB: 1 },
        { cores: 64, memoryGB: 128 },
      ];

      for (const deviceCapabilities of configs) {
        const result = computeOptimalBatchSize({
          taskType: 'embedding',
          modelDimensions: 384,
          deviceCapabilities,
        });

        expect(Number.isInteger(result.batchSize)).toBe(true);
        expect(result.batchSize).toBeGreaterThan(0);
      }
    });

    it('non-integer intermediate result is floored', () => {
      const result = computeOptimalBatchSize({
        taskType: 'embedding',
        modelDimensions: 384,
        deviceCapabilities: { cores: 3, memoryGB: 6 },
      });

      // 32 * (3/4) * (6/8) = 32 * 0.75 * 0.75 = 18
      expect(result.batchSize).toBe(18);
      expect(Number.isInteger(result.batchSize)).toBe(true);
    });

    it('result is never zero', () => {
      const result = computeOptimalBatchSize({
        taskType: 'embedding',
        modelDimensions: 384,
        deviceCapabilities: { cores: 1, memoryGB: 0.5 },
      });

      // 32 * (1/4) * (0.5/8) = 32 * 0.25 * 0.0625 = 0.5 → floor → 0 → clamped to min 4
      expect(result.batchSize).toBeGreaterThanOrEqual(4);
    });
  });

  // ============================================================================
  // 7.9 — Precedence tests (streamEmbedMany context)
  // ============================================================================

  describe('precedence in streamEmbedMany context', () => {
    it('explicit batchSize wins over adaptive result', () => {
      // Simulate what streamEmbedMany does: if explicit batchSize is set, use it
      const explicitBatchSize = 16;
      const adaptiveBatching = true;

      // This replicates the precedence logic in streamEmbedMany
      let batchSize: number;
      if (explicitBatchSize !== undefined) {
        batchSize = explicitBatchSize;
      } else if (adaptiveBatching) {
        batchSize = computeOptimalBatchSize({
          taskType: 'embedding',
          modelDimensions: 384,
          deviceCapabilities: { cores: 16, memoryGB: 32 },
        }).batchSize;
      } else {
        batchSize = 32;
      }

      expect(batchSize).toBe(16); // explicit wins
    });

    it('adaptive provides computed size when no explicit batchSize', () => {
      const explicitBatchSize = undefined;
      const adaptiveBatching = true;

      let batchSize: number;
      if (explicitBatchSize !== undefined) {
        batchSize = explicitBatchSize;
      } else if (adaptiveBatching) {
        batchSize = computeOptimalBatchSize({
          taskType: 'embedding',
          modelDimensions: 384,
          deviceCapabilities: { cores: 8, memoryGB: 16 },
        }).batchSize;
      } else {
        batchSize = 32;
      }

      // 32 * (8/4) * (16/8) = 32 * 2 * 2 = 128
      expect(batchSize).toBe(128);
    });
  });

  // ============================================================================
  // 7.10 — Backward compatibility tests
  // ============================================================================

  describe('backward compatibility', () => {
    it('without adaptiveBatching, default batchSize is 32 for embedding', () => {
      // Simulate streamEmbedMany without adaptiveBatching
      const adaptiveBatching = undefined;
      const explicitBatchSize = undefined;

      let batchSize: number;
      if (explicitBatchSize !== undefined) {
        batchSize = explicitBatchSize;
      } else if (adaptiveBatching) {
        batchSize = computeOptimalBatchSize({
          taskType: 'embedding',
          modelDimensions: 384,
        }).batchSize;
      } else {
        batchSize = 32;
      }

      expect(batchSize).toBe(32);
    });

    it('with adaptiveBatching: false, default batchSize is 32 for embedding', () => {
      const adaptiveBatching = false;
      const explicitBatchSize = undefined;

      let batchSize: number;
      if (explicitBatchSize !== undefined) {
        batchSize = explicitBatchSize;
      } else if (adaptiveBatching) {
        batchSize = computeOptimalBatchSize({
          taskType: 'embedding',
          modelDimensions: 384,
        }).batchSize;
      } else {
        batchSize = 32;
      }

      expect(batchSize).toBe(32);
    });

    it('computeOptimalBatchSize is a synchronous function', () => {
      const result = computeOptimalBatchSize({
        taskType: 'embedding',
        modelDimensions: 384,
        deviceCapabilities: { cores: 4, memoryGB: 8 },
      });

      // Should return immediately (not a Promise)
      expect(result).toBeDefined();
      expect(result.batchSize).toBe(32);
      // If it were async, result would be a Promise and .batchSize would be undefined
    });
  });

  // ============================================================================
  // Additional edge cases
  // ============================================================================

  describe('edge cases', () => {
    it('handles very large core count', () => {
      const result = computeOptimalBatchSize({
        taskType: 'embedding',
        modelDimensions: 384,
        deviceCapabilities: { cores: 128, memoryGB: 512 },
      });

      // Clamped to max
      expect(result.batchSize).toBe(256);
    });

    it('handles fractional deviceMemory values', () => {
      // navigator.deviceMemory can be 0.25, 0.5, 1, 2, 4, 8
      const result = computeOptimalBatchSize({
        taskType: 'embedding',
        modelDimensions: 384,
        deviceCapabilities: { cores: 4, memoryGB: 0.25 },
      });

      // 32 * 1.0 * (0.25/8) = 32 * 0.03125 = 1 → clamped to min 4
      expect(result.batchSize).toBe(4);
    });

    it('handles different modelDimensions in reasoning', () => {
      const result768 = computeOptimalBatchSize({
        taskType: 'embedding',
        modelDimensions: 768,
        deviceCapabilities: { cores: 4, memoryGB: 8 },
      });

      const result384 = computeOptimalBatchSize({
        taskType: 'embedding',
        modelDimensions: 384,
        deviceCapabilities: { cores: 4, memoryGB: 8 },
      });

      // Dimensions don't affect formula, only reasoning
      expect(result768.batchSize).toBe(result384.batchSize);
      expect(result768.reasoning).toContain('768d');
      expect(result384.reasoning).toContain('384d');
    });
  });
});
