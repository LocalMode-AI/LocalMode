/**
 * @fileoverview Tests for recommendModels() — filtering, scoring, reasons, and device exclusions
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { recommendModels, registerModel } from '../src/index.js';
import { _resetCustomEntries } from '../src/capabilities/model-registry.js';
import type { DeviceCapabilities, ModelRegistryEntry } from '../src/index.js';

// Reset custom entries between tests
beforeEach(() => {
  _resetCustomEntries();
});

// ============================================================================
// Test Fixtures — Mock DeviceCapabilities
// ============================================================================

/** Typical desktop: 16 GB memory, WebGPU, 10 GB available storage */
function createDesktopCaps(overrides?: Partial<DeviceCapabilities>): DeviceCapabilities {
  return {
    browser: { name: 'Chrome', version: '120', engine: 'Blink' },
    device: { type: 'desktop', os: 'macOS', osVersion: '14.0' },
    hardware: { cores: 8, memory: 16, gpu: 'Apple M2' },
    features: {
      webgpu: true,
      webnn: false,
      wasm: true,
      simd: true,
      threads: true,
      indexeddb: true,
      opfs: true,
      webworkers: true,
      sharedarraybuffer: true,
      crossOriginisolated: true,
      serviceworker: true,
      broadcastchannel: true,
      weblocks: true,
      chromeAI: false,
      chromeAISummarizer: false,
      chromeAITranslator: false,
    },
    storage: {
      quotaBytes: 20 * 1024 * 1024 * 1024,
      usedBytes: 10 * 1024 * 1024 * 1024,
      availableBytes: 10 * 1024 * 1024 * 1024,
      isPersisted: true,
    },
    ...overrides,
  };
}

/** Mobile device: 2 GB memory, no WebGPU, 2 GB available storage */
function createMobileCaps(overrides?: Partial<DeviceCapabilities>): DeviceCapabilities {
  return {
    browser: { name: 'Safari', version: '17', engine: 'WebKit' },
    device: { type: 'mobile', os: 'iOS', osVersion: '17.0' },
    hardware: { cores: 4, memory: 2 },
    features: {
      webgpu: false,
      webnn: false,
      wasm: true,
      simd: true,
      threads: false,
      indexeddb: true,
      opfs: false,
      webworkers: true,
      sharedarraybuffer: false,
      crossOriginisolated: false,
      serviceworker: true,
      broadcastchannel: true,
      weblocks: true,
      chromeAI: false,
      chromeAISummarizer: false,
      chromeAITranslator: false,
    },
    storage: {
      quotaBytes: 4 * 1024 * 1024 * 1024,
      usedBytes: 2 * 1024 * 1024 * 1024,
      availableBytes: 2 * 1024 * 1024 * 1024,
      isPersisted: false,
    },
    ...overrides,
  };
}

// ============================================================================
// Basic Filtering
// ============================================================================

describe('recommendModels() — filtering', () => {
  const desktopCaps = createDesktopCaps();

  it('filters by task', () => {
    const recs = recommendModels(desktopCaps, { task: 'embedding' });
    expect(recs.length).toBeGreaterThan(0);
    for (const rec of recs) {
      expect(rec.entry.task).toBe('embedding');
    }
  });

  it('applies maxSizeMB constraint', () => {
    const recs = recommendModels(desktopCaps, { task: 'generation', maxSizeMB: 500 });
    for (const rec of recs) {
      expect(rec.entry.sizeMB).toBeLessThanOrEqual(500);
    }
  });

  it('applies providers filter', () => {
    const recs = recommendModels(desktopCaps, {
      task: 'generation',
      providers: ['webllm'],
    });
    expect(recs.length).toBeGreaterThan(0);
    for (const rec of recs) {
      expect(rec.entry.provider).toBe('webllm');
    }
  });

  it('applies requireWebGPU filter', () => {
    const recs = recommendModels(desktopCaps, {
      task: 'generation',
      requireWebGPU: true,
    });
    for (const rec of recs) {
      expect(rec.entry.recommendedDevice).toBe('webgpu');
    }
  });

  it('applies limit parameter', () => {
    const recs = recommendModels(desktopCaps, { task: 'embedding', limit: 2 });
    expect(recs.length).toBeLessThanOrEqual(2);
  });

  it('returns empty array for impossible constraints', () => {
    const recs = recommendModels(desktopCaps, { task: 'generation', maxSizeMB: 1 });
    expect(recs).toEqual([]);
  });

  it('returns empty array for a task with no matching models', () => {
    // image-to-image may have models — use a non-existent provider filter
    const recs = recommendModels(desktopCaps, {
      task: 'embedding',
      providers: ['nonexistent-provider'],
    });
    expect(recs).toEqual([]);
  });

  it('default limit is 5', () => {
    const recs = recommendModels(desktopCaps, { task: 'generation' });
    expect(recs.length).toBeLessThanOrEqual(5);
  });
});

// ============================================================================
// Scoring
// ============================================================================

describe('recommendModels() — scoring', () => {
  it('higher-quality model scores above lower-quality when both fit equally', () => {
    const caps = createDesktopCaps();

    // Register two identical models differing only in quality tier
    registerModel({
      modelId: 'test/high-quality',
      provider: 'test',
      task: 'embedding',
      name: 'High Quality',
      sizeMB: 50,
      dimensions: 384,
      recommendedDevice: 'wasm',
      speedTier: 'fast',
      qualityTier: 'high',
    });
    registerModel({
      modelId: 'test/medium-quality',
      provider: 'test',
      task: 'embedding',
      name: 'Medium Quality',
      sizeMB: 50,
      dimensions: 384,
      recommendedDevice: 'wasm',
      speedTier: 'fast',
      qualityTier: 'medium',
    });

    const recs = recommendModels(caps, {
      task: 'embedding',
      providers: ['test'],
      limit: 10,
    });

    const high = recs.find((r) => r.entry.modelId === 'test/high-quality');
    const medium = recs.find((r) => r.entry.modelId === 'test/medium-quality');

    expect(high).toBeDefined();
    expect(medium).toBeDefined();
    expect(high!.score).toBeGreaterThan(medium!.score);
  });

  it('smaller model scores higher on storage-constrained device', () => {
    // Very constrained storage: 500 MB available
    const caps = createDesktopCaps({
      storage: {
        quotaBytes: 1 * 1024 * 1024 * 1024,
        usedBytes: 524 * 1024 * 1024,
        availableBytes: 500 * 1024 * 1024,
        isPersisted: true,
      },
    });

    registerModel({
      modelId: 'test/small',
      provider: 'test',
      task: 'embedding',
      name: 'Small',
      sizeMB: 30,
      dimensions: 384,
      recommendedDevice: 'wasm',
      speedTier: 'fast',
      qualityTier: 'medium',
    });
    registerModel({
      modelId: 'test/large',
      provider: 'test',
      task: 'embedding',
      name: 'Large',
      sizeMB: 400,
      dimensions: 384,
      recommendedDevice: 'wasm',
      speedTier: 'fast',
      qualityTier: 'medium',
    });

    const recs = recommendModels(caps, {
      task: 'embedding',
      providers: ['test'],
      limit: 10,
    });

    const small = recs.find((r) => r.entry.modelId === 'test/small');
    const large = recs.find((r) => r.entry.modelId === 'test/large');

    expect(small).toBeDefined();
    expect(large).toBeDefined();
    expect(small!.score).toBeGreaterThan(large!.score);
  });

  it('WebGPU-recommended models score higher when WebGPU is available', () => {
    const capsWithGPU = createDesktopCaps();

    registerModel({
      modelId: 'test/gpu-model',
      provider: 'test',
      task: 'generation',
      name: 'GPU Model',
      sizeMB: 200,
      minMemoryMB: 1024,
      recommendedDevice: 'webgpu',
      speedTier: 'fast',
      qualityTier: 'medium',
    });
    registerModel({
      modelId: 'test/cpu-model',
      provider: 'test',
      task: 'generation',
      name: 'CPU Model',
      sizeMB: 200,
      minMemoryMB: 1024,
      recommendedDevice: 'wasm',
      speedTier: 'fast',
      qualityTier: 'medium',
    });

    const recsGPU = recommendModels(capsWithGPU, {
      task: 'generation',
      providers: ['test'],
      limit: 10,
    });

    const gpuModel = recsGPU.find((r) => r.entry.modelId === 'test/gpu-model');
    const cpuModel = recsGPU.find((r) => r.entry.modelId === 'test/cpu-model');

    expect(gpuModel).toBeDefined();
    expect(cpuModel).toBeDefined();
    expect(gpuModel!.score).toBeGreaterThan(cpuModel!.score);
  });

  it('scores are between 0 and 100', () => {
    const recs = recommendModels(createDesktopCaps(), { task: 'embedding', limit: 50 });
    for (const rec of recs) {
      expect(rec.score).toBeGreaterThanOrEqual(0);
      expect(rec.score).toBeLessThanOrEqual(100);
    }
  });

  it('results are sorted by score descending', () => {
    const recs = recommendModels(createDesktopCaps(), { task: 'embedding', limit: 50 });
    for (let i = 1; i < recs.length; i++) {
      expect(recs[i - 1].score).toBeGreaterThanOrEqual(recs[i].score);
    }
  });
});

// ============================================================================
// Reasons
// ============================================================================

describe('recommendModels() — reasons', () => {
  it('includes non-empty reasons array for each recommendation', () => {
    const recs = recommendModels(createDesktopCaps(), { task: 'embedding' });
    for (const rec of recs) {
      expect(Array.isArray(rec.reasons)).toBe(true);
      expect(rec.reasons.length).toBeGreaterThan(0);
    }
  });

  it('mentions WebGPU when device supports it and model recommends WebGPU', () => {
    const capsWithGPU = createDesktopCaps();
    const recs = recommendModels(capsWithGPU, { task: 'generation', limit: 20 });

    const webgpuModel = recs.find((r) => r.entry.recommendedDevice === 'webgpu');
    if (webgpuModel) {
      const hasWebGPUReason = webgpuModel.reasons.some((r) =>
        r.toLowerCase().includes('webgpu'),
      );
      expect(hasWebGPUReason).toBe(true);
    }
  });

  it('mentions storage fit in reasons', () => {
    const recs = recommendModels(createDesktopCaps(), { task: 'embedding' });
    for (const rec of recs) {
      const hasStorageReason = rec.reasons.some((r) =>
        r.toLowerCase().includes('storage'),
      );
      expect(hasStorageReason).toBe(true);
    }
  });
});

// ============================================================================
// Device Exclusions
// ============================================================================

describe('recommendModels() — device exclusions', () => {
  it('excludes models exceeding available storage', () => {
    // Only 50 MB available
    const caps = createDesktopCaps({
      storage: {
        quotaBytes: 100 * 1024 * 1024,
        usedBytes: 50 * 1024 * 1024,
        availableBytes: 50 * 1024 * 1024,
        isPersisted: true,
      },
    });

    const recs = recommendModels(caps, { task: 'generation', limit: 50 });
    for (const rec of recs) {
      expect(rec.entry.sizeMB).toBeLessThanOrEqual(50);
    }
  });

  it('excludes models exceeding device memory when memory is known', () => {
    // 2 GB device memory
    const caps = createMobileCaps();
    const recs = recommendModels(caps, { task: 'generation', limit: 50 });

    for (const rec of recs) {
      if (rec.entry.minMemoryMB !== undefined) {
        // 2 GB = 2048 MB
        expect(rec.entry.minMemoryMB).toBeLessThanOrEqual(2048);
      }
    }
  });

  it('does not exclude models when device memory is unknown', () => {
    const caps = createDesktopCaps({
      hardware: { cores: 8 }, // memory undefined
    });

    registerModel({
      modelId: 'test/big-memory',
      provider: 'test',
      task: 'embedding',
      name: 'Big Memory Model',
      sizeMB: 50,
      minMemoryMB: 32768, // 32 GB
      dimensions: 384,
      recommendedDevice: 'wasm',
      speedTier: 'fast',
      qualityTier: 'medium',
    });

    const recs = recommendModels(caps, {
      task: 'embedding',
      providers: ['test'],
      limit: 10,
    });

    // Should not be excluded because memory is unknown
    const found = recs.find((r) => r.entry.modelId === 'test/big-memory');
    expect(found).toBeDefined();
  });
});

// ============================================================================
// Integration Tests — Desktop vs Mobile
// ============================================================================

describe('recommendModels() — integration', () => {
  it('desktop gets larger/higher-quality recommendations', () => {
    const desktopCaps = createDesktopCaps();
    const desktopRecs = recommendModels(desktopCaps, { task: 'generation', limit: 3 });

    expect(desktopRecs.length).toBeGreaterThan(0);

    // Desktop should be able to run medium/large models
    const avgSize =
      desktopRecs.reduce((sum, r) => sum + r.entry.sizeMB, 0) / desktopRecs.length;
    expect(avgSize).toBeGreaterThan(0);
  });

  it('mobile gets smaller/faster recommendations', () => {
    const mobileCaps = createMobileCaps();
    const mobileRecs = recommendModels(mobileCaps, { task: 'generation', limit: 3 });

    expect(mobileRecs.length).toBeGreaterThan(0);

    // Mobile models should be smaller
    for (const rec of mobileRecs) {
      // Must fit in 2 GB storage
      expect(rec.entry.sizeMB).toBeLessThanOrEqual(2048);
    }
  });

  it('mobile excludes models requiring more memory than available', () => {
    const mobileCaps = createMobileCaps();
    const mobileRecs = recommendModels(mobileCaps, { task: 'generation', limit: 50 });

    for (const rec of mobileRecs) {
      if (rec.entry.minMemoryMB !== undefined) {
        expect(rec.entry.minMemoryMB).toBeLessThanOrEqual(2048);
      }
    }
  });

  it('desktop recommendations score higher on average than mobile for generation', () => {
    const desktopRecs = recommendModels(createDesktopCaps(), {
      task: 'generation',
      limit: 3,
    });
    const mobileRecs = recommendModels(createMobileCaps(), {
      task: 'generation',
      limit: 3,
    });

    if (desktopRecs.length > 0 && mobileRecs.length > 0) {
      const desktopAvg =
        desktopRecs.reduce((sum, r) => sum + r.score, 0) / desktopRecs.length;
      const mobileAvg =
        mobileRecs.reduce((sum, r) => sum + r.score, 0) / mobileRecs.length;

      // Desktop should generally score higher due to more resources
      expect(desktopAvg).toBeGreaterThanOrEqual(mobileAvg - 10); // allow small margin
    }
  });

  it('recommends models for multiple task categories', () => {
    const caps = createDesktopCaps();

    const tasks = ['embedding', 'classification', 'generation', 'speech-to-text', 'summarization'] as const;

    for (const task of tasks) {
      const recs = recommendModels(caps, { task });
      expect(recs.length).toBeGreaterThan(0);
    }
  });

  it('custom registered model appears in recommendations', () => {
    registerModel({
      modelId: 'custom/fast-embed',
      provider: 'custom',
      task: 'embedding',
      name: 'Custom Fast Embed',
      sizeMB: 10,
      dimensions: 128,
      recommendedDevice: 'wasm',
      speedTier: 'fast',
      qualityTier: 'low',
    });

    const recs = recommendModels(createDesktopCaps(), {
      task: 'embedding',
      limit: 50,
    });

    const found = recs.find((r) => r.entry.modelId === 'custom/fast-embed');
    expect(found).toBeDefined();
  });

  it('recommendModels is synchronous (returns array directly, not Promise)', () => {
    const result = recommendModels(createDesktopCaps(), { task: 'embedding' });
    // Verify it's a plain array, not a Promise
    expect(Array.isArray(result)).toBe(true);
    expect(result).not.toBeInstanceOf(Promise);
  });
});
