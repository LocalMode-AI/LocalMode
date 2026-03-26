/**
 * @file provider.ts
 * @description AI SDK ProviderV3 factory for LocalMode models
 */

import type { LanguageModel, EmbeddingModel } from '@localmode/core';
import { LocalModeError } from '@localmode/core';
import { LocalModeLanguageModel } from './language-model.js';
import { LocalModeEmbeddingModel } from './embedding-model.js';
import type { LocalModeProviderOptions, LocalModeProvider } from './types.js';

/**
 * Check if a model instance is a LocalMode LanguageModel.
 */
function isLanguageModel(model: LanguageModel | EmbeddingModel): model is LanguageModel {
  return 'doGenerate' in model && !('doEmbed' in model);
}

/**
 * Check if a model instance is a LocalMode EmbeddingModel.
 */
function isEmbeddingModel(model: LanguageModel | EmbeddingModel): model is EmbeddingModel {
  return 'doEmbed' in model;
}

/**
 * Create a LocalMode AI SDK provider.
 *
 * The returned provider implements the AI SDK ProviderV3 interface and is callable
 * as a function to get a LanguageModelV3 by model ID.
 *
 * @param options - Provider configuration with a map of model IDs to LocalMode model instances
 * @returns A LocalModeProvider with `languageModel()` and `embeddingModel()` methods
 *
 * @example
 * ```ts
 * import { createLocalMode } from '@localmode/ai-sdk';
 * import { webllm } from '@localmode/webllm';
 * import { transformers } from '@localmode/transformers';
 * import { generateText, embed } from 'ai';
 *
 * const localmode = createLocalMode({
 *   models: {
 *     'llama': webllm.languageModel('Llama-3.2-1B-Instruct-q4f16_1-MLC'),
 *     'embedder': transformers.embedding('Xenova/bge-small-en-v1.5'),
 *   },
 * });
 *
 * const { text } = await generateText({
 *   model: localmode.languageModel('llama'),
 *   prompt: 'Hello',
 * });
 *
 * const { embedding } = await embed({
 *   model: localmode.embeddingModel('embedder'),
 *   value: 'Hello world',
 * });
 * ```
 *
 * @throws {LocalModeError} If a requested model ID is not in the models map
 */
export function createLocalMode(options: LocalModeProviderOptions): LocalModeProvider {
  const { models } = options;

  function getAvailableIds() {
    return Object.keys(models).join(', ');
  }

  function languageModel(modelId: string) {
    const model = models[modelId];
    if (!model) {
      throw new LocalModeError(
        `Language model '${modelId}' not found. Available models: ${getAvailableIds()}`,
        'MODEL_NOT_FOUND',
        { hint: `Pass the model when creating the provider: createLocalMode({ models: { '${modelId}': yourModel } })` }
      );
    }
    if (!isLanguageModel(model)) {
      throw new LocalModeError(
        `Model '${modelId}' is not a language model. It appears to be an embedding model.`,
        'MODEL_TYPE_MISMATCH',
        { hint: `Use embeddingModel('${modelId}') instead of languageModel('${modelId}')` }
      );
    }
    return new LocalModeLanguageModel(model);
  }

  function embeddingModel(modelId: string) {
    const model = models[modelId];
    if (!model) {
      throw new LocalModeError(
        `Embedding model '${modelId}' not found. Available models: ${getAvailableIds()}`,
        'MODEL_NOT_FOUND',
        { hint: `Pass the model when creating the provider: createLocalMode({ models: { '${modelId}': yourModel } })` }
      );
    }
    if (!isEmbeddingModel(model)) {
      throw new LocalModeError(
        `Model '${modelId}' is not an embedding model. It appears to be a language model.`,
        'MODEL_TYPE_MISMATCH',
        { hint: `Use languageModel('${modelId}') instead of embeddingModel('${modelId}')` }
      );
    }
    return new LocalModeEmbeddingModel(model);
  }

  const provider = function (modelId: string) {
    return languageModel(modelId);
  } as unknown as LocalModeProvider;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = provider as any;
  p.languageModel = languageModel;
  p.embeddingModel = embeddingModel;
  Object.defineProperty(provider, 'specificationVersion', { value: 'v3', writable: false, enumerable: true });

  return provider;
}
