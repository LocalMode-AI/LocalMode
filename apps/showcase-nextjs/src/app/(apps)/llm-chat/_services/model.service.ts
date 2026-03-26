/**
 * @file model.service.ts
 * @description Service for model management using @localmode/webllm, @localmode/wllama, and @localmode/transformers
 */
import {
  WEBLLM_MODELS,
  getModelCategory as getWebLLMCategory,
  deleteModelCache as deleteWebLLMCache,
  isModelCached as isWebLLMCached,
  preloadModel as preloadWebLLM,
  type WebLLMModelId,
} from '@localmode/webllm';
import {
  WLLAMA_MODELS,
  getModelCategory as getWllamaCategory,
  isModelCached as isWllamaCached,
  preloadModel as preloadWllama,
  deleteModelCache as deleteWllamaCache,
  isCrossOriginIsolated,
  type WllamaModelId,
  type WllamaModelEntry,
} from '@localmode/wllama';
import {
  TRANSFORMERS_LLM_MODELS,
  getLLMModelCategory,
  isModelCached as isTransformersCached,
  preloadModel as preloadTransformers,
  clearModelCache as clearTransformersCache,
} from '@localmode/transformers';
import { isWebGPUSupported } from '@localmode/core';
import type { ModelBackend } from '../_lib/types';

/**
 * Get all available models from WebLLM, wllama, and Transformers.js v4 ONNX catalogs
 */
export function getAvailableModels() {
  const webllmModels = Object.entries(WEBLLM_MODELS).map(([id, info]) => ({
    id,
    name: info.name,
    contextLength: info.contextLength,
    size: info.size,
    sizeBytes: info.sizeBytes,
    description: info.description,
    category: getWebLLMCategory(info.sizeBytes),
    backend: 'webgpu' as ModelBackend,
    vision: 'vision' in info ? (info as Record<string, unknown>).vision === true : undefined,
  }));

  const wllamaModels = (Object.entries(WLLAMA_MODELS) as [string, WllamaModelEntry][]).map(([id, info]) => ({
    id,
    name: info.name,
    contextLength: info.contextLength,
    size: info.size,
    sizeBytes: info.sizeBytes,
    description: info.description,
    category: getWllamaCategory(info.sizeBytes),
    backend: 'wasm' as ModelBackend,
  }));

  const onnxModels = Object.entries(TRANSFORMERS_LLM_MODELS).map(([id, info]) => ({
    id,
    name: info.name.replace(' (ONNX)', ''),
    contextLength: info.contextLength,
    size: info.size,
    sizeBytes: info.sizeBytes,
    description: info.description,
    category: getLLMModelCategory(info.sizeBytes),
    backend: 'onnx' as ModelBackend,
    vision: 'vision' in info ? (info as Record<string, unknown>).vision === true : undefined,
  }));

  return [...webllmModels, ...wllamaModels, ...onnxModels];
}

/**
 * Check if a model is cached locally
 * @param modelId - The model ID to check
 * @param backend - The inference backend for this model
 */
export async function checkModelCached(modelId: string, backend: ModelBackend) {
  if (backend === 'onnx') {
    return isTransformersCached(modelId);
  }
  if (backend === 'wasm') {
    return isWllamaCached(modelId);
  }
  return isWebLLMCached(modelId);
}

/**
 * Load a model with progress callback
 * @param modelId - The model ID to load
 * @param backend - The inference backend for this model
 * @param onProgress - Optional progress callback (0-100)
 */
export async function loadModel(
  modelId: string,
  backend: ModelBackend,
  onProgress?: (progress: number) => void
) {
  if (backend === 'onnx') {
    return preloadTransformers(modelId, {
      onProgress: (p: { progress?: number }) => onProgress?.(p.progress ?? 0),
    });
  }
  if (backend === 'wasm') {
    return preloadWllama(modelId, {
      onProgress: (p: { progress?: number }) => onProgress?.(p.progress ?? 0),
    });
  }
  return preloadWebLLM(modelId, {
    onProgress: (p: { progress?: number }) => onProgress?.(p.progress ?? 0),
  });
}

/**
 * Delete a model's cache
 * @param modelId - The model ID to delete
 * @param backend - The inference backend for this model
 */
export async function deleteCache(modelId: string, backend: ModelBackend) {
  if (backend === 'onnx') {
    // TJS v4 manages cache via Cache API — clear the transformers cache
    return clearTransformersCache();
  }
  if (backend === 'wasm') {
    return deleteWllamaCache(modelId);
  }
  return deleteWebLLMCache(modelId);
}

/**
 * Get display name for a model ID (checks all three catalogs)
 * @param modelId - The model ID
 */
export function getModelDisplayName(modelId: string) {
  const webllmModel = WEBLLM_MODELS[modelId as WebLLMModelId];
  if (webllmModel) return webllmModel.name;

  const wllamaModel = WLLAMA_MODELS[modelId as WllamaModelId];
  if (wllamaModel) return wllamaModel.name;

  const onnxModel = TRANSFORMERS_LLM_MODELS[modelId];
  if (onnxModel) return onnxModel.name.replace(' (ONNX)', '');

  return modelId.replace('-MLC', '').replace(/_/g, ' ');
}

/**
 * Detect browser capabilities for backend support
 * @returns WebGPU availability and CORS isolation status
 */
export async function detectCapabilities() {
  const webGPUSupported = await isWebGPUSupported();
  const crossOriginIsolated = isCrossOriginIsolated();
  return { webGPUSupported, crossOriginIsolated };
}
