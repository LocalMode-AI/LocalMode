/**
 * @file use-streaming-tracker.test.ts
 * @description Tests for the experimental useStreamingTracker hook
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useStreamingTracker } from '../src/hooks/use-streaming-tracker.js';
import type { StreamingTrackerCreateContext } from '../src/hooks/use-streaming-tracker.js';

// BOUNDARY NOTE: jsdom has no camera, no requestAnimationFrame-driven video
// pipeline, and no WASM — the real @localmode/mediapipe trackers cannot run
// here. The fake below implements the exact TrackerInstance contract
// (start/stop/close/isRunning + results delivered through the onResults
// callback supplied at creation, per packages/mediapipe/src/streaming/).
// What IS exercised for real: the hook's lifecycle ownership, results/fps
// state plumbing, error handling, and unmount cleanup. Real frame
// processing must be verified in a browser with a webcam (test-lab/vision).

type Results = string[];
type Ctx = StreamingTrackerCreateContext<Results>;

function makeHarness(opts: { failStart?: boolean; manualStart?: boolean } = {}) {
  let ctx: Ctx | null = null;
  let releaseStart: (() => void) | null = null;

  const tracker = {
    startCalls: 0,
    stopCalls: 0,
    closeCalls: 0,
    running: false,
    async start() {
      this.startCalls++;
      if (opts.failStart) {
        throw new Error('model download failed');
      }
      if (opts.manualStart) {
        await new Promise<void>((r) => {
          releaseStart = r;
        });
      }
      this.running = true;
    },
    stop() {
      this.stopCalls++;
      this.running = false;
    },
    async close() {
      this.closeCalls++;
      this.running = false;
    },
    get isRunning() {
      return this.running;
    },
  };

  const create = vi.fn(async (c: Ctx) => {
    ctx = c;
    return tracker;
  });

  return {
    tracker,
    create,
    getCtx: () => {
      if (!ctx) throw new Error('tracker not created yet');
      return ctx;
    },
    releaseStart: () => releaseStart?.(),
  };
}

function makeVideoRef() {
  const video = document.createElement('video');
  return { ref: { current: video as HTMLVideoElement | null }, video };
}

describe('useStreamingTracker', () => {
  it('starts idle and does NOT create the tracker on mount', () => {
    const { create } = makeHarness();
    const { ref } = makeVideoRef();

    const { result } = renderHook(() =>
      useStreamingTracker<Results>({ create, video: ref })
    );

    expect(result.current.status).toBe('idle');
    expect(result.current.results).toBeNull();
    expect(result.current.fps).toBe(0);
    expect(result.current.error).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('start() creates the tracker with the resolved video + sinks, then runs', async () => {
    const { tracker, create, getCtx } = makeHarness();
    const { ref, video } = makeVideoRef();

    const { result } = renderHook(() =>
      useStreamingTracker<Results>({ create, video: ref })
    );

    await act(async () => {
      await result.current.start();
    });

    expect(create).toHaveBeenCalledTimes(1);
    const ctx = getCtx();
    expect(ctx.video).toBe(video);
    expect(typeof ctx.onResults).toBe('function');
    expect(typeof ctx.onError).toBe('function');
    expect(tracker.startCalls).toBe(1);
    expect(result.current.status).toBe('running');
  });

  it('reports status "starting" while tracker.start() is pending', async () => {
    const harness = makeHarness({ manualStart: true });
    const { ref } = makeVideoRef();

    const { result } = renderHook(() =>
      useStreamingTracker<Results>({ create: harness.create, video: ref })
    );

    let startPromise: Promise<void> | undefined;
    await act(async () => {
      startPromise = result.current.start();
      // Yield so create() resolves and start() is awaited.
      await Promise.resolve();
    });

    expect(result.current.status).toBe('starting');

    await act(async () => {
      harness.releaseStart();
      await startPromise;
    });

    expect(result.current.status).toBe('running');
  });

  it('supports a getter video source', async () => {
    const { create, getCtx } = makeHarness();
    const { video } = makeVideoRef();

    const { result } = renderHook(() =>
      useStreamingTracker<Results>({ create, video: () => video })
    );

    await act(async () => {
      await result.current.start();
    });

    expect(getCtx().video).toBe(video);
    expect(result.current.status).toBe('running');
  });

  it('mirrors per-frame results into state and forwards to onResults', async () => {
    const harness = makeHarness();
    const { ref } = makeVideoRef();
    const onResults = vi.fn();

    const { result } = renderHook(() =>
      useStreamingTracker<Results>({ create: harness.create, video: ref, onResults })
    );

    await act(async () => {
      await result.current.start();
    });

    await act(async () => {
      harness.getCtx().onResults(['left-hand'], 123.4);
    });

    expect(result.current.results).toEqual(['left-hand']);
    expect(onResults).toHaveBeenCalledWith(['left-hand'], 123.4);
    expect(result.current.fps).toBeGreaterThanOrEqual(1);

    await act(async () => {
      harness.getCtx().onResults(['left-hand', 'right-hand'], 156.7);
    });
    // Latest results only.
    expect(result.current.results).toEqual(['left-hand', 'right-hand']);
  });

  it('measures fps as frames observed within the last second', async () => {
    const harness = makeHarness();
    const { ref } = makeVideoRef();

    const { result } = renderHook(() =>
      useStreamingTracker<Results>({ create: harness.create, video: ref })
    );

    await act(async () => {
      await result.current.start();
    });

    await act(async () => {
      for (let i = 0; i < 5; i++) {
        harness.getCtx().onResults([`frame-${i}`], i * 16.6);
      }
    });

    // All five frames land well inside the 1s window.
    expect(result.current.fps).toBe(5);
  });

  it('per-frame errors set error without leaving the running state', async () => {
    const harness = makeHarness();
    const { ref } = makeVideoRef();

    const { result } = renderHook(() =>
      useStreamingTracker<Results>({ create: harness.create, video: ref })
    );

    await act(async () => {
      await result.current.start();
    });

    await act(async () => {
      harness.getCtx().onError(new Error('frame processing failed'));
    });

    expect(result.current.error?.message).toBe('frame processing failed');
    // The trackers' internal loop survives per-frame errors — so does the hook.
    expect(result.current.status).toBe('running');
  });

  it('stop() pauses the tracker, resets fps, and keeps the instance for restart', async () => {
    const harness = makeHarness();
    const { ref } = makeVideoRef();

    const { result } = renderHook(() =>
      useStreamingTracker<Results>({ create: harness.create, video: ref })
    );

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      harness.getCtx().onResults(['hand'], 1);
    });
    expect(result.current.fps).toBeGreaterThan(0);

    act(() => {
      result.current.stop();
    });

    expect(harness.tracker.stopCalls).toBe(1);
    expect(result.current.status).toBe('idle');
    expect(result.current.fps).toBe(0);

    // Restart reuses the same tracker instance (model stays loaded).
    await act(async () => {
      await result.current.start();
    });
    expect(harness.create).toHaveBeenCalledTimes(1);
    expect(harness.tracker.startCalls).toBe(2);
    expect(result.current.status).toBe('running');
  });

  it('start() failure sets status "error" with the thrown error', async () => {
    const harness = makeHarness({ failStart: true });
    const { ref } = makeVideoRef();

    const { result } = renderHook(() =>
      useStreamingTracker<Results>({ create: harness.create, video: ref })
    );

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error?.message).toBe('model download failed');
  });

  it('missing video element sets status "error" with an actionable message', async () => {
    const { create } = makeHarness();

    const { result } = renderHook(() =>
      useStreamingTracker<Results>({
        create,
        video: { current: null },
      })
    );

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error?.message).toContain('video element is not available');
    expect(create).not.toHaveBeenCalled();
  });

  it('closes the tracker on unmount', async () => {
    const harness = makeHarness();
    const { ref } = makeVideoRef();

    const { result, unmount } = renderHook(() =>
      useStreamingTracker<Results>({ create: harness.create, video: ref })
    );

    await act(async () => {
      await result.current.start();
    });
    expect(harness.tracker.running).toBe(true);

    unmount();
    await new Promise((r) => setTimeout(r, 0));

    expect(harness.tracker.closeCalls).toBe(1);
    expect(harness.tracker.running).toBe(false);
  });

  it('falls back to stop() on unmount when the tracker has no close()', async () => {
    let stopped = 0;
    const tracker = {
      async start() {},
      stop() {
        stopped++;
      },
    };
    const create = vi.fn(async (_ctx: Ctx) => tracker);
    const { ref } = makeVideoRef();

    const { result, unmount } = renderHook(() =>
      useStreamingTracker<Results>({ create, video: ref })
    );

    await act(async () => {
      await result.current.start();
    });

    unmount();
    expect(stopped).toBe(1);
  });

  it('autoStart: true starts the tracker on mount', async () => {
    const harness = makeHarness();
    const { ref } = makeVideoRef();

    const { result } = renderHook(() =>
      useStreamingTracker<Results>({ create: harness.create, video: ref, autoStart: true })
    );

    await waitFor(() => {
      expect(result.current.status).toBe('running');
    });
    expect(harness.create).toHaveBeenCalledTimes(1);
    expect(harness.tracker.startCalls).toBe(1);
  });

  it('concurrent start() calls do not create or start twice', async () => {
    const harness = makeHarness({ manualStart: true });
    const { ref } = makeVideoRef();

    const { result } = renderHook(() =>
      useStreamingTracker<Results>({ create: harness.create, video: ref })
    );

    let p1: Promise<void> | undefined;
    let p2: Promise<void> | undefined;
    await act(async () => {
      p1 = result.current.start();
      p2 = result.current.start();
      await Promise.resolve();
    });

    await act(async () => {
      harness.releaseStart();
      await Promise.all([p1, p2]);
    });

    expect(harness.create).toHaveBeenCalledTimes(1);
    expect(harness.tracker.startCalls).toBe(1);
    expect(result.current.status).toBe('running');
  });
});
