/**
 * Differential Privacy Sensitivity Calibration
 *
 * Provides sensitivity lookup for known embedding models and
 * runtime calibration for unknown models.
 *
 * L2 sensitivity is the maximum change in the embedding output (L2 norm)
 * when a single input changes. For normalized embeddings (unit vectors),
 * the sensitivity is bounded by 2.0 (the maximum distance between two unit vectors).
 *
 * @packageDocumentation
 */

import type { EmbeddingModel } from '../embeddings/types.js';

// ============================================================================
// Known Model Sensitivities
// ============================================================================

/**
 * Lookup table of L2 sensitivities for known embedding models.
 *
 * All listed models produce unit-normalized embeddings,
 * so their L2 sensitivity is 2.0 (maximum distance between two unit vectors).
 */
const KNOWN_SENSITIVITIES: Record<string, number> = {
  // BGE models (BAAI)
  'Xenova/bge-small-en-v1.5': 2.0,
  'Xenova/bge-base-en-v1.5': 2.0,
  'Xenova/bge-large-en-v1.5': 2.0,
  'BAAI/bge-small-en-v1.5': 2.0,
  'BAAI/bge-base-en-v1.5': 2.0,
  'BAAI/bge-large-en-v1.5': 2.0,

  // MiniLM models
  'Xenova/all-MiniLM-L6-v2': 2.0,
  'Xenova/all-MiniLM-L12-v2': 2.0,
  'sentence-transformers/all-MiniLM-L6-v2': 2.0,
  'sentence-transformers/all-MiniLM-L12-v2': 2.0,

  // MPNet models
  'Xenova/all-mpnet-base-v2': 2.0,
  'sentence-transformers/all-mpnet-base-v2': 2.0,

  // GTE models
  'Xenova/gte-small': 2.0,
  'Xenova/gte-base': 2.0,
  'thenlper/gte-small': 2.0,
  'thenlper/gte-base': 2.0,

  // E5 models
  'Xenova/e5-small-v2': 2.0,
  'Xenova/e5-base-v2': 2.0,
  'intfloat/e5-small-v2': 2.0,
  'intfloat/e5-base-v2': 2.0,

  // Nomic models
  'nomic-ai/nomic-embed-text-v1.5': 2.0,
};

/**
 * Default L2 sensitivity for unknown models.
 * Uses 2.0 assuming the model produces normalized (unit-norm) embeddings,
 * which is the standard for modern embedding models.
 */
const DEFAULT_SENSITIVITY = 2.0;

// ============================================================================
// Sensitivity Lookup
// ============================================================================

/**
 * Look up the L2 sensitivity for a known model.
 *
 * @param modelId - Model identifier (e.g., 'Xenova/bge-small-en-v1.5')
 * @returns Known sensitivity or undefined if model is not in the lookup table
 *
 * @example
 * ```ts
 * const sensitivity = lookupSensitivity('Xenova/bge-small-en-v1.5');
 * // 2.0
 * ```
 */
export function lookupSensitivity(modelId: string): number | undefined {
  return KNOWN_SENSITIVITIES[modelId];
}

/**
 * Get the L2 sensitivity for a model, using lookup table or default.
 *
 * @param modelId - Optional model identifier for lookup
 * @returns L2 sensitivity value
 *
 * @example
 * ```ts
 * const sensitivity = getSensitivity('Xenova/bge-small-en-v1.5');
 * // 2.0 (from lookup table)
 *
 * const fallback = getSensitivity('unknown-model');
 * // 2.0 (default for normalized models)
 * ```
 */
export function getSensitivity(modelId?: string): number {
  if (modelId) {
    const known = lookupSensitivity(modelId);
    if (known !== undefined) return known;
  }
  return DEFAULT_SENSITIVITY;
}

// ============================================================================
// Runtime Sensitivity Calibration
// ============================================================================

/**
 * Default diverse text samples for sensitivity calibration.
 * Covers a range of topics, lengths, and content types.
 */
const DEFAULT_CALIBRATION_SAMPLES = [
  'The quick brown fox jumps over the lazy dog.',
  'A journey of a thousand miles begins with a single step.',
  'To be or not to be, that is the question.',
  'The capital of France is Paris.',
  'Machine learning is a subset of artificial intelligence.',
  'The sun rises in the east and sets in the west.',
  'Water boils at 100 degrees Celsius at standard pressure.',
  'She sells seashells by the seashore.',
  'E equals mc squared, according to Einstein.',
  'The mitochondria is the powerhouse of the cell.',
];

/**
 * Compute the L2 norm of a vector.
 */
function l2Norm(vector: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < vector.length; i++) {
    sum += vector[i] * vector[i];
  }
  return Math.sqrt(sum);
}

/**
 * Compute the L2 distance between two vectors.
 */
function l2Distance(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * Calibrate L2 sensitivity by running the model on diverse inputs
 * and computing the maximum pairwise L2 distance.
 *
 * This provides an empirical upper bound on the sensitivity.
 * The theoretical sensitivity for normalized embeddings is 2.0,
 * and empirical values are typically close to this.
 *
 * @param model - The embedding model to calibrate
 * @param samples - Optional custom text samples (defaults to diverse set)
 * @returns Empirical L2 sensitivity estimate
 *
 * @example
 * ```ts
 * const sensitivity = await calibrateSensitivity(model);
 * console.log(`Empirical sensitivity: ${sensitivity}`);
 * ```
 */
export async function calibrateSensitivity(
  model: EmbeddingModel,
  samples?: string[]
): Promise<number> {
  const texts = samples ?? DEFAULT_CALIBRATION_SAMPLES;

  // Embed all samples
  const result = await model.doEmbed({ values: texts });
  const embeddings = result.embeddings;

  // Check if embeddings are normalized
  let allNormalized = true;
  for (const emb of embeddings) {
    const norm = l2Norm(emb);
    if (Math.abs(norm - 1.0) > 0.01) {
      allNormalized = false;
      break;
    }
  }

  // If all embeddings are normalized, sensitivity is bounded by 2.0
  if (allNormalized) {
    return DEFAULT_SENSITIVITY;
  }

  // Otherwise, compute maximum pairwise L2 distance
  let maxDistance = 0;
  for (let i = 0; i < embeddings.length; i++) {
    for (let j = i + 1; j < embeddings.length; j++) {
      const dist = l2Distance(embeddings[i], embeddings[j]);
      if (dist > maxDistance) {
        maxDistance = dist;
      }
    }
  }

  // Return the maximum distance as the sensitivity estimate
  // Add a 10% safety margin for inputs not covered by calibration samples
  return maxDistance * 1.1;
}

/**
 * Resolve sensitivity from a DPEmbeddingConfig.
 *
 * Priority:
 * 1. Explicit numeric value
 * 2. Model ID lookup
 * 3. Default (2.0 for normalized models)
 *
 * @param sensitivity - Configured sensitivity value or 'auto'
 * @param modelId - Optional model ID for lookup
 * @returns Resolved numeric sensitivity
 */
export function resolveSensitivity(
  sensitivity: number | 'auto' | undefined,
  modelId?: string
): number {
  // Explicit numeric value takes highest priority
  if (typeof sensitivity === 'number') {
    return sensitivity;
  }

  // 'auto' or undefined: use lookup or default
  return getSensitivity(modelId);
}
