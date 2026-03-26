/**
 * Similarity Threshold Calibration
 *
 * Empirically determines an optimal similarity threshold from a corpus sample.
 * Embeds corpus texts, computes pairwise similarity scores, and returns a
 * threshold at a configurable percentile of the distribution.
 *
 * @packageDocumentation
 */

import type {
  CalibrateThresholdOptions,
  ThresholdCalibration,
  ThresholdDistributionStats,
} from './types.js';
import { embedMany } from './embed.js';
import { cosineSimilarity, euclideanDistance, dotProduct } from '../hnsw/distance.js';
import { ValidationError } from '../errors/index.js';

// ═══════════════════════════════════════════════════════════════
// CALIBRATE THRESHOLD
// ═══════════════════════════════════════════════════════════════

/**
 * Compute an optimal similarity threshold from a corpus of text samples.
 *
 * Embeds the corpus (or a uniformly-spaced subset), computes all pairwise
 * similarity scores, and returns the score at the requested percentile.
 * The result includes full distribution statistics for observability.
 *
 * @param options - Calibration options
 * @returns Promise with the computed threshold and distribution statistics
 *
 * @example Basic usage with cosine similarity
 * ```ts
 * import { calibrateThreshold } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * const model = transformers.embedding('Xenova/bge-small-en-v1.5');
 * const corpus = ['cat facts', 'dog breeds', 'car specs', 'truck models'];
 *
 * const { threshold, distribution } = await calibrateThreshold({
 *   model,
 *   corpus,
 *   percentile: 90,
 * });
 *
 * // Use the calibrated threshold for search
 * const results = await db.search(queryVector, { threshold });
 * ```
 *
 * @example With custom percentile and maxSamples
 * ```ts
 * const calibration = await calibrateThreshold({
 *   model,
 *   corpus: largeCorpus,
 *   percentile: 80,    // More permissive threshold
 *   maxSamples: 100,   // Cap computation at 100 samples
 * });
 * ```
 *
 * @example With AbortSignal
 * ```ts
 * const controller = new AbortController();
 * setTimeout(() => controller.abort(), 10000);
 *
 * const calibration = await calibrateThreshold({
 *   model,
 *   corpus,
 *   abortSignal: controller.signal,
 * });
 * ```
 *
 * @throws {ValidationError} If corpus has fewer than 2 samples
 * @throws {ValidationError} If percentile is not between 0 and 100
 * @throws {Error} If aborted via AbortSignal
 *
 * @see {@link getDefaultThreshold} for instant preset lookup without calibration
 * @see {@link MODEL_THRESHOLD_PRESETS} for known-good default thresholds
 * @see {@link embedMany} for the underlying embedding function
 */
export async function calibrateThreshold(
  options: CalibrateThresholdOptions
): Promise<ThresholdCalibration> {
  const {
    model: modelOrId,
    corpus,
    percentile = 90,
    distanceFunction = 'cosine',
    maxSamples = 200,
    abortSignal,
  } = options;

  // ── Input validation ──────────────────────────────────────────
  if (!corpus || corpus.length < 2) {
    throw new ValidationError(
      `Corpus must contain at least 2 samples, got ${corpus?.length ?? 0}`,
      'Provide an array of at least 2 text strings for threshold calibration.'
    );
  }

  if (percentile < 0 || percentile > 100) {
    throw new ValidationError(
      `Percentile must be between 0 and 100, got ${percentile}`,
      'Use a value between 0 (minimum score) and 100 (maximum score). Common values: 80 (permissive), 90 (balanced), 95 (strict).'
    );
  }

  // Check for cancellation before starting
  abortSignal?.throwIfAborted();

  // ── Corpus sampling ───────────────────────────────────────────
  const samples = selectSamples(corpus, maxSamples);
  const sampleSize = samples.length;

  // ── Embed the corpus ──────────────────────────────────────────
  const { embeddings } = await embedMany({
    model: modelOrId,
    values: samples,
    abortSignal,
  });

  // Resolve the model ID for the result
  const modelId = typeof modelOrId === 'string' ? modelOrId : modelOrId.modelId;

  // Check for cancellation after embedding
  abortSignal?.throwIfAborted();

  // ── Compute pairwise similarity scores ────────────────────────
  const scoreFn = getSimilarityFunction(distanceFunction);
  const scores = computePairwiseScores(embeddings, scoreFn, abortSignal);

  // ── Sort ascending for percentile selection ───────────────────
  scores.sort((a, b) => a - b);

  // ── Compute statistics ────────────────────────────────────────
  const distribution = computeDistributionStats(scores);

  // ── Select threshold at percentile (nearest-rank method) ──────
  const threshold = selectPercentile(scores, percentile);

  return {
    threshold,
    percentile,
    sampleSize,
    modelId,
    distanceFunction,
    distribution,
  };
}

// ═══════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Select uniformly-spaced samples from the corpus when it exceeds maxSamples.
 * Returns all samples if the corpus is within the limit.
 */
function selectSamples(corpus: string[], maxSamples: number): string[] {
  if (corpus.length <= maxSamples) {
    return corpus;
  }

  const samples: string[] = [];
  const step = corpus.length / maxSamples;

  for (let i = 0; i < maxSamples; i++) {
    const index = Math.floor(i * step);
    samples.push(corpus[index]);
  }

  return samples;
}

/**
 * Get the appropriate similarity scoring function for the distance type.
 * Returns a function that computes a similarity score (higher = more similar).
 */
function getSimilarityFunction(
  distanceFunction: 'cosine' | 'euclidean' | 'dot'
): (a: Float32Array, b: Float32Array) => number {
  switch (distanceFunction) {
    case 'cosine':
      return cosineSimilarity;
    case 'euclidean':
      return (a, b) => 1 / (1 + euclideanDistance(a, b));
    case 'dot':
      return dotProduct;
    default:
      return cosineSimilarity;
  }
}

/**
 * Compute all pairwise similarity scores between embeddings.
 * O(n^2) but capped by maxSamples. Checks AbortSignal periodically.
 */
function computePairwiseScores(
  embeddings: Float32Array[],
  scoreFn: (a: Float32Array, b: Float32Array) => number,
  abortSignal?: AbortSignal
): number[] {
  const n = embeddings.length;
  const expectedPairs = (n * (n - 1)) / 2;
  const scores: number[] = new Array(expectedPairs);
  let idx = 0;

  // Check abort signal every ~1000 pairs for responsiveness
  const CHECK_INTERVAL = 1000;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      scores[idx++] = scoreFn(embeddings[i], embeddings[j]);

      if (idx % CHECK_INTERVAL === 0) {
        abortSignal?.throwIfAborted();
      }
    }
  }

  return scores;
}

/**
 * Compute distribution statistics for an array of sorted scores.
 */
function computeDistributionStats(sortedScores: number[]): ThresholdDistributionStats {
  const count = sortedScores.length;

  if (count === 0) {
    return { mean: 0, median: 0, stdDev: 0, min: 0, max: 0, count: 0 };
  }

  // Min and max from sorted array
  const min = sortedScores[0];
  const max = sortedScores[count - 1];

  // Mean
  let sum = 0;
  for (let i = 0; i < count; i++) {
    sum += sortedScores[i];
  }
  const mean = sum / count;

  // Median
  let median: number;
  if (count % 2 === 1) {
    median = sortedScores[Math.floor(count / 2)];
  } else {
    const mid = count / 2;
    median = (sortedScores[mid - 1] + sortedScores[mid]) / 2;
  }

  // Population standard deviation
  let sumSquaredDev = 0;
  for (let i = 0; i < count; i++) {
    const dev = sortedScores[i] - mean;
    sumSquaredDev += dev * dev;
  }
  const stdDev = Math.sqrt(sumSquaredDev / count);

  return { mean, median, stdDev, min, max, count };
}

/**
 * Select the value at the given percentile using the nearest-rank method.
 * index = ceil(percentile / 100 * count) - 1, clamped to [0, count - 1].
 */
function selectPercentile(sortedScores: number[], percentile: number): number {
  const count = sortedScores.length;

  if (percentile === 0) {
    return sortedScores[0];
  }

  const index = Math.min(
    Math.max(Math.ceil((percentile / 100) * count) - 1, 0),
    count - 1
  );

  return sortedScores[index];
}
