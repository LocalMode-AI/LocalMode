/**
 * @file use-live-transcribe.ts
 * @description React hook wrapping createLiveTranscriber() with auto-dispose on unmount
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  BargeInEvent,
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
export interface UseLiveTranscribeOptions extends Omit<LiveTranscriberOptions, 'abortSignal'> {
  /**
   * Fired when the user barges in over external playback. Only fires when
   * {@link LiveTranscriberOptions.bargeInWhilePlaying} is provided. Also
   * mirrored on the `lastBargeIn` state field.
   */
  onBargeIn?: (event: BargeInEvent) => void;
}

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
  /** All completed utterances accumulated this session (oldest first). */
  utterances: LiveUtterance[];
  /** The most recent barge-in event, or null. */
  lastBargeIn: BargeInEvent | null;
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
  /** Clear the accumulated `utterances` list (does not touch `lastUtterance`). */
  clearUtterances: () => void;
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
 * const { state, currentUtterance, utterances, start, stop } = useLiveTranscribe({
 *   model: transformers.speechToText('onnx-community/moonshine-tiny-ONNX'),
 *   mode: 'push-to-talk',
 * });
 *
 * return (
 *   <>
 *     <button onMouseDown={start} onMouseUp={stop}>Hold to talk</button>
 *     {state === 'listening' && <p>{currentUtterance}</p>}
 *     <ul>{utterances.map(u => <li key={u.utteranceId}>{u.text}</li>)}</ul>
 *   </>
 * );
 * ```
 */
export function useLiveTranscribe(options: UseLiveTranscribeOptions): UseLiveTranscribeReturn {
  const [state, setState] = useState<LiveTranscriberState>('idle');
  const [currentChunks, setCurrentChunks] = useState<LiveChunk[]>([]);
  const [lastUtterance, setLastUtterance] = useState<LiveUtterance | null>(null);
  const [utterances, setUtterances] = useState<LiveUtterance[]>([]);
  const [lastBargeIn, setLastBargeIn] = useState<BargeInEvent | null>(null);
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
    // Strip the hook-level onBargeIn callback — it is wired through the
    // controller's listener below, not through the core options.
    const { onBargeIn, ...coreOptions } = optionsRef.current;
    const controller = await createLiveTranscriber(coreOptions);

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
      setUtterances((prev) => [...prev, utterance]);
      setCurrentChunks([]);
    });

    controller.onBargeIn((event) => {
      if (!mountedRef.current) return;
      setLastBargeIn(event);
      // Read through the ref so callers can pass inline lambdas.
      optionsRef.current.onBargeIn?.(event);
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

  const clearUtterances = useCallback(() => {
    setUtterances([]);
  }, []);

  if (IS_SERVER) {
    return {
      state: 'idle',
      currentChunks: [],
      currentUtterance: '',
      lastUtterance: null,
      utterances: [],
      lastBargeIn: null,
      error: null,
      isListening: false,
      start: async () => {},
      stop: async () => {},
      dispose: async () => {},
      clearUtterances: () => {},
    };
  }

  const lastChunk = currentChunks[currentChunks.length - 1];
  const currentUtterance = lastChunk ? lastChunk.text : '';

  return {
    state,
    currentChunks,
    currentUtterance,
    lastUtterance,
    utterances,
    lastBargeIn,
    error,
    isListening: state === 'listening',
    start,
    stop,
    dispose,
    clearUtterances,
  };
}
