/**
 * WebLLM Provider
 *
 * Factory for creating WebLLM model instances.
 *
 * @packageDocumentation
 */

import type { WebLLMProvider, WebLLMProviderSettings, WebLLMModelSettings } from './types.js';
import { createLanguageModel } from './model.js';

/**
 * Create a WebLLM provider with custom settings.
 *
 * @param settings - Provider-level settings that apply to all models
 * @returns A WebLLMProvider instance
 *
 * @example Basic usage
 * ```ts
 * import { createWebLLM } from '@localmode/webllm';
 *
 * const myWebLLM = createWebLLM({
 *   onProgress: (p) => console.log(`Loading: ${p.progress}%`),
 * });
 *
 * const model = myWebLLM.languageModel('Llama-3.2-1B-Instruct-q4f16');
 * ```
 */
export function createWebLLM(settings?: WebLLMProviderSettings): WebLLMProvider {
  return {
    languageModel(modelId: string, modelSettings?: WebLLMModelSettings) {
      return createLanguageModel(modelId, {
        onProgress: modelSettings?.onProgress ?? settings?.onProgress,
        ...modelSettings,
      });
    },
  };
}

/**
 * Default WebLLM provider instance.
 *
 * Use this for quick access without custom configuration.
 *
 * @example
 * ```ts
 * import { webllm } from '@localmode/webllm';
 * import { generateText } from '@localmode/core';
 *
 * const { text } = await generateText({
 *   model: webllm.languageModel('Llama-3.2-1B-Instruct-q4f16'),
 *   prompt: 'Hello, how are you?',
 * });
 * ```
 */
export const webllm: WebLLMProvider = createWebLLM();

