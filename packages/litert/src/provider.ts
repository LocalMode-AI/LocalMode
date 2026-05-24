/**
 * LiteRT Provider
 *
 * Factory for creating LiteRT-LM model instances.
 * Runs .litertlm models in the browser via WebGPU or CPU WASM backend.
 *
 * @packageDocumentation
 */

import type { LiteRTProvider, LiteRTProviderSettings, LiteRTModelSettings } from './types.js';
import { createLanguageModel } from './model.js';

/**
 * Create a LiteRT provider with custom settings.
 *
 * @param settings - Provider-level settings that apply to all models
 * @returns A LiteRTProvider instance
 *
 * @example Basic usage
 * ```ts
 * import { createLitert } from '@localmode/litert';
 *
 * const myLitert = createLitert({
 *   onProgress: (p) => console.log(`Loading: ${p.progress}%`),
 *   backend: 'GPU',
 * });
 *
 * const model = myLitert.languageModel('gemma-4-E2B');
 * ```
 */
export function createLitert(settings?: LiteRTProviderSettings): LiteRTProvider {
  return {
    languageModel(modelId: string, modelSettings?: LiteRTModelSettings) {
      return createLanguageModel(modelId, {
        ...modelSettings,
        onProgress: modelSettings?.onProgress ?? settings?.onProgress,
        backend: modelSettings?.backend ?? settings?.backend,
      });
    },
  };
}

/**
 * Default LiteRT provider instance.
 *
 * Use this for quick access without custom configuration.
 *
 * @example
 * ```ts
 * import { litert } from '@localmode/litert';
 * import { generateText } from '@localmode/core';
 *
 * const { text } = await generateText({
 *   model: litert.languageModel('gemma-4-E2B'),
 *   prompt: 'Hello, how are you?',
 * });
 * ```
 */
export const litert: LiteRTProvider = createLitert();
