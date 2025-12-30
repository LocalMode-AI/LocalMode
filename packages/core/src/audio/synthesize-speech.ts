/**
 * Text-to-Speech Function
 *
 * Function-first API for speech synthesis.
 *
 * @packageDocumentation
 */

import type {
  TextToSpeechModel,
  SynthesizeSpeechOptions,
  SynthesizeSpeechResult,
  TextToSpeechModelFactory,
} from './types.js';

// Global provider for string model ID resolution
let globalTTSProvider: TextToSpeechModelFactory | null = null;

/**
 * Set the global text-to-speech provider for string model ID resolution.
 *
 * @param provider - Factory function to create TTS models from string IDs
 *
 * @example
 * ```ts
 * import { setGlobalTTSProvider } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * setGlobalTTSProvider((modelId) => transformers.textToSpeech(modelId));
 *
 * // Now you can use string model IDs
 * const { audio } = await synthesizeSpeech({
 *   model: 'Xenova/speecht5-tts',
 *   text: 'Hello, world!',
 * });
 * ```
 */
export function setGlobalTTSProvider(provider: TextToSpeechModelFactory | null): void {
  globalTTSProvider = provider;
}

/**
 * Resolve a model from string ID or return the model object.
 */
function resolveModel(modelOrId: TextToSpeechModel | string): TextToSpeechModel {
  if (typeof modelOrId !== 'string') {
    return modelOrId;
  }

  if (!globalTTSProvider) {
    throw new Error(
      'No global TTS provider configured. ' +
        'Either pass a TextToSpeechModel object or call setGlobalTTSProvider() first.'
    );
  }

  return globalTTSProvider(modelOrId);
}

/**
 * Synthesize speech from text using a text-to-speech model.
 *
 * @param options - Synthesis options including model, text, and voice settings
 * @returns Promise with generated audio and usage information
 *
 * @example Basic usage
 * ```ts
 * import { synthesizeSpeech } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * const { audio, sampleRate, usage } = await synthesizeSpeech({
 *   model: transformers.textToSpeech('Xenova/speecht5-tts'),
 *   text: 'Hello, how are you today?',
 * });
 *
 * // Play the audio
 * const audioContext = new AudioContext();
 * const audioBuffer = await audioContext.decodeAudioData(await audio.arrayBuffer());
 * const source = audioContext.createBufferSource();
 * source.buffer = audioBuffer;
 * source.connect(audioContext.destination);
 * source.start();
 *
 * console.log(`Generated ${usage.characterCount} characters in ${usage.durationMs}ms`);
 * ```
 *
 * @example With voice selection
 * ```ts
 * const { audio } = await synthesizeSpeech({
 *   model: transformers.textToSpeech('Xenova/speecht5-tts'),
 *   text: 'Welcome to the application.',
 *   voice: 'speaker-1',
 *   speed: 1.2, // Slightly faster
 * });
 * ```
 *
 * @example Create audio URL for playback
 * ```ts
 * const { audio } = await synthesizeSpeech({
 *   model: transformers.textToSpeech('Xenova/speecht5-tts'),
 *   text: 'This is a test.',
 * });
 *
 * const audioUrl = URL.createObjectURL(audio);
 * const audioElement = new Audio(audioUrl);
 * audioElement.play();
 * ```
 *
 * @throws {Error} If synthesis fails
 */
export async function synthesizeSpeech(
  options: SynthesizeSpeechOptions
): Promise<SynthesizeSpeechResult> {
  const {
    model: modelOrId,
    text,
    voice,
    speed,
    pitch,
    abortSignal,
    maxRetries = 2,
    providerOptions,
  } = options;

  abortSignal?.throwIfAborted();

  const model = resolveModel(modelOrId);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    abortSignal?.throwIfAborted();

    try {
      const startTime = performance.now();

      const result = await model.doSynthesize({
        text,
        voice,
        speed,
        pitch,
        abortSignal,
        providerOptions,
      });

      const durationMs = performance.now() - startTime;

      return {
        audio: result.audio,
        sampleRate: result.sampleRate,
        usage: {
          characterCount: result.usage.characterCount,
          durationMs,
        },
        response: {
          modelId: model.modelId,
          timestamp: new Date(),
        },
      };
    } catch (error) {
      lastError = error as Error;

      if (abortSignal?.aborted) {
        throw error;
      }

      if (attempt === maxRetries) {
        throw error;
      }

      const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Speech synthesis failed');
}

