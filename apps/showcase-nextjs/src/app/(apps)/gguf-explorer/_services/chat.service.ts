/**
 * @file chat.service.ts
 * @description Service for creating wllama language model instances.
 * Wraps @localmode/wllama provider for use by hooks.
 */

import { wllama, isModelCached } from '@localmode/wllama';
import type { WllamaModelSettings } from '@localmode/wllama';
import type { LanguageModel } from '@localmode/core';

/**
 * Create a LanguageModel from a GGUF URL using wllama.
 *
 * @param url - Full URL or HuggingFace shorthand for the GGUF model
 * @param settings - Optional model settings (onProgress, temperature, etc.)
 * @returns A LanguageModel compatible with @localmode/react useChat
 */
export function createChatModel(url: string, settings?: WllamaModelSettings): LanguageModel {
  return wllama.languageModel(url, settings);
}

/**
 * Check if a model is already cached locally.
 *
 * @param url - Model URL to check
 * @returns True if the model is available in cache
 */
export async function checkModelCached(url: string) {
  return isModelCached(url);
}
