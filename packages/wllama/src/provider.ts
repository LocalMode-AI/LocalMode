/**
 * wllama Provider
 *
 * Factory for creating wllama (llama.cpp WASM) model instances.
 * Runs any standard GGUF model file in the browser without WebGPU.
 *
 * @packageDocumentation
 */

import type { WllamaProvider, WllamaProviderSettings, WllamaModelSettings } from './types.js';
import { createLanguageModel } from './model.js';

/**
 * Create a wllama provider with custom settings.
 *
 * @param settings - Provider-level settings that apply to all models
 * @returns A WllamaProvider instance
 *
 * @example Basic usage
 * ```ts
 * import { createWllama } from '@localmode/wllama';
 *
 * const myWllama = createWllama({
 *   onProgress: (p) => console.log(`Loading: ${p.progress}%`),
 *   numThreads: 4,
 * });
 *
 * const model = myWllama.languageModel('bartowski/Llama-3.2-1B-Instruct-GGUF:Llama-3.2-1B-Instruct-Q4_K_M.gguf');
 * ```
 */
export function createWllama(settings?: WllamaProviderSettings): WllamaProvider {
  return {
    languageModel(modelId: string, modelSettings?: WllamaModelSettings) {
      return createLanguageModel(modelId, {
        // Provider-level defaults
        onProgress: modelSettings?.onProgress ?? settings?.onProgress,
        numThreads: modelSettings?.numThreads ?? settings?.numThreads,
        cacheDir: modelSettings?.cacheDir ?? settings?.cacheDir,
        // Model-level overrides
        ...modelSettings,
      });
    },
  };
}

/**
 * Default wllama provider instance.
 *
 * Use this for quick access without custom configuration.
 *
 * @example
 * ```ts
 * import { wllama } from '@localmode/wllama';
 * import { generateText } from '@localmode/core';
 *
 * const { text } = await generateText({
 *   model: wllama.languageModel('bartowski/Llama-3.2-1B-Instruct-GGUF:Llama-3.2-1B-Instruct-Q4_K_M.gguf'),
 *   prompt: 'Hello, how are you?',
 * });
 * ```
 */
export const wllama: WllamaProvider = createWllama();
