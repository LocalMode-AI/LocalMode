/**
 * @file use-synthesize-speech.ts
 * @description Hook for text-to-speech with @localmode/core synthesizeSpeech()
 */

import type { TextToSpeechModel, SynthesizeSpeechResult } from '@localmode/core';
import { useOperation } from '../core/use-operation.js';

/** Per-call synthesis options accepted by `execute(text, opts)`. */
export interface UseSynthesizeSpeechCallOptions {
  /** Voice ID to use (overrides the hook-level voice) */
  voice?: string;
  /** Speech rate, 0.5–2.0 (overrides the hook-level speed) */
  speed?: number;
  /** Pitch adjustment (overrides the hook-level pitch) */
  pitch?: number;
}

/** Options for the useSynthesizeSpeech hook */
export interface UseSynthesizeSpeechOptions {
  /** The text-to-speech model to use */
  model: TextToSpeechModel;
  /** Voice ID applied to every execute() call (per-call opts override) */
  voice?: string;
  /** Speech rate (0.5-2.0, default: 1.0) applied to every execute() call */
  speed?: number;
  /** Pitch adjustment applied to every execute() call */
  pitch?: number;
}

/**
 * Hook for speech synthesis (text-to-speech).
 *
 * Voice, speed, and pitch can be set once at the hook level and overridden
 * per call: `execute(text, { voice, speed, pitch })`.
 *
 * @param options - Text-to-speech model configuration
 * @returns Operation state with execute(text, opts?) function
 *
 * @example
 * ```tsx
 * const { execute, data } = useSynthesizeSpeech({ model, voice: 'af_heart' });
 * await execute('Hello world');                       // uses af_heart
 * await execute('Bonjour', { voice: 'bf_emma', speed: 1.2 }); // per-call override
 * ```
 */
export function useSynthesizeSpeech(options: UseSynthesizeSpeechOptions) {
  const { model, voice, speed, pitch } = options;

  return useOperation<[string, UseSynthesizeSpeechCallOptions?], SynthesizeSpeechResult>({
    fn: async (
      text: string,
      callOptions: UseSynthesizeSpeechCallOptions | undefined,
      signal: AbortSignal
    ) => {
      // useOperation appends the AbortSignal AFTER the caller's arguments, so
      // when execute(text) is called without per-call options the signal
      // arrives in the callOptions slot — disambiguate at runtime.
      const isSignal = callOptions instanceof AbortSignal;
      const perCall = isSignal ? undefined : callOptions;
      const abortSignal = isSignal ? (callOptions as unknown as AbortSignal) : signal;

      const { synthesizeSpeech } = await import('@localmode/core');
      return synthesizeSpeech({
        model,
        text,
        voice: perCall?.voice ?? voice,
        speed: perCall?.speed ?? speed,
        pitch: perCall?.pitch ?? pitch,
        abortSignal,
      });
    },
  });
}
