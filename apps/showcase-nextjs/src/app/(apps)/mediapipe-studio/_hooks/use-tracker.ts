/**
 * @file use-tracker.ts
 * @description Shared hook for real-time MediaPipe streaming trackers
 */
'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import type { TrackerInstance } from '@localmode/mediapipe';
import type { AppError } from '../_lib/types';
import { FpsCounter } from '../_lib/utils';

/** Lifecycle status of a streaming tracker */
export type TrackerStatus = 'idle' | 'loading' | 'running' | 'error';

/** Options accepted by every streaming tracker factory used here. */
interface TrackerFactoryOptions<R> {
  video: HTMLVideoElement;
  onResults: (results: R[], timestampMs: number) => void;
  onError?: (error: Error) => void;
}

/**
 * Generic hook that drives a MediaPipe streaming tracker over a video element.
 *
 * @param videoRef - Ref to the video element to track
 * @param createTracker - A streaming tracker factory (e.g. `mediapipe.createHandTracker`)
 * @returns Tracker state (results, fps, status, error) and start/stop controls
 */
export function useTracker<R>(
  videoRef: RefObject<HTMLVideoElement | null>,
  createTracker: (options: TrackerFactoryOptions<R>) => TrackerInstance
) {
  const [results, setResults] = useState<R[]>([]);
  const [fps, setFps] = useState(0);
  const [status, setStatus] = useState<TrackerStatus>('idle');
  const [error, setError] = useState<AppError | null>(null);

  const trackerRef = useRef<TrackerInstance | null>(null);
  const fpsRef = useRef(new FpsCounter());

  // Dispose the tracker (rAF loop + WASM task) when the component unmounts.
  useEffect(() => {
    return () => {
      void trackerRef.current?.close();
      trackerRef.current = null;
    };
  }, []);

  /** Load the model and begin real-time processing. */
  const start = async () => {
    if (!videoRef.current || trackerRef.current) return;
    setStatus('loading');
    setError(null);
    fpsRef.current.reset();
    try {
      const tracker = createTracker({
        video: videoRef.current,
        onResults: (next) => {
          setResults(next);
          setFps(fpsRef.current.tick());
        },
        onError: (err) => setError({ message: err.message, recoverable: true }),
      });
      trackerRef.current = tracker;
      await tracker.start();
      setStatus('running');
    } catch (err) {
      trackerRef.current = null;
      setStatus('error');
      setError({
        message: err instanceof Error ? err.message : 'Failed to start tracker',
        recoverable: true,
      });
    }
  };

  /** Stop processing and dispose the tracker. */
  const stop = () => {
    void trackerRef.current?.close();
    trackerRef.current = null;
    setStatus('idle');
    setResults([]);
    setFps(0);
  };

  return { results, fps, status, error, start, stop, clearError: () => setError(null) };
}
