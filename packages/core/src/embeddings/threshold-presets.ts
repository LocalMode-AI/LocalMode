/**
 * Threshold Presets
 *
 * Known-good default similarity thresholds for popular embedding models.
 * All values are cosine similarity thresholds suitable for semantic search
 * relevance filtering.
 *
 * @packageDocumentation
 */

// ═══════════════════════════════════════════════════════════════
// MODEL THRESHOLD PRESETS
// ═══════════════════════════════════════════════════════════════

/**
 * Known-good default cosine similarity thresholds for popular embedding models.
 *
 * Each key is a model ID (matching `EmbeddingModel.modelId`) and each value
 * is a cosine similarity threshold representing a sensible default for
 * semantic search relevance filtering.
 *
 * These are approximate starting points. For production use, calibrate
 * thresholds against your specific domain data using `calibrateThreshold()`.
 *
 * @example
 * ```ts
 * import { MODEL_THRESHOLD_PRESETS } from '@localmode/core';
 *
 * const threshold = MODEL_THRESHOLD_PRESETS['Xenova/bge-small-en-v1.5'];
 * // 0.5
 *
 * const results = await db.search(queryVector, { threshold });
 * ```
 *
 * @see {@link getDefaultThreshold} for safe lookup with undefined fallback
 * @see {@link calibrateThreshold} for domain-specific calibration
 */
export const MODEL_THRESHOLD_PRESETS: Record<string, number> = {
  // BGE family — tend to produce lower raw cosine similarity values
  'Xenova/bge-small-en-v1.5': 0.5,
  'Xenova/bge-base-en-v1.5': 0.5,

  // MiniLM family — higher similarity scores for equivalent matches
  'Xenova/all-MiniLM-L6-v2': 0.68,
  'Xenova/all-MiniLM-L12-v2': 0.7,

  // Nomic
  'nomic-ai/nomic-embed-text-v1.5': 0.55,

  // GTE family
  'Xenova/gte-small': 0.6,
  'Xenova/gte-base': 0.6,

  // E5 family
  'Xenova/e5-small-v2': 0.6,

  // Paraphrase
  'Xenova/paraphrase-MiniLM-L6-v2': 0.72,
};

// ═══════════════════════════════════════════════════════════════
// LOOKUP HELPER
// ═══════════════════════════════════════════════════════════════

/**
 * Look up the default cosine similarity threshold for a known model ID.
 *
 * Returns `undefined` if the model is not in the presets map,
 * allowing callers to provide their own fallback.
 *
 * @param modelId - The embedding model ID to look up (e.g., 'Xenova/bge-small-en-v1.5')
 * @returns The preset threshold, or `undefined` if the model is not known
 *
 * @example
 * ```ts
 * import { getDefaultThreshold } from '@localmode/core';
 *
 * const threshold = getDefaultThreshold('Xenova/bge-small-en-v1.5');
 * // 0.5
 *
 * const unknown = getDefaultThreshold('unknown/model');
 * // undefined
 * ```
 *
 * @see {@link MODEL_THRESHOLD_PRESETS} for the full presets map
 * @see {@link calibrateThreshold} for domain-specific calibration
 */
export function getDefaultThreshold(modelId: string): number | undefined {
  return MODEL_THRESHOLD_PRESETS[modelId];
}
