/**
 * @file events-filtering.test.tsx
 * @description Task 5.2 — `useDevToolsEvents({ types, limit })` filtering
 * against the REAL bridge: a mixed `vectordb:*`/`embedding:*` buffer built
 * from real `globalEventBus` emissions (the production integration path);
 * filters apply to the returned snapshot only, the bridge buffer is unchanged.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { globalEventBus } from '@localmode/core';
import { disableDevTools } from '../../src/index.js';
import { enableDevToolsSettled } from './test-utils.js';
import { useDevToolsEvents } from '../../src/react/index.js';

describe('useDevToolsEvents filtering', () => {
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

  /** Build a mixed buffer via real globalEventBus emissions: v1 e1 v2 e2 v3. */
  async function emitMixedBuffer() {
    await act(async () => {
      globalEventBus.emit('add', { id: 'doc-1', collection: 'a' });
      globalEventBus.emit('embedStart', { values: ['x'] });
      globalEventBus.emit('search', { collection: 'a', resultsCount: 1, k: 3, durationMs: 5 });
      globalEventBus.emit('embedComplete', { count: 1, durationMs: 8 });
      globalEventBus.emit('delete', { id: 'doc-1', collection: 'a' });
    });
  }

  it('returns the newest-N matching events for { types, limit } and leaves the bridge buffer unchanged', async () => {
    await enableDevToolsSettled();

    const { result: filtered } = renderHook(() =>
      useDevToolsEvents({ types: ['vectordb'], limit: 2 })
    );
    const { result: all } = renderHook(() => useDevToolsEvents());

    await emitMixedBuffer();

    // Full unfiltered view sees all five, in buffer order
    expect(all.current.map((e) => e.type)).toEqual([
      'vectordb:add',
      'embedding:embedStart',
      'vectordb:search',
      'embedding:embedComplete',
      'vectordb:delete',
    ]);

    // Namespace prefix + limit: newest 2 vectordb events, buffer order preserved
    expect(filtered.current.map((e) => e.type)).toEqual(['vectordb:search', 'vectordb:delete']);

    // The bridge's own buffer is untouched by filtering (public bridge on window)
    const bridge = window.__LOCALMODE_DEVTOOLS__!;
    expect(bridge.events.map((e) => e.type)).toEqual([
      'vectordb:add',
      'embedding:embedStart',
      'vectordb:search',
      'embedding:embedComplete',
      'vectordb:delete',
    ]);
  });

  it('matches exact namespaced types', async () => {
    await enableDevToolsSettled();
    const { result } = renderHook(() => useDevToolsEvents({ types: ['vectordb:search'] }));

    await emitMixedBuffer();

    expect(result.current.map((e) => e.type)).toEqual(['vectordb:search']);
  });

  it('matches multiple types/prefixes and applies limit after filtering', async () => {
    await enableDevToolsSettled();
    const { result } = renderHook(() =>
      useDevToolsEvents({ types: ['embedding', 'vectordb:add'], limit: 2 })
    );

    await emitMixedBuffer();

    // Matching set is [vectordb:add, embedding:embedStart, embedding:embedComplete];
    // newest 2 of those, still in buffer order:
    expect(result.current.map((e) => e.type)).toEqual([
      'embedding:embedStart',
      'embedding:embedComplete',
    ]);
  });

  it('limit alone keeps the newest N events', async () => {
    await enableDevToolsSettled();
    const { result } = renderHook(() => useDevToolsEvents({ limit: 3 }));

    await emitMixedBuffer();

    expect(result.current.map((e) => e.type)).toEqual([
      'vectordb:search',
      'embedding:embedComplete',
      'vectordb:delete',
    ]);
  });
});
