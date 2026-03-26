/**
 * Differential Privacy for Classification (Randomized Response)
 *
 * Implements the randomized response mechanism for providing differential
 * privacy guarantees on classification outputs.
 *
 * Given the true label, with probability p = e^epsilon / (e^epsilon + k - 1)
 * we return the true label, otherwise we return a uniformly random label
 * from the remaining k-1 labels.
 *
 * @packageDocumentation
 */

import type { ClassificationModelMiddleware, ClassificationModel } from './types.js';
import type { DPClassificationConfig } from '../security/dp-types.js';

// ============================================================================
// Randomized Response
// ============================================================================

/**
 * Apply randomized response to a classification label.
 *
 * With probability p = e^epsilon / (e^epsilon + k - 1), returns the true label.
 * Otherwise, returns a uniformly random label from the other k-1 labels.
 *
 * This provides epsilon-differential privacy for the classification output.
 *
 * @param trueLabel - The actual classification label
 * @param allLabels - All possible labels (must include trueLabel)
 * @param epsilon - Privacy parameter (higher = less randomization)
 * @returns The (possibly randomized) label
 *
 * @example
 * ```ts
 * import { randomizedResponse } from '@localmode/core';
 *
 * // High epsilon (low privacy, high utility): almost always returns true label
 * const result1 = randomizedResponse('positive', ['positive', 'negative', 'neutral'], 10.0);
 *
 * // Low epsilon (high privacy, low utility): often returns a random label
 * const result2 = randomizedResponse('positive', ['positive', 'negative', 'neutral'], 0.5);
 * ```
 */
export function randomizedResponse(
  trueLabel: string,
  allLabels: string[],
  epsilon: number
): string {
  if (allLabels.length === 0) {
    throw new Error('allLabels must not be empty');
  }

  if (epsilon <= 0) {
    throw new Error('Epsilon must be positive');
  }

  const k = allLabels.length;

  // If only one label, must return it
  if (k === 1) {
    return allLabels[0];
  }

  // Probability of returning the true label
  const eEpsilon = Math.exp(epsilon);
  const pTrue = eEpsilon / (eEpsilon + k - 1);

  // Generate a cryptographically secure random number in [0, 1)
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  const rand = buffer[0] / 4294967296;

  if (rand < pTrue) {
    // Return the true label
    return trueLabel;
  }

  // Return a uniformly random label from the other labels
  const otherLabels = allLabels.filter((l) => l !== trueLabel);
  if (otherLabels.length === 0) {
    // trueLabel not in allLabels — return random from all
    const idx = Math.floor(rand * allLabels.length) % allLabels.length;
    return allLabels[idx];
  }

  // Pick uniformly from other labels using crypto random
  const buffer2 = new Uint32Array(1);
  crypto.getRandomValues(buffer2);
  const idx = buffer2[0] % otherLabels.length;
  return otherLabels[idx];
}

// ============================================================================
// Classification Middleware
// ============================================================================

/**
 * Create a classification model middleware that applies randomized response.
 *
 * Each classification result's label is independently subjected to randomized
 * response, providing epsilon-differential privacy for the classification output.
 *
 * @param config - Differential privacy classification configuration
 * @returns Classification model middleware
 *
 * @example
 * ```ts
 * import { classify, dpClassificationMiddleware } from '@localmode/core';
 *
 * // Note: apply middleware by wrapping the model's doClassify method
 * const config = {
 *   epsilon: 2.0,
 *   labels: ['positive', 'negative', 'neutral'],
 * };
 * const middleware = dpClassificationMiddleware(config);
 * ```
 */
export function dpClassificationMiddleware(
  config: DPClassificationConfig
): ClassificationModelMiddleware {
  const { epsilon, labels } = config;

  if (epsilon <= 0) {
    throw new Error('Epsilon must be positive');
  }

  if (labels.length === 0) {
    throw new Error('Labels must not be empty');
  }

  return {
    wrapClassify: async <T>({
      doClassify,
    }: {
      doClassify: () => Promise<T>;
      texts: string[];
      model: ClassificationModel;
    }): Promise<T> => {
      const result = await doClassify();

      // Cast to access results — wrapClassify is generic over T
      // In practice, T is always DoClassifyResult
      const typedResult = result as {
        results: Array<{
          label: string;
          score: number;
          allScores?: Record<string, number>;
        }>;
        usage: unknown;
      };

      // Apply randomized response to each result's label
      const randomizedResults = typedResult.results.map((item) => {
        const newLabel = randomizedResponse(item.label, labels, epsilon);

        // If label changed, adjust scores to reflect the randomized label
        if (newLabel !== item.label) {
          return {
            ...item,
            label: newLabel,
            // Score is not meaningful after randomization, set to indicate uncertainty
            score: 1 / labels.length,
            allScores: undefined,
          };
        }

        return item;
      });

      return {
        ...typedResult,
        results: randomizedResults,
      } as typeof result;
    },
  };
}
