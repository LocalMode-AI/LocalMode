/**
 * Differential Privacy Embedding Middleware
 *
 * Adds calibrated noise to embedding vectors to provide differential privacy
 * guarantees. Follows the same middleware pattern as piiRedactionMiddleware.
 *
 * @packageDocumentation
 */

import type { EmbeddingModelMiddleware } from '../embeddings/types.js';
import type { DPEmbeddingConfig } from './dp-types.js';
import type { PrivacyBudget } from './dp-types.js';
import { gaussianNoise, laplacianNoise, addNoise } from './dp-noise.js';
import { resolveSensitivity } from './dp-sensitivity.js';

// ============================================================================
// Sigma / Scale Computation
// ============================================================================

/**
 * Compute the Gaussian noise standard deviation (sigma) for (epsilon, delta)-DP.
 *
 * Uses the analytic Gaussian mechanism:
 * sigma = (sensitivity * sqrt(2 * ln(1.25 / delta))) / epsilon
 *
 * @param sensitivity - L2 sensitivity of the function
 * @param epsilon - Privacy parameter
 * @param delta - Probability of privacy failure
 * @returns Standard deviation for Gaussian noise
 */
export function computeGaussianSigma(
  sensitivity: number,
  epsilon: number,
  delta: number
): number {
  return (sensitivity * Math.sqrt(2 * Math.log(1.25 / delta))) / epsilon;
}

/**
 * Compute the Laplacian noise scale for pure epsilon-DP.
 *
 * scale = sensitivity / epsilon
 *
 * @param sensitivity - L2 sensitivity of the function
 * @param epsilon - Privacy parameter
 * @returns Scale parameter for Laplacian noise
 */
export function computeLaplacianScale(sensitivity: number, epsilon: number): number {
  return sensitivity / epsilon;
}

// ============================================================================
// DP Embedding Middleware
// ============================================================================

/**
 * Create an embedding model middleware that adds differential privacy noise.
 *
 * Intercepts embedding outputs and adds calibrated noise (Gaussian or Laplacian)
 * to provide mathematical privacy guarantees. The noise is calibrated based on
 * the privacy parameters (epsilon, delta) and the sensitivity of the embedding
 * function.
 *
 * @param config - Differential privacy configuration
 * @param budget - Optional privacy budget tracker (epsilon is consumed per call)
 * @returns Embedding model middleware
 *
 * @example Basic usage
 * ```ts
 * import { embed, wrapEmbeddingModel, dpEmbeddingMiddleware } from '@localmode/core';
 *
 * const privateModel = wrapEmbeddingModel({
 *   model: transformers.embedding('Xenova/all-MiniLM-L6-v2'),
 *   middleware: dpEmbeddingMiddleware({
 *     epsilon: 1.0,
 *     delta: 1e-5,
 *     mechanism: 'gaussian',
 *   }),
 * });
 *
 * // Embeddings now have calibrated noise added
 * const { embedding } = await embed({ model: privateModel, value: 'sensitive text' });
 * ```
 *
 * @example With privacy budget
 * ```ts
 * const budget = await createPrivacyBudget({ maxEpsilon: 10.0, onExhausted: 'block' });
 *
 * const privateModel = wrapEmbeddingModel({
 *   model: baseModel,
 *   middleware: dpEmbeddingMiddleware({ epsilon: 1.0 }, budget),
 * });
 *
 * // Each embed call consumes epsilon from the budget
 * await embed({ model: privateModel, value: 'text' }); // budget: 9.0 remaining
 * ```
 *
 * @see {@link piiRedactionMiddleware} for PII-based protection (complementary)
 * @see {@link createPrivacyBudget} for budget tracking
 */
export function dpEmbeddingMiddleware(
  config: DPEmbeddingConfig,
  budget?: PrivacyBudget
): EmbeddingModelMiddleware {
  const {
    epsilon,
    delta = 1e-5,
    sensitivity: sensitivityConfig = 'auto',
    modelId,
    mechanism = 'gaussian',
  } = config;

  // Validate epsilon
  if (epsilon <= 0) {
    throw new Error('Epsilon must be positive');
  }

  // Validate delta for Gaussian mechanism
  if (mechanism === 'gaussian' && delta <= 0) {
    throw new Error('Delta must be positive for Gaussian mechanism');
  }

  return {
    wrapEmbed: async ({ doEmbed, model }) => {
      // Consume budget if tracked
      if (budget) {
        budget.consume(epsilon);
      }

      // Call the underlying model
      const result = await doEmbed();

      // Cast to access embeddings — wrapEmbed is generic over T
      // In practice, T is always DoEmbedResult
      const typedResult = result as {
        embeddings: Float32Array[];
        usage: unknown;
        response: unknown;
      };

      // Resolve sensitivity using model ID from the actual model if not configured
      const effectiveModelId = modelId ?? model.modelId;
      const effectiveSensitivity =
        typeof sensitivityConfig === 'number'
          ? sensitivityConfig
          : resolveSensitivity('auto', effectiveModelId);

      // Compute noise parameters
      let noisyEmbeddings: Float32Array[];

      if (mechanism === 'gaussian') {
        const sigma = computeGaussianSigma(effectiveSensitivity, epsilon, delta);
        noisyEmbeddings = typedResult.embeddings.map((emb) => {
          const noise = gaussianNoise(emb.length, sigma);
          return addNoise(emb, noise);
        });
      } else {
        const scale = computeLaplacianScale(effectiveSensitivity, epsilon);
        noisyEmbeddings = typedResult.embeddings.map((emb) => {
          const noise = laplacianNoise(emb.length, scale);
          return addNoise(emb, noise);
        });
      }

      return {
        ...typedResult,
        embeddings: noisyEmbeddings,
      } as typeof result;
    },
  };
}
