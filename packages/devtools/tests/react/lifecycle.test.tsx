/**
 * @file lifecycle.test.tsx
 * @description Task 5.4 — subscription lifecycle against the REAL bridge:
 * - unmount fully removes registrations, observed via a counting wrapper
 *   installed around the real bridge's PUBLIC `subscribe` before rendering
 *   (observation at the public boundary, not internal state); later notifies
 *   cause no updates and no errors;
 * - late-enable: a hook mounted before `enableDevTools()` transitions from
 *   inert to live once `enableDevTools()` + `registerQueue()` run — without
 *   a remount.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { createInferenceQueue, globalEventBus } from '@localmode/core';
import { enableDevTools, disableDevTools, registerQueue } from '../../src/index.js';
import { enableDevToolsSettled, waitForBridgeSettled } from './test-utils.js';
import {
  useDevToolsEvents,
  useDevToolsQueueStats,
  useDevToolsStatus,
} from '../../src/react/index.js';

describe('subscription lifecycle', () => {
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

  it('unmount removes the bridge registration; later notifies cause no updates or errors', async () => {
    await enableDevToolsSettled();

    // Counting wrapper around the REAL bridge's public subscribe, installed
    // before any hook renders.
    const bridge = window.__LOCALMODE_DEVTOOLS__!;
    const realSubscribe = bridge.subscribe.bind(bridge);
    let activeRegistrations = 0;
    bridge.subscribe = (callback: () => void) => {
      activeRegistrations += 1;
      const unsubscribe = realSubscribe(callback);
      return () => {
        activeRegistrations -= 1;
        unsubscribe();
      };
    };

    let renderCount = 0;
    const { result, unmount } = renderHook(() => {
      renderCount += 1;
      return useDevToolsEvents();
    });

    expect(activeRegistrations).toBe(1);

    // Sanity: the hook is live before unmount
    await act(async () => {
      globalEventBus.emit('add', { id: 'doc-1', collection: 'pre' });
    });
    expect(result.current).toHaveLength(1);

    unmount();
    expect(activeRegistrations).toBe(0);

    // Later notifies must cause no updates and no errors
    const renderCountAfterUnmount = renderCount;
    await act(async () => {
      globalEventBus.emit('add', { id: 'doc-2', collection: 'post' });
    });
    expect(renderCount).toBe(renderCountAfterUnmount);
    // The last returned value is untouched (the post-unmount event is not in it)
    expect(result.current).toHaveLength(1);
  });

  it('late enable: a hook mounted first transitions from inert to live without remount', async () => {
    // Mount BEFORE any bridge exists
    let hookInstances = 0;
    const { result } = renderHook(() => {
      // Counts commits of the same hook instance; a remount would reset state,
      // which the inert→live reference transition below would surface.
      hookInstances += 1;
      return { stats: useDevToolsQueueStats(), status: useDevToolsStatus() };
    });

    const inertStats = result.current.stats;
    expect(inertStats).toEqual({});
    expect(result.current.status).toEqual({ available: false, enabled: false });

    // Re-render with no bridge: inert values are referentially stable
    const { result: result2, rerender } = renderHook(() => useDevToolsQueueStats());
    rerender();
    expect(result2.current).toBe(inertStats); // shared frozen inert constant

    // NOW enable devtools + register a real queue — after mount
    const queue = createInferenceQueue({ concurrency: 1 });
    let cleanup: () => void;
    await act(async () => {
      enableDevTools();
      cleanup = registerQueue('late-queue', queue);
      // Hooks are already mounted here, so wait out the initial async
      // collector writes (capabilities/storage) INSIDE act.
      await waitForBridgeSettled();
    });

    // The mounted hook transitioned from inert to live without remounting
    expect(result.current.status).toEqual({ available: true, enabled: true });
    expect(result.current.stats).not.toBe(inertStats);
    expect(result.current.stats['late-queue']).toBeDefined();

    // ...and live updates flow from the real queue executing real tasks
    await act(async () => {
      await queue.add(async () => 42);
    });
    await waitFor(() => {
      expect(result.current.stats['late-queue'].completed).toBe(1);
    });

    expect(hookInstances).toBeGreaterThan(1); // re-rendered, not remounted

    cleanup!();
    queue.destroy();
  });
});
