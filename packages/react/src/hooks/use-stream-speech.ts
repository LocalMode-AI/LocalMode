/**
 * @file use-stream-speech.ts
 * @description Hook that wires `streamSynthesizeSpeech()` and
 *   `playStreamedSpeech()` from `@localmode/core` into a single
 *   speak/pause/resume/stop primitive with React state.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type {
  TextToSpeechModel,
  SynthesizedClause,
  PlayStreamedSpeechHandle,
  ClauseSplitOptions,
} from '@localmode/core';

/** Options for {@link useStreamSpeech}. */
export interface UseStreamSpeechOptions {
  /** The text-to-speech model to use. */
  model: TextToSpeechModel;

  /** Voice ID forwarded to every clause. */
  voice?: string;

  /** Speech rate forwarded to every clause. */
  speed?: number;

  /** Pitch forwarded to every clause. */
  pitch?: number;

  /** Tuning options forwarded to the built-in clause splitter. */
  splitOptions?: ClauseSplitOptions;

  /**
   * Caller-provided `AudioContext`. Browsers (Safari, mobile) require
   * the context be created or resumed inside a user-gesture handler;
   * passing the context explicitly puts that responsibility where it
   * belongs. If omitted, the hook lazily creates an `AudioContext` on
   * the first `speak()` call. The hook NEVER closes a caller-supplied
   * context; if it created one, it closes it on unmount.
   */
  audioContext?: AudioContext;

  /** Fired when synthesis or playback throws. */
  onError?: (error: Error) => void;
}

/** Return value from {@link useStreamSpeech}. */
export interface UseStreamSpeechReturn {
  /** Start synthesizing and playing `text`. Resolves when playback ends. */
  speak: (text: string) => Promise<void>;

  /** Suspend the underlying `AudioContext`. */
  pause: () => void;

  /** Resume the underlying `AudioContext`. */
  resume: () => void;

  /** Stop playback and halt upstream synthesis. */
  stop: () => void;

  /** True while a `speak()` operation is producing audio. */
  isSynthesizing: boolean;

  /** True while the audio context is actively playing scheduled clauses. */
  isPlaying: boolean;

  /** The clause currently being played, or `null`. */
  currentClause: SynthesizedClause | null;

  /** All clauses observed so far during the active `speak()` call. */
  clauses: SynthesizedClause[];

  /** The last error thrown by `speak()`, or `null`. */
  error: Error | null;
}

const IS_SERVER = typeof window === 'undefined';

/**
 * React hook for streaming text-to-speech.
 *
 * The hook composes `streamSynthesizeSpeech()` (clause-by-clause synthesis)
 * with `playStreamedSpeech()` (gap-free Web Audio playback). State updates
 * track both the synthesis phase (`isSynthesizing`) and the playback phase
 * (`isPlaying`), and expose the currently-playing clause plus the full
 * list of clauses observed so far.
 *
 * On unmount the hook calls `stop()` and aborts the active synthesis
 * controller so no further `setState` runs after teardown.
 *
 * @example
 * ```tsx
 * const { speak, pause, resume, stop, isPlaying, currentClause } =
 *   useStreamSpeech({ model, voice: 'af_heart' });
 *
 * <button onClick={() => speak(reply)}>Speak</button>
 * ```
 */
export function useStreamSpeech(options: UseStreamSpeechOptions): UseStreamSpeechReturn {
  const { model, voice, speed, pitch, splitOptions, audioContext, onError } = options;

  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentClause, setCurrentClause] = useState<SynthesizedClause | null>(null);
  const [clauses, setClauses] = useState<SynthesizedClause[]>([]);
  const [error, setError] = useState<Error | null>(null);

  const handleRef = useRef<PlayStreamedSpeechHandle | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const ownedContextRef = useRef<AudioContext | null>(null);
  const mountedRef = useRef(true);

  // Keep a stable reference to onError so callers can pass inline lambdas.
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      handleRef.current?.stop();
      handleRef.current = null;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      const owned = ownedContextRef.current;
      if (owned && owned.state !== 'closed') {
        owned.close().catch(() => {
          /* ignore */
        });
      }
      ownedContextRef.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    handleRef.current?.stop();
    handleRef.current = null;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    if (mountedRef.current) {
      setIsSynthesizing(false);
      setIsPlaying(false);
      setCurrentClause(null);
    }
  }, []);

  const pause = useCallback(() => {
    handleRef.current?.pause();
    if (mountedRef.current) setIsPlaying(false);
  }, []);

  const resume = useCallback(() => {
    handleRef.current?.resume();
    if (mountedRef.current) setIsPlaying(true);
  }, []);

  const speak = useCallback(
    async (text: string): Promise<void> => {
      if (IS_SERVER) return;

      // Stop any in-flight speak() so re-entrant calls don't overlap.
      handleRef.current?.stop();
      handleRef.current = null;
      abortControllerRef.current?.abort();

      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Resolve / lazily create an AudioContext.
      let ctx = audioContext ?? ownedContextRef.current;
      if (!ctx) {
        const Ctor =
          (globalThis as { AudioContext?: typeof AudioContext }).AudioContext ??
          (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) {
          const err = new Error('useStreamSpeech: AudioContext is not available in this environment.');
          if (mountedRef.current) setError(err);
          onErrorRef.current?.(err);
          throw err;
        }
        ctx = new Ctor();
        ownedContextRef.current = ctx;
      }

      if (mountedRef.current) {
        setError(null);
        setClauses([]);
        setCurrentClause(null);
        setIsSynthesizing(true);
        setIsPlaying(false);
      }

      try {
        // Lazy import keeps the hook tree-shake-friendly for SSR.
        const { streamSynthesizeSpeech, playStreamedSpeech } = await import('@localmode/core');

        // Wrap the source iterable so we can record every yielded clause for
        // state. We also flip `isPlaying` true on the first clause yielded.
        const source = streamSynthesizeSpeech({
          model,
          text,
          voice,
          speed,
          pitch,
          splitOptions,
          abortSignal: controller.signal,
        });

        async function* tracked(): AsyncIterable<SynthesizedClause> {
          for await (const clause of source) {
            if (controller.signal.aborted) break;
            if (mountedRef.current) {
              setClauses((prev) => [...prev, clause]);
              if (!isPlayingRef.current) {
                isPlayingRef.current = true;
                setIsPlaying(true);
              }
            }
            yield clause;
          }
          if (mountedRef.current) setIsSynthesizing(false);
        }

        const isPlayingRef = { current: false };

        const handle = await playStreamedSpeech(tracked(), ctx, {
          abortSignal: controller.signal,
          onClause: (clause) => {
            if (mountedRef.current) setCurrentClause(clause);
          },
          onClauseEnd: () => {
            if (mountedRef.current) setCurrentClause(null);
          },
        });
        handleRef.current = handle;

        await handle.playing;

        if (mountedRef.current && handleRef.current === handle) {
          setIsSynthesizing(false);
          setIsPlaying(false);
          setCurrentClause(null);
          handleRef.current = null;
        }
      } catch (err) {
        if (controller.signal.aborted) {
          // Aborted via stop() / unmount — do not surface as an error.
          if (mountedRef.current) {
            setIsSynthesizing(false);
            setIsPlaying(false);
            setCurrentClause(null);
          }
          return;
        }
        const wrapped = err instanceof Error ? err : new Error(String(err));
        if (mountedRef.current) {
          setError(wrapped);
          setIsSynthesizing(false);
          setIsPlaying(false);
          setCurrentClause(null);
        }
        onErrorRef.current?.(wrapped);
      }
    },
    [model, voice, speed, pitch, splitOptions, audioContext]
  );

  return {
    speak,
    pause,
    resume,
    stop,
    isSynthesizing,
    isPlaying,
    currentClause,
    clauses,
    error,
  };
}
