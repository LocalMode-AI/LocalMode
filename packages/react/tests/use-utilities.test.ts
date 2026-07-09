/**
 * @file use-utilities.test.ts
 * @description Tests for utility hooks: useNetworkStatus, useModelStatus,
 * useCapabilities, useStorageQuota
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { DeviceCapabilities, StorageQuota } from '@localmode/core';
import { useNetworkStatus } from '../src/utilities/use-network-status.js';
import { useModelStatus } from '../src/utilities/use-model-status.js';
import { useModelLoad, type AnyLoadProgress } from '../src/utilities/use-model-load.js';
import { useCapabilities } from '../src/utilities/use-capabilities.js';
import { useStorageQuota } from '../src/utilities/use-storage-quota.js';
import { useModelRecommendations } from '../src/utilities/use-model-recommendations.js';

/** A promise with externally-controlled settle. */
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Stub navigator.storage for a test and restore the original afterwards.
 * jsdom does not implement StorageManager, so the original is typically
 * an absent property (undefined).
 */
function stubNavigatorStorage(descriptor: PropertyDescriptor) {
  const original = Object.getOwnPropertyDescriptor(navigator, 'storage');
  Object.defineProperty(navigator, 'storage', { configurable: true, ...descriptor });
  return () => {
    if (original) {
      Object.defineProperty(navigator, 'storage', original);
    } else {
      delete (navigator as { storage?: unknown }).storage;
    }
  };
}

let restoreStorage: (() => void) | null = null;
afterEach(() => {
  restoreStorage?.();
  restoreStorage = null;
});

describe('useNetworkStatus', () => {
  it('returns online status', () => {
    const { result } = renderHook(() => useNetworkStatus());

    // In test environment, navigator.onLine is typically true
    expect(typeof result.current.isOnline).toBe('boolean');
    expect(result.current.isOffline).toBe(!result.current.isOnline);
  });
});

describe('useModelStatus', () => {
  it('is NOT ready before any load has happened (regression: stub returned isReady=true on mount)', () => {
    // Provider models load lazily — constructing an instance downloads nothing.
    // The old stub optimistically reported isReady=true without observing any
    // load, which lied to consumers. No load has run for this modelId, so the
    // hook must report not-ready.
    const mockModel = { modelId: 'status-defect:never-loaded', provider: 'test' };
    const { result } = renderHook(() => useModelStatus(mockModel));

    expect(result.current.isReady).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.progress).toBe(0);
    expect(result.current.error).toBeNull();
  });

  it('reflects the real load lifecycle driven by useModelLoad on the same key', async () => {
    const key = 'status-lifecycle:model-1';
    let onProgress: ((p: AnyLoadProgress) => void) | null = null;
    const warmup = deferred();

    const { result } = renderHook(() => ({
      loader: useModelLoad({
        key,
        create: (cb) => {
          onProgress = cb;
          return { modelId: key, provider: 'fake' };
        },
        warmup: () => warmup.promise,
      }),
      status: useModelStatus({ modelId: key, provider: 'fake' }),
    }));

    expect(result.current.status.isReady).toBe(false);
    expect(result.current.status.isLoading).toBe(false);

    let loadPromise!: Promise<void>;
    act(() => {
      loadPromise = result.current.loader.load();
    });
    expect(result.current.status.isLoading).toBe(true);
    expect(result.current.status.isReady).toBe(false);

    act(() => {
      onProgress!({ status: 'download', loaded: 50, total: 100 });
    });
    expect(result.current.status.progress).toBeCloseTo(0.5);

    await act(async () => {
      warmup.resolve();
      await loadPromise;
    });
    expect(result.current.status.isReady).toBe(true);
    expect(result.current.status.isLoading).toBe(false);
    expect(result.current.status.progress).toBe(1);
    expect(result.current.status.error).toBeNull();
  });

  it('surfaces load errors from the shared registry', async () => {
    const key = 'status-lifecycle:model-error';
    const failure = new Error('download failed');

    const { result } = renderHook(() => ({
      loader: useModelLoad({
        key,
        create: () => ({ modelId: key, provider: 'fake' }),
        warmup: () => Promise.reject(failure),
      }),
      status: useModelStatus({ modelId: key, provider: 'fake' }),
    }));

    await act(async () => {
      await result.current.loader.load().catch(() => {});
    });

    expect(result.current.status.isReady).toBe(false);
    expect(result.current.status.isLoading).toBe(false);
    expect(result.current.status.error).toBe(failure);
  });
});

describe('useCapabilities', () => {
  it('detects typed DeviceCapabilities with features/hardware sub-objects', async () => {
    const { result } = renderHook(() => useCapabilities());

    await waitFor(() => expect(result.current.capabilities).not.toBeNull());

    // Compile-time check: the return is core's DeviceCapabilities.
    const caps: DeviceCapabilities | null = result.current.capabilities;
    expect(caps).not.toBeNull();
    expect(typeof caps!.browser.name).toBe('string');
    expect(typeof caps!.hardware.cores).toBe('number');
    expect(typeof caps!.features.wasm).toBe('boolean');
    expect(typeof caps!.features.webgpu).toBe('boolean');
    expect(typeof caps!.storage.quotaBytes).toBe('number');
    expect(result.current.error).toBeNull();
    expect(result.current.isDetecting).toBe(false);
  });

  it('refresh() re-runs detection', async () => {
    const { result } = renderHook(() => useCapabilities());
    await waitFor(() => expect(result.current.capabilities).not.toBeNull());

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.capabilities).not.toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isDetecting).toBe(false);
  });

  it('exposes detection failures via error', async () => {
    // A throwing navigator.storage accessor makes core's detectCapabilities
    // reject (the access happens outside its try block) — a real failure mode
    // the hook must surface instead of swallowing.
    restoreStorage = stubNavigatorStorage({
      get() {
        throw new Error('storage API exploded');
      },
    });

    const { result } = renderHook(() => useCapabilities());

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.message).toBe('storage API exploded');
    expect(result.current.capabilities).toBeNull();
    expect(result.current.isDetecting).toBe(false);
  });
});

describe('useModelRecommendations', () => {
  it('detects capabilities and returns ranked recommendations for the task', async () => {
    // jsdom has no StorageManager, which detectCapabilities reports as 0
    // available bytes — recommendModels then (correctly) excludes every model.
    // Stub a realistic quota so the registry's embedding models fit.
    restoreStorage = stubNavigatorStorage({
      value: {
        estimate: async () => ({ usage: 0, quota: 50 * 1024 * 1024 * 1024 }),
        persisted: async () => false,
      },
    });

    const { result } = renderHook(() =>
      useModelRecommendations({ task: 'embedding', limit: 3 })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(result.current.capabilities).not.toBeNull();
    // The curated registry ships embedding models, so detection in jsdom must
    // still yield ranked, task-matching entries within the limit.
    expect(result.current.recommendations.length).toBeGreaterThan(0);
    expect(result.current.recommendations.length).toBeLessThanOrEqual(3);
    for (const rec of result.current.recommendations) {
      expect(rec.entry.task).toBe('embedding');
      expect(typeof rec.score).toBe('number');
    }
  });

  it('exposes detection failures as a real Error', async () => {
    // Same real failure surface as the useCapabilities test: a throwing
    // navigator.storage accessor makes core's detectCapabilities reject.
    restoreStorage = stubNavigatorStorage({
      get() {
        throw new Error('storage API exploded');
      },
    });

    const { result } = renderHook(() => useModelRecommendations({ task: 'embedding' }));

    await waitFor(() => expect(result.current.error).not.toBeNull());
    // The hook exposes a real Error (not a { message } shape).
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('storage API exploded');
    expect(result.current.recommendations).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('refresh() recovers after a transient failure', async () => {
    restoreStorage = stubNavigatorStorage({
      get() {
        throw new Error('storage API exploded');
      },
    });

    const { result } = renderHook(() => useModelRecommendations({ task: 'embedding' }));
    await waitFor(() => expect(result.current.error).not.toBeNull());

    // The failure clears (storage now reports a healthy quota): refresh must
    // re-run detection and succeed.
    restoreStorage();
    restoreStorage = stubNavigatorStorage({
      value: {
        estimate: async () => ({ usage: 0, quota: 50 * 1024 * 1024 * 1024 }),
        persisted: async () => false,
      },
    });

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => expect(result.current.error).toBeNull());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.recommendations.length).toBeGreaterThan(0);
  });
});

describe('useStorageQuota', () => {
  it('passes through the FULL core StorageQuota including isPersisted and availableBytes', async () => {
    restoreStorage = stubNavigatorStorage({
      value: {
        estimate: async () => ({ usage: 100, quota: 1000 }),
        persisted: async () => true,
      },
    });

    const { result } = renderHook(() => useStorageQuota());

    await waitFor(() => expect(result.current.quota).not.toBeNull());

    // Compile-time check: the return is core's StorageQuota.
    const quota: StorageQuota | null = result.current.quota;
    expect(quota).toEqual({
      usedBytes: 100,
      quotaBytes: 1000,
      percentUsed: 10,
      isPersisted: true,
      availableBytes: 900,
    });
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('stays null without error when the Storage API is unavailable (jsdom default)', async () => {
    const { result } = renderHook(() => useStorageQuota());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.quota).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('exposes quota query failures via error', async () => {
    restoreStorage = stubNavigatorStorage({
      get() {
        throw new Error('quota query exploded');
      },
    });

    const { result } = renderHook(() => useStorageQuota());

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.message).toBe('quota query exploded');
    expect(result.current.quota).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });
});
