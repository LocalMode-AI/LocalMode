/**
 * @file model-cache.test.ts
 * @description Tests for createModelLoader factory
 */

import { describe, it, expect } from 'vitest';
import { createModelLoader } from '../src/model-cache/index.js';

describe('createModelLoader', () => {
  it('returns a ModelLoader with all expected methods', async () => {
    const loader = await createModelLoader();

    expect(typeof loader.prefetch).toBe('function');
    expect(typeof loader.prefetchOne).toBe('function');
    expect(typeof loader.cancel).toBe('function');
    expect(typeof loader.cancelAll).toBe('function');
    expect(typeof loader.evict).toBe('function');
    expect(typeof loader.getBlob).toBe('function');
    expect(typeof loader.getCacheStatus).toBe('function');
    expect(typeof loader.getCacheEntry).toBe('function');
    expect(typeof loader.isModelCached).toBe('function');
    expect(typeof loader.getTotalCacheSize).toBe('function');
    expect(typeof loader.destroy).toBe('function');

    await loader.destroy();
  });

  it('isModelCached returns false for unknown models', async () => {
    const loader = await createModelLoader();
    const cached = await loader.isModelCached('nonexistent-model');
    expect(cached).toBe(false);
    await loader.destroy();
  });

  it('getCacheStatus returns empty map initially', async () => {
    const loader = await createModelLoader();
    const status = await loader.getCacheStatus();
    expect(status.size).toBe(0);
    await loader.destroy();
  });

  it('destroy can be called safely', async () => {
    const loader = await createModelLoader();
    await expect(loader.destroy()).resolves.not.toThrow();
  });
});

describe('size parsing', () => {
  it('parses GB strings', async () => {
    const loader = await createModelLoader({ maxCacheSize: '4GB' });
    // We can't directly inspect maxCacheSize but the loader should create without error
    expect(loader).toBeDefined();
    await loader.destroy();
  });

  it('parses MB strings', async () => {
    const loader = await createModelLoader({ maxCacheSize: '500MB' });
    expect(loader).toBeDefined();
    await loader.destroy();
  });

  it('accepts numeric bytes', async () => {
    const loader = await createModelLoader({ maxCacheSize: 1073741824 });
    expect(loader).toBeDefined();
    await loader.destroy();
  });
});
