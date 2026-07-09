/**
 * @file use-transcribe.ts
 * @description Hook for audio transcription with @localmode/core transcribe()
 */

import type { SpeechToTextModel, TranscribeResult } from '@localmode/core';
import { useOperation } from '../core/use-operation.js';

/** Per-call transcription options accepted by `execute(audio, opts)`. */
export interface UseTranscribeCallOptions {
  /** Language code, ISO 639-1 (overrides the hook-level language) */
  language?: string;
  /** Task type (overrides the hook-level task) */
  task?: 'transcribe' | 'translate';
  /** Whether to return timestamps (overrides the hook-level setting) */
  returnTimestamps?: boolean | 'word';
}

/** Options for the useTranscribe hook */
export interface UseTranscribeOptions {
  /** The speech-to-text model to use */
  model: SpeechToTextModel;
  /** Language code (ISO 639-1) applied to every execute() call */
  language?: string;
  /** Task type applied to every execute() call */
  task?: 'transcribe' | 'translate';
  /** Whether to return timestamps — segments arrive on `data.segments` */
  returnTimestamps?: boolean | 'word';
}

/**
 * Hook for audio transcription (speech-to-text).
 *
 * Language, task, and timestamp options can be set once at the hook level
 * and overridden per call: `execute(audio, { language, task, returnTimestamps })`.
 * When timestamps are requested, segments arrive on `data.segments`.
 *
 * @param options - Speech-to-text model configuration
 * @returns Operation state with execute(audio, opts?) function
 *
 * @example
 * ```tsx
 * const { execute, data } = useTranscribe({ model, returnTimestamps: true });
 * await execute(audioBlob);
 * data?.segments?.forEach(seg => console.log(`[${seg.start}s] ${seg.text}`));
 * ```
 */
export function useTranscribe(options: UseTranscribeOptions) {
  const { model, language, task, returnTimestamps } = options;

  return useOperation<[Blob | ArrayBuffer, UseTranscribeCallOptions?], TranscribeResult>({
    fn: async (
      audio: Blob | ArrayBuffer,
      callOptions: UseTranscribeCallOptions | undefined,
      signal: AbortSignal
    ) => {
      // useOperation appends the AbortSignal AFTER the caller's arguments, so
      // when execute(audio) is called without per-call options the signal
      // arrives in the callOptions slot — disambiguate at runtime.
      const isSignal = callOptions instanceof AbortSignal;
      const perCall = isSignal ? undefined : callOptions;
      const abortSignal = isSignal ? (callOptions as unknown as AbortSignal) : signal;

      const { transcribe } = await import('@localmode/core');
      return transcribe({
        model,
        audio,
        language: perCall?.language ?? language,
        task: perCall?.task ?? task,
        returnTimestamps: perCall?.returnTimestamps ?? returnTimestamps,
        abortSignal,
      });
    },
  });
}
