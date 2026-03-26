/**
 * @file types.ts
 * @description Type definitions for the @localmode/ai-sdk provider adapter
 */

import type { LanguageModel, EmbeddingModel } from '@localmode/core';
import type { LanguageModelV3, EmbeddingModelV3 } from '@ai-sdk/provider';

/**
 * Options for creating a LocalMode AI SDK provider.
 *
 * @example
 * ```ts
 * const provider = createLocalMode({
 *   models: {
 *     'llm': webllm.languageModel('Llama-3.2-1B-Instruct-q4f16_1-MLC'),
 *     'embedder': transformers.embedding('Xenova/bge-small-en-v1.5'),
 *   },
 * });
 * ```
 */
export interface LocalModeProviderOptions {
  /** Map of model IDs to LocalMode model instances */
  models: Record<string, LanguageModel | EmbeddingModel>;
}

/**
 * A LocalMode provider that implements the AI SDK ProviderV3 interface.
 * Callable as a function to get a LanguageModelV3 by model ID.
 */
export interface LocalModeProvider {
  /** Get a LanguageModelV3 by model ID */
  (modelId: string): LanguageModelV3;

  /** The specification version */
  readonly specificationVersion: 'v3';

  /** Get a LanguageModelV3 by model ID */
  languageModel(modelId: string): LanguageModelV3;

  /** Get an EmbeddingModelV3 by model ID */
  embeddingModel(modelId: string): EmbeddingModelV3;
}
