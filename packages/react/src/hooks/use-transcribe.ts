/**
 * @file use-transcribe.ts
 * @description Hook for audio transcription with @localmode/core transcribe()
 */

import type { SpeechToTextModel, TranscribeResult } from '@localmode/core';
import { useOperation } from '../core/use-operation.js';

/** Options for the useTranscribe hook */
interface UseTranscribeOptions {
  /** The speech-to-text model to use */
  model: SpeechToTextModel;
}

/**
 * Hook for audio transcription (speech-to-text).
 *
 * @param options - Speech-to-text model configuration
 * @returns Operation state with execute(audio: Blob | ArrayBuffer) function
 */
export function useTranscribe(options: UseTranscribeOptions) {
  const { model } = options;

  return useOperation<[Blob | ArrayBuffer], TranscribeResult>({
    fn: async (audio: Blob | ArrayBuffer, signal: AbortSignal) => {
      const { transcribe } = await import('@localmode/core');
      return transcribe({ model, audio, abortSignal: signal });
    },
  });
}
