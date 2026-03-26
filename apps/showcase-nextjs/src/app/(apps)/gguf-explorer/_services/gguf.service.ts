/**
 * @file gguf.service.ts
 * @description Service for GGUF metadata parsing and browser compatibility checking.
 * Wraps @localmode/wllama APIs for use by hooks.
 */

import {
  checkGGUFBrowserCompatFromURL,
  WLLAMA_MODELS,
  getModelCategory,
} from '@localmode/wllama';
import type { GGUFMetadata, GGUFBrowserCompat, WllamaModelEntry } from '@localmode/wllama';

export type { GGUFMetadata, GGUFBrowserCompat, WllamaModelEntry };

/** Re-export curated model catalog and category helper */
export { WLLAMA_MODELS, getModelCategory };

/**
 * Inspect a GGUF model: parse metadata and check browser compatibility in one call.
 *
 * @param url - Full URL or HuggingFace shorthand (`repo/name:filename.gguf`)
 * @param options - Optional abort signal
 * @returns Combined metadata and compatibility result
 */
export async function inspectModel(
  url: string,
  options?: { abortSignal?: AbortSignal }
) {
  const result = await checkGGUFBrowserCompatFromURL(url, options);
  return result;
}
