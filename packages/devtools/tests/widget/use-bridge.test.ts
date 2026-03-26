/**
 * @file use-bridge.test.ts
 * @description Tests for the useBridge hook
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBridge } from '../../src/widget/use-bridge.js';
import type { DevToolsBridge } from '../../src/types.js';

function createMockBridge(): DevToolsBridge {
  const subscribers = new Set<() => void>();
  return {
    version: 1,
    enabled: true,
    events: [],
    queues: {},
    pipelines: {},
    storage: null,
    capabilities: null,
    models: {},
    vectorDBs: {},
    subscribe(callback: () => void) {
      subscribers.add(callback);
      return () => { subscribers.delete(callback); };
    },
    // Expose for testing
    _notify() {
      for (const cb of subscribers) cb();
    },
    _subscriberCount() { return subscribers.size; },
  } as DevToolsBridge & { _notify: () => void; _subscriberCount: () => number };
}

describe('useBridge', () => {
  beforeEach(() => {
    delete (window as Record<string, unknown>).__LOCALMODE_DEVTOOLS__;
  });

  afterEach(() => {
    delete (window as Record<string, unknown>).__LOCALMODE_DEVTOOLS__;
  });

  it('returns null when no bridge is present', () => {
    const { result } = renderHook(() => useBridge());
    expect(result.current).toBeNull();
  });

  it('returns the bridge when present on window', () => {
    const mockBridge = createMockBridge();
    window.__LOCALMODE_DEVTOOLS__ = mockBridge;

    const { result } = renderHook(() => useBridge());
    expect(result.current).toBe(mockBridge);
  });

  it('re-renders when the bridge notifies subscribers', () => {
    const mockBridge = createMockBridge() as DevToolsBridge & { _notify: () => void };
    window.__LOCALMODE_DEVTOOLS__ = mockBridge;

    let renderCount = 0;
    const { result } = renderHook(() => {
      renderCount++;
      return useBridge();
    });

    expect(result.current).toBe(mockBridge);
    const initialRenderCount = renderCount;

    act(() => {
      mockBridge._notify();
    });

    expect(renderCount).toBeGreaterThan(initialRenderCount);
  });

  it('cleans up subscription on unmount', () => {
    const mockBridge = createMockBridge() as DevToolsBridge & { _subscriberCount: () => number };
    window.__LOCALMODE_DEVTOOLS__ = mockBridge;

    const { unmount } = renderHook(() => useBridge());

    expect(mockBridge._subscriberCount()).toBe(1);

    unmount();

    expect(mockBridge._subscriberCount()).toBe(0);
  });
});
