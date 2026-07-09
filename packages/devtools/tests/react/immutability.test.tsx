/**
 * @file immutability.test.tsx
 * @description Task 5.3 — snapshot immutability against the REAL bridge: the
 * events collector mutates `ModelCacheInfo.lastUsed` in place on
 * `embedComplete` (and `VectorDBSnapshot` counters on vectordb events); a
 * snapshot captured by a consumer must NOT change when that happens, and the
 * next render must deliver a NEW snapshot with the updated values.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { globalEventBus } from '@localmode/core';
import { disableDevTools } from '../../src/index.js';
import { enableDevToolsSettled } from './test-utils.js';
import { useDevToolsModelCache, useDevToolsVectorDBs } from '../../src/react/index.js';

/** Sleep long enough for `new Date().toISOString()` to advance. */
const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('snapshot immutability', () => {
  beforeEach(() => {
    delete (window as Record<string, unknown>).__LOCALMODE_DEVTOOLS__;
  });

  afterEach(async () => {
    // Runs before testing-library auto-cleanup unmounts hooks; the disable
    // lifecycle signal reaches still-mounted hooks, so wrap in act().
    await act(async () => {
      disableDevTools();
    });
    delete (window as Record<string, unknown>).__LOCALMODE_DEVTOOLS__;
  });

  it('a captured model-cache snapshot is unchanged when the collector mutates lastUsed in place', async () => {
    await enableDevToolsSettled();
    const { result } = renderHook(() => useDevToolsModelCache());

    await act(async () => {
      globalEventBus.emit('modelLoad', { modelId: 'test-model', durationMs: 100 });
    });

    const captured = result.current;
    const capturedEntry = captured['test-model'];
    const capturedLastUsed = capturedEntry.lastUsed;

    // Ensure the collector's next `new Date().toISOString()` differs
    await tick(5);

    // Real collector path: `embedComplete` mutates the existing entry's
    // `lastUsed` IN PLACE on the bridge (see collectors/events.ts).
    await act(async () => {
      globalEventBus.emit('embedComplete', { count: 1, durationMs: 3 });
    });

    // The live bridge entry HAS mutated (public bridge on window)...
    const liveEntry = window.__LOCALMODE_DEVTOOLS__!.models['test-model'];
    expect(liveEntry.lastUsed).not.toBe(capturedLastUsed);

    // ...but the captured snapshot did not change:
    expect(capturedEntry.lastUsed).toBe(capturedLastUsed);
    expect(captured['test-model']).toBe(capturedEntry);

    // The next render delivered a NEW snapshot (new container + new entry)
    // carrying the updated value:
    expect(result.current).not.toBe(captured);
    expect(result.current['test-model']).not.toBe(capturedEntry);
    expect(result.current['test-model'].lastUsed).toBe(liveEntry.lastUsed);
    expect(result.current['test-model'].lastUsed).not.toBe(capturedLastUsed);
  });

  it('a captured vectordb snapshot is unchanged when counters mutate in place', async () => {
    await enableDevToolsSettled();
    const { result } = renderHook(() => useDevToolsVectorDBs());

    await act(async () => {
      globalEventBus.emit('add', { id: 'doc-1', collection: 'notes' });
    });

    const captured = result.current;
    const capturedEntry = captured['notes'];
    expect(capturedEntry.totalAdds).toBe(1);

    // Real collector path: another add mutates the SAME entry object in place.
    await act(async () => {
      globalEventBus.emit('add', { id: 'doc-2', collection: 'notes' });
    });

    // Live bridge entry mutated...
    expect(window.__LOCALMODE_DEVTOOLS__!.vectorDBs['notes'].totalAdds).toBe(2);

    // ...captured snapshot frozen in time:
    expect(capturedEntry.totalAdds).toBe(1);
    expect(captured['notes']).toBe(capturedEntry);

    // New snapshot on the next render:
    expect(result.current).not.toBe(captured);
    expect(result.current['notes'].totalAdds).toBe(2);
  });
});
