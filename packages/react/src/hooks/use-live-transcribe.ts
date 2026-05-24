/**
 * @file use-live-transcribe.ts
 * @description React hook wrapping createLiveTranscriber() with auto-dispose on unmount
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  LiveChunk,
  LiveTranscriber,
  LiveTranscriberOptions,
  LiveTranscriberState,
  LiveUtterance,
} from '@localmode/core';

const IS_SERVER = typeof window === 'undefined';

/**
 * Options accepted by {@link useLiveTranscribe}.
 *
 * Mirrors {@link LiveTranscriberOptions} but excludes `abortSignal` — the
 * hook owns abort lifecycle through unmount cleanup.
 */
export interface UseLiveTranscribeOptions extends Omit<LiveTranscriberOptions, 'abortSignal'> {}

/**
 * Return shape of {@link useLiveTranscribe}.
 */
export interface UseLiveTranscribeReturn {
  /** Current state of the underlying controller. */
  state: LiveTranscriberState;
  /** Chunks emitted for the current utterance (cleared at each utterance start). */
  currentChunks: LiveChunk[];
  /** The current in-progress utterance text (last partial chunk's text). */
  currentUtterance: string;
  /** The most recent completed utterance, or null. */
  lastUtterance: LiveUtterance | null;
  /** Latest error, or null. */
  error: Error | null;
  /** True when state === 'listening'. */
  isListening: boolean;
  /** Begin listening. Lazily constructs the controller on first call. */
  start: () => Promise<void>;
  /** Stop listening but keep the controller alive (re-startable). */
  stop: () => Promise<void>;
  /** Dispose the controller and release all resources. */
  dispose: () => Promise<void>;
}

/**
 * Hook for streaming microphone-driven speech-to-text.
 *
 * Lazy-constructs the underlying `LiveTranscriber` on first `start()` call
 * so the `getUserMedia` permission prompt happens during a user gesture.
 * Auto-disposes on unmount.
 *
 * @example
 * ```tsx
 * const { state, currentUtterance, lastUtterance, start, stop } = useLiveTranscribe({
 *   model: transformers.speechToText('onnx-community/moonshine-tiny-ONNX'),
 *   mode: 'push-to-talk',
 * });
 *
 * return (
 *   <>
 *     <button onMouseDown={start} onMouseUp={stop}>Hold to talk</button>
 *     {state === 'listening' && <p>{currentUtterance}</p>}
 *     {lastUtterance && <p>You said: {lastUtterance.text}</p>}
 *   </>
 * );
 * ```
 */
export function useLiveTranscribe(options: UseLiveTranscribeOptions): UseLiveTranscribeReturn {
  const [state, setState] = useState<LiveTranscriberState>('idle');
  const [currentChunks, setCurrentChunks] = useState<LiveChunk[]>([]);
  const [lastUtterance, setLastUtterance] = useState<LiveUtterance | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const controllerRef = useRef<LiveTranscriber | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const c = controllerRef.current;
      controllerRef.current = null;
      if (c) {
        // Fire-and-forget dispose on unmount.
        c.dispose().catch(() => {});
      }
    };
  }, []);

  const ensureController = useCallback(async (): Promise<LiveTranscriber | null> => {
    if (IS_SERVER) return null;
    if (controllerRef.current) return controllerRef.current;

    const { createLiveTranscriber } = await import('@localmode/core');
    const controller = await createLiveTranscriber(optionsRef.current);

    if (!mountedRef.current) {
      // Component unmounted during construction; clean up.
      controller.dispose().catch(() => {});
      return null;
    }
    controllerRef.current = controller;

    controller.onStateChange((event) => {
      if (!mountedRef.current) return;
      setState(event.to);
    });

    controller.onChunk((chunk) => {
      if (!mountedRef.current) return;
      setCurrentChunks((prev) => {
        if (chunk.isFinal) {
          // Replace partials and reset for next utterance.
          return [];
        }
        return [...prev, chunk];
      });
    });

    controller.onUtteranceEnd((utterance) => {
      if (!mountedRef.current) return;
      setLastUtterance(utterance);
      setCurrentChunks([]);
    });

    controller.onError((err) => {
      if (!mountedRef.current) return;
      setError(err);
    });

    return controller;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    const c = await ensureController();
    if (!c) return;
    await c.start();
  }, [ensureController]);

  const stop = useCallback(async () => {
    const c = controllerRef.current;
    if (!c) return;
    await c.stop();
  }, []);

  const dispose = useCallback(async () => {
    const c = controllerRef.current;
    controllerRef.current = null;
    if (!c) return;
    await c.dispose();
  }, []);

  if (IS_SERVER) {
    return {
      state: 'idle',
      currentChunks: [],
      currentUtterance: '',
      lastUtterance: null,
      error: null,
      isListening: false,
      start: async () => {},
      stop: async () => {},
      dispose: async () => {},
    };
  }

  const lastChunk = currentChunks[currentChunks.length - 1];
  const currentUtterance = lastChunk ? lastChunk.text : '';

  return {
    state,
    currentChunks,
    currentUtterance,
    lastUtterance,
    error,
    isListening: state === 'listening',
    start,
    stop,
    dispose,
  };
}
