/**
 * @file use-synthesize-speech.ts
 * @description Hook for text-to-speech with @localmode/core synthesizeSpeech()
 */

import type { TextToSpeechModel, SynthesizeSpeechResult } from '@localmode/core';
import { useOperation } from '../core/use-operation.js';

/** Options for the useSynthesizeSpeech hook */
interface UseSynthesizeSpeechOptions {
  /** The text-to-speech model to use */
  model: TextToSpeechModel;
}

/**
 * Hook for speech synthesis (text-to-speech).
 *
 * @param options - Text-to-speech model configuration
 * @returns Operation state with execute(text: string) function
 */
export function useSynthesizeSpeech(options: UseSynthesizeSpeechOptions) {
  const { model } = options;

  return useOperation<[string], SynthesizeSpeechResult>({
    fn: async (text: string, signal: AbortSignal) => {
      const { synthesizeSpeech } = await import('@localmode/core');
      return synthesizeSpeech({ model, text, abortSignal: signal });
    },
  });
}
