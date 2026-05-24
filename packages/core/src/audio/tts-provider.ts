/**
 * Shared global text-to-speech provider registry.
 *
 * Both `synthesizeSpeech()` (one-shot) and `streamSynthesizeSpeech()`
 * (streaming) resolve string model IDs through the same registry so a
 * single `setGlobalTTSProvider()` call wires both APIs.
 *
 * @packageDocumentation
 */

import type { TextToSpeechModel, TextToSpeechModelFactory } from './types.js';

let globalTTSProvider: TextToSpeechModelFactory | null = null;

/**
 * Set the global text-to-speech provider for string model ID resolution.
 *
 * @param provider - Factory function to create TTS models from string IDs,
 *                   or `null` to clear.
 *
 * @example
 * ```ts
 * import { setGlobalTTSProvider } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * setGlobalTTSProvider((modelId) => transformers.textToSpeech(modelId));
 * ```
 */
export function setGlobalTTSProvider(provider: TextToSpeechModelFactory | null): void {
  globalTTSProvider = provider;
}

/**
 * Get the currently registered TTS provider, or `null` if none.
 *
 * @internal
 */
export function getGlobalTTSProvider(): TextToSpeechModelFactory | null {
  return globalTTSProvider;
}

/**
 * Resolve a `TextToSpeechModel` from either a model instance or a string
 * ID (via the global provider). Throws a descriptive error if a string
 * ID is passed without a registered provider.
 *
 * @internal
 */
export function resolveTTSModel(modelOrId: TextToSpeechModel | string): TextToSpeechModel {
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
