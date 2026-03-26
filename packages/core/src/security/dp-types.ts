/**
 * Differential Privacy Types
 *
 * Type definitions for differential privacy mechanisms applied to
 * embeddings and classification outputs.
 *
 * @packageDocumentation
 */

// ============================================================================
// DP Embedding Configuration
// ============================================================================

/**
 * Configuration for differential privacy on embeddings.
 *
 * Controls the noise mechanism, privacy parameter epsilon, and sensitivity
 * calibration for adding calibrated noise to embedding vectors.
 *
 * @example
 * ```ts
 * import { dpEmbeddingMiddleware } from '@localmode/core';
 *
 * const middleware = dpEmbeddingMiddleware({
 *   epsilon: 1.0,
 *   delta: 1e-5,
 *   mechanism: 'gaussian',
 * });
 * ```
 */
export interface DPEmbeddingConfig {
  /**
   * Privacy parameter epsilon (privacy budget per query).
   * Lower epsilon = more privacy, more noise.
   * Typical values: 0.1 (strong privacy) to 10.0 (weak privacy).
   */
  epsilon: number;

  /**
   * Privacy parameter delta (probability of privacy failure).
   * Only used with Gaussian mechanism.
   * Must be less than 1/n where n is the dataset size.
   * Default: 1e-5.
   */
  delta?: number;

  /**
   * L2 sensitivity of the embedding function.
   * For normalized embeddings (unit norm), the maximum change
   * in output when one input changes is 2.0.
   * Set to 'auto' to use model-specific lookup or runtime calibration.
   * Default: 'auto'.
   */
  sensitivity?: number | 'auto';

  /**
   * Model ID for sensitivity lookup.
   * Used when sensitivity is 'auto' to look up known model sensitivities.
   */
  modelId?: string;

  /**
   * Noise mechanism to use.
   * - 'gaussian': Gaussian (normal) noise, requires delta parameter
   * - 'laplacian': Laplacian noise, pure epsilon-DP (no delta needed)
   * Default: 'gaussian'.
   */
  mechanism?: 'gaussian' | 'laplacian';
}

// ============================================================================
// DP Classification Configuration
// ============================================================================

/**
 * Configuration for differential privacy on classification outputs.
 *
 * Uses randomized response to provide plausible deniability for
 * classification results.
 *
 * @example
 * ```ts
 * import { dpClassificationMiddleware } from '@localmode/core';
 *
 * const middleware = dpClassificationMiddleware({
 *   epsilon: 2.0,
 *   labels: ['positive', 'negative', 'neutral'],
 * });
 * ```
 */
export interface DPClassificationConfig {
  /**
   * Privacy parameter epsilon.
   * Higher epsilon = less randomization, more accurate results.
   * Typical values: 1.0 to 5.0.
   */
  epsilon: number;

  /**
   * All possible labels for randomized response.
   * Must include every label the model can output.
   */
  labels: string[];
}

// ============================================================================
// Privacy Budget
// ============================================================================

/**
 * Configuration for privacy budget tracking.
 *
 * Tracks cumulative epsilon across operations to enforce
 * a total privacy budget.
 *
 * @example
 * ```ts
 * import { createPrivacyBudget } from '@localmode/core';
 *
 * const budget = await createPrivacyBudget({
 *   maxEpsilon: 10.0,
 *   persistKey: 'my-app-budget',
 *   onExhausted: 'block',
 * });
 * ```
 */
export interface PrivacyBudgetConfig {
  /**
   * Maximum cumulative epsilon allowed.
   * Once exceeded, behavior depends on onExhausted policy.
   */
  maxEpsilon: number;

  /**
   * Optional collection ID to scope the budget.
   * Different collections can have independent budgets.
   */
  collectionId?: string;

  /**
   * IndexedDB key for persisting budget state across sessions.
   * If omitted, budget is tracked in memory only.
   */
  persistKey?: string;

  /**
   * Policy when budget is exhausted.
   * - 'warn': Log a warning and continue (default)
   * - 'block': Throw PrivacyBudgetExhaustedError
   */
  onExhausted?: 'warn' | 'block';
}

/**
 * Privacy budget tracker.
 *
 * Tracks cumulative privacy loss (epsilon) across operations
 * and enforces a maximum budget.
 */
export interface PrivacyBudget {
  /**
   * Consume epsilon from the budget.
   * Throws PrivacyBudgetExhaustedError if policy is 'block' and budget is exceeded.
   *
   * @param epsilon - Amount of epsilon to consume
   */
  consume(epsilon: number): void;

  /**
   * Get the remaining epsilon budget.
   *
   * @returns Remaining epsilon (may be negative if 'warn' policy allows overshoot)
   */
  remaining(): number;

  /**
   * Check if the budget is exhausted.
   *
   * @returns true if consumed epsilon >= maxEpsilon
   */
  isExhausted(): boolean;

  /**
   * Get the total epsilon consumed so far.
   *
   * @returns Cumulative epsilon consumed
   */
  consumed(): number;

  /**
   * Reset the budget to zero consumption.
   */
  reset(): void;

  /**
   * Persist current state and clean up resources.
   */
  destroy(): Promise<void>;
}
