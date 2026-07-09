/**
 * @file inert-disabled.test.tsx
 * @description Task 5.5 (inert/disabled half) — against the REAL bridge:
 * - with no bridge, every hook returns a referentially stable inert constant
 *   across renders;
 * - after `disableDevTools()`, `useDevToolsStatus()` reports
 *   `{ available: true, enabled: false }` and slice hooks keep returning the
 *   last collected snapshots with no further updates (collectors stopped).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { globalEventBus } from '@localmode/core';
import { disableDevTools } from '../../src/index.js';
import { enableDevToolsSettled } from './test-utils.js';
import {
  useDevToolsBridge,
  useDevToolsStatus,
  useDevToolsQueueStats,
  useDevToolsEvents,
  useDevToolsModelCache,
  useDevToolsPipelineRuns,
  useDevToolsVectorDBs,
  useDevToolsStorage,
  useDevToolsCapabilities,
} from '../../src/react/index.js';

describe('inert and disabled behavior', () => {
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

  it('devtools never enabled: hooks render inert values with stable references across renders', () => {
    const { result, rerender } = renderHook(() => ({
      bridge: useDevToolsBridge(),
      status: useDevToolsStatus(),
      queues: useDevToolsQueueStats(),
      events: useDevToolsEvents(),
      models: useDevToolsModelCache(),
      pipelines: useDevToolsPipelineRuns(),
      vectorDBs: useDevToolsVectorDBs(),
      storage: useDevToolsStorage(),
      capabilities: useDevToolsCapabilities(),
    }));

    expect(result.current.bridge).toBeNull();
    expect(result.current.status).toEqual({ available: false, enabled: false });
    expect(result.current.queues).toEqual({});
    expect(result.current.events).toEqual([]);
    expect(result.current.models).toEqual({});
    expect(result.current.pipelines).toEqual({});
    expect(result.current.vectorDBs).toEqual({});
    expect(result.current.storage).toBeNull();
    expect(result.current.capabilities).toBeNull();

    const first = result.current;
    rerender();
    rerender();

    // Same references on every no-bridge render (frozen inert constants)
    expect(result.current.status).toBe(first.status);
    expect(result.current.queues).toBe(first.queues);
    expect(result.current.events).toBe(first.events);
    expect(result.current.models).toBe(first.models);
    expect(result.current.pipelines).toBe(first.pipelines);
    expect(result.current.vectorDBs).toBe(first.vectorDBs);
    expect(result.current.storage).toBeNull();
    expect(result.current.capabilities).toBeNull();
  });

  it('after disableDevTools(): status flips to { available: true, enabled: false } and last snapshots are preserved with no further updates', async () => {
    await enableDevToolsSettled();

    const { result } = renderHook(() => ({
      status: useDevToolsStatus(),
      events: useDevToolsEvents(),
      vectorDBs: useDevToolsVectorDBs(),
    }));

    // Collect real activity through the production path
    await act(async () => {
      globalEventBus.emit('add', { id: 'doc-1', collection: 'notes' });
      globalEventBus.emit('search', { collection: 'notes', resultsCount: 2, k: 4, durationMs: 7 });
    });

    expect(result.current.status).toEqual({ available: true, enabled: true });
    const eventsBeforeDisable = result.current.events.map((e) => e.type);
    const vectorDBsBeforeDisable = result.current.vectorDBs;
    expect(eventsBeforeDisable).toEqual(['vectordb:add', 'vectordb:search']);

    await act(async () => {
      disableDevTools();
    });

    // Bridge preserved on window with enabled=false (design D6)
    expect(result.current.status).toEqual({ available: true, enabled: false });
    expect(result.current.events.map((e) => e.type)).toEqual(eventsBeforeDisable);
    expect(result.current.vectorDBs).toEqual(vectorDBsBeforeDisable);

    // Collectors are stopped: further bus emissions cause NO updates
    const eventsRef = result.current.events;
    const vectorDBsRef = result.current.vectorDBs;
    await act(async () => {
      globalEventBus.emit('add', { id: 'doc-2', collection: 'notes' });
    });
    expect(result.current.events).toBe(eventsRef);
    expect(result.current.vectorDBs).toBe(vectorDBsRef);
    expect(result.current.events.map((e) => e.type)).toEqual(eventsBeforeDisable);
  });
});
