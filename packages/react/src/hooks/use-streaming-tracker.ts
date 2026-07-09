/**
 * @file use-streaming-tracker.ts
 * @description React hook owning the lifecycle of a real-time video tracker
 *   (e.g. the @localmode/mediapipe createHand/Pose/Face/GestureTracker
 *   streaming trackers) with latest-results state and fps measurement
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

const IS_SERVER = typeof window === 'undefined';

/** Sliding window used for fps measurement (milliseconds). */
const FPS_WINDOW_MS = 1000;

/**
 * The minimal tracker surface the hook drives. Matches the
 * `TrackerInstance` shape returned by the `@localmode/mediapipe` streaming
 * factories (`createHandTracker`, `createPoseTracker`, `createFaceTracker`,
 * `createGestureTracker`): the tracker owns its own video frame loop;
 * `start()` loads the model and begins processing, `stop()` pauses the
 * loop keeping the model warm, and `close()` disposes the task.
 */
export interface StreamingTrackerLike {
  /** Load the model (if needed) and begin the frame-processing loop. */
  start(): Promise<void>;
  /** Pause the frame-processing loop. The model stays loaded. */
  stop(): void;
  /** Stop processing and dispose underlying resources. */
  close?(): Promise<void>;
  /** Whether the frame-processing loop is currently running. */
  readonly isRunning?: boolean;
}

/**
 * Context handed to the `create` factory. Wire `video` and `onResults`
 * (and optionally `onError`) into the tracker's creation options — the
 * trackers deliver per-frame results through the callback supplied at
 * construction, so the hook injects its own sink here.
 */
export interface StreamingTrackerCreateContext<TResults> {
  /** The resolved video element frames are read from. */
  video: HTMLVideoElement;
  /** Per-frame results sink — pass as the tracker's `onResults`. */
  onResults: (results: TResults, timestampMs: number) => void;
  /** Per-frame error sink — pass as the tracker's `onError`. */
  onError: (error: Error) => void;
}

/** Lifecycle status of {@link useStreamingTracker}. */
export type UseStreamingTrackerStatus = 'idle' | 'starting' | 'running' | 'error';

/** Options for {@link useStreamingTracker}. */
export interface UseStreamingTrackerOptions<TResults> {
  /**
   * Factory creating the tracker. Called once, lazily, on the first
   * `start()`; the instance is reused across start/stop cycles (the model
   * stays loaded) and closed on unmount.
   */
  create: (
    context: StreamingTrackerCreateContext<TResults>
  ) => StreamingTrackerLike | Promise<StreamingTrackerLike>;

  /** The video element to track — a ref object or a getter. */
  video: RefObject<HTMLVideoElement | null> | (() => HTMLVideoElement | null);

  /** Called once per processed frame with the latest results. */
  onResults?: (results: TResults, timestampMs: number) => void;

  /** Start tracking on mount (default: false). */
  autoStart?: boolean;
}

/** Return shape of {@link useStreamingTracker}. */
export interface UseStreamingTrackerReturn<TResults> {
  /** Lifecycle status. Per-frame errors set `error` without leaving 'running'. */
  status: UseStreamingTrackerStatus;
  /** Latest per-frame results, or null before the first frame. */
  results: TResults | null;
  /** Processed frames per second over the last second (0 when stopped). */
  fps: number;
  /** Latest startup or per-frame error, or null. */
  error: Error | null;
  /** Create (if needed) and start the tracker. */
  start: () => Promise<void>;
  /** Pause tracking; the tracker (and its model) stays alive for restart. */
  stop: () => void;
}

/**
 * Hook owning the start/stop lifecycle of a real-time video tracker.
 *
 * The `@localmode/mediapipe` streaming trackers run their own
 * `requestAnimationFrame` loop internally, so this hook does NOT drive a
 * frame loop — it injects a results sink at creation time, mirrors the
 * latest results into React state, measures fps over a one-second sliding
 * window, and guarantees `close()` on unmount.
 *
 * @experimental This hook is experimental and its API may change in a
 *   future minor release.
 *
 * @param options - Tracker factory, video source, and callbacks
 * @returns Tracker status, latest results, fps, and start/stop controls
 *
 * @example
 * ```tsx
 * import { useStreamingTracker } from '@localmode/react';
 * import { createHandTracker } from '@localmode/mediapipe';
 * import type { HandLandmarkResultItem } from '@localmode/core';
 *
 * function HandOverlay() {
 *   const videoRef = useRef<HTMLVideoElement>(null);
 *   const { status, results, fps, start, stop } = useStreamingTracker<
 *     HandLandmarkResultItem[]
 *   >({
 *     video: videoRef,
 *     create: ({ video, onResults, onError }) =>
 *       createHandTracker({ video, onResults, onError }),
 *   });
 *
 *   return (
 *     <>
 *       <video ref={videoRef} autoPlay muted playsInline />
 *       <button onClick={status === 'running' ? stop : start}>
 *         {status === 'running' ? `Stop (${fps} fps)` : 'Start'}
 *       </button>
 *       {results?.map((hand, i) => <HandSkeleton key={i} hand={hand} />)}
 *     </>
 *   );
 * }
 * ```
 */
export function useStreamingTracker<TResults>(
  options: UseStreamingTrackerOptions<TResults>
): UseStreamingTrackerReturn<TResults> {
  const [status, setStatus] = useState<UseStreamingTrackerStatus>('idle');
  const [results, setResults] = useState<TResults | null>(null);
  const [fps, setFps] = useState(0);
  const [error, setError] = useState<Error | null>(null);

  const trackerRef = useRef<StreamingTrackerLike | null>(null);
  const frameTimesRef = useRef<number[]>([]);
  const startingRef = useRef(false);
  const mountedRef = useRef(true);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const tracker = trackerRef.current;
      trackerRef.current = null;
      if (tracker) {
        if (tracker.close) {
          tracker.close().catch(() => {});
        } else {
          tracker.stop();
        }
      }
    };
  }, []);

  /** Per-frame results sink injected into the tracker at creation. */
  const handleResults = useCallback((frameResults: TResults, timestampMs: number) => {
    if (!mountedRef.current) return;

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const frames = frameTimesRef.current;
    frames.push(now);
    while (frames.length > 0 && now - frames[0] > FPS_WINDOW_MS) {
      frames.shift();
    }

    setResults(frameResults);
    setFps(frames.length);
    optionsRef.current.onResults?.(frameResults, timestampMs);
  }, []);

  /** Per-frame error sink — frame errors are non-fatal for the loop. */
  const handleFrameError = useCallback((err: Error) => {
    if (!mountedRef.current) return;
    setError(err);
  }, []);

  const start = useCallback(async () => {
    if (IS_SERVER) return;
    if (startingRef.current) return;
    startingRef.current = true;

    setError(null);
    setStatus('starting');

    try {
      let tracker = trackerRef.current;
      if (!tracker) {
        const videoSource = optionsRef.current.video;
        const video =
          typeof videoSource === 'function' ? videoSource() : videoSource.current;
        if (!video) {
          throw new Error(
            'useStreamingTracker: video element is not available. Attach the ref (or return a non-null element from the getter) before calling start().'
          );
        }

        tracker = await optionsRef.current.create({
          video,
          onResults: handleResults,
          onError: handleFrameError,
        });

        if (!mountedRef.current) {
          // Unmounted during creation — dispose and bail.
          if (tracker.close) {
            tracker.close().catch(() => {});
          } else {
            tracker.stop();
          }
          return;
        }
        trackerRef.current = tracker;
      }

      await tracker.start();

      if (mountedRef.current && trackerRef.current === tracker) {
        setStatus('running');
      }
    } catch (err) {
      const wrapped = err instanceof Error ? err : new Error(String(err));
      if (mountedRef.current) {
        setError(wrapped);
        setStatus('error');
      }
    } finally {
      startingRef.current = false;
    }
  }, [handleResults, handleFrameError]);

  const stop = useCallback(() => {
    trackerRef.current?.stop();
    frameTimesRef.current = [];
    if (mountedRef.current) {
      setStatus('idle');
      setFps(0);
    }
  }, []);

  // Optional auto-start on mount.
  useEffect(() => {
    if (optionsRef.current.autoStart) {
      void start();
    }
  }, [start]);

  if (IS_SERVER) {
    return {
      status: 'idle',
      results: null,
      fps: 0,
      error: null,
      start: async () => {},
      stop: () => {},
    };
  }

  return { status, results, fps, error, start, stop };
}
