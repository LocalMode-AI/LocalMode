/**
 * @file chat.service.ts
 * @description Service for creating LLM chat models using @localmode/webllm
 * or @localmode/wllama, and semantic cache integration using
 * @localmode/core + @localmode/transformers.
 *
 * Streaming, cancellation, and message state are now handled by `useChat`
 * from `@localmode/react`. This service only provides model instantiation
 * and cache factory functions.
 */
import { webllm } from '@localmode/webllm';
import { wllama, WLLAMA_MODELS } from '@localmode/wllama';
import { transformers } from '@localmode/transformers';
import {
  createSemanticCache,
  semanticCacheMiddleware,
  wrapLanguageModel,
} from '@localmode/core';
import type { LanguageModel, SemanticCache } from '@localmode/core';
import { CACHE_CONFIG } from '../_lib/constants';
import type { ModelBackend } from '../_lib/types';

/**
 * Infer the backend from a model ID string.
 *
 * Used as a fallback when the model store hasn't loaded yet (e.g., on page reload
 * with a persisted selectedModel). Without this, ONNX/wllama models would incorrectly
 * default to 'webgpu' and cause ModelNotFoundError from the WebLLM engine.
 */
export function inferBackendFromModelId(modelId: string): ModelBackend {
  // ONNX models from onnx-community or microsoft official ONNX builds
  if (modelId.includes('onnx-community/') || modelId.includes('-ONNX') || modelId.includes('-onnx') || modelId.includes('onnx-web')) {
    return 'onnx';
  }
  // Check wllama catalog
  if (modelId in WLLAMA_MODELS) {
    return 'wasm';
  }
  return 'webgpu';
}

/**
 * Create a LanguageModel instance for the given model ID and backend.
 *
 * @param modelId - The model ID to instantiate
 * @param backend - The inference backend ('webgpu' for WebLLM, 'wasm' for wllama, 'onnx' for TJS v4)
 * @returns A LanguageModel compatible with `@localmode/react` `useChat`
 */
export function createChatModel(modelId: string, backend: ModelBackend = 'webgpu'): LanguageModel {
  if (backend === 'onnx') {
    return transformers.languageModel(modelId);
  }
  if (backend === 'wasm') {
    return wllama.languageModel(modelId);
  }
  return webllm.languageModel(modelId);
}

/**
 * Create an EmbeddingModel instance for semantic cache key generation.
 *
 * @returns An EmbeddingModel for generating prompt embeddings
 */
export function createEmbeddingModel() {
  return transformers.embedding(CACHE_CONFIG.embeddingModel);
}

/**
 * Create a SemanticCache instance with the configured embedding model and settings.
 *
 * @returns A SemanticCache instance
 */
export async function createSemanticCacheInstance(): Promise<SemanticCache> {
  const embeddingModel = createEmbeddingModel();
  return createSemanticCache({
    embeddingModel,
    threshold: CACHE_CONFIG.threshold,
    maxEntries: CACHE_CONFIG.maxEntries,
    ttlMs: CACHE_CONFIG.ttlMs,
    storage: 'memory',
  });
}

/**
 * Wrap a LanguageModel with semantic cache middleware.
 *
 * @param model - The base LanguageModel to wrap
 * @param cache - The SemanticCache instance to use
 * @returns A cache-wrapped LanguageModel
 */
export function createCachedModel(model: LanguageModel, cache: SemanticCache): LanguageModel {
  return wrapLanguageModel({
    model,
    middleware: semanticCacheMiddleware(cache),
  });
}
