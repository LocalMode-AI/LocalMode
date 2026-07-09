/**
 * @file use-model-loader.test.ts
 * @description Tests for useModelLoader hook exports, types, and init-error surface
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// Mock ONE layer below the hook's claimed boundary: createModelLoader (a core
// dependency with its own tests) is made to fail deterministically, while the
// hook's real code path — dynamic import → init → error handling — runs
// unmodified. Real loader init cannot succeed in jsdom anyway (no IndexedDB).
vi.mock('@localmode/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@localmode/core')>();
  return {
    ...actual,
    createModelLoader: vi.fn(async () => {
      throw new Error('loader init failed: IndexedDB unavailable');
    }),
  };
});

describe('useModelLoader', () => {
  it('is exported from the package', async () => {
    const mod = await import('../src/index.js');
    expect(typeof mod.useModelLoader).toBe('function');
  });

  it('UseModelLoaderReturn type is exported', async () => {
    // TypeScript compile-time check — if this file compiles, the type exists
    const mod = await import('../src/utilities/use-model-loader.js');
    expect(typeof mod.useModelLoader).toBe('function');
  });

  it('starts with error null', async () => {
    const { useModelLoader } = await import('../src/utilities/use-model-loader.js');
    const { result } = renderHook(() => useModelLoader());

    expect(result.current.error).toBeNull();
  });

  it('exposes loader init failure via error instead of swallowing it', async () => {
    const { useModelLoader } = await import('../src/utilities/use-model-loader.js');
    const { result } = renderHook(() => useModelLoader());

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.message).toBe('loader init failed: IndexedDB unavailable');

    // The rest of the surface stays inert/safe after an init failure.
    expect(result.current.isDownloading).toBe(false);
    await expect(result.current.isModelCached('any')).resolves.toBe(false);
    await expect(result.current.getCacheEntry('any')).resolves.toBeNull();
  });
});
