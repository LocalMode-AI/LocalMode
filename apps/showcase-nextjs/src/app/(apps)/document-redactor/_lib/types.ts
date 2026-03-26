/**
 * @file types.ts
 * @description Type definitions for the document redactor application
 */

/** Detected named entity from NER model */
export interface DetectedEntity {
  /** The entity text */
  text: string;
  /** Entity label (PER, LOC, ORG, MISC) */
  label: string;
  /** Start character index in original text */
  start: number;
  /** End character index in original text */
  end: number;
  /** Confidence score */
  score: number;
}

/** Application error type */
export interface AppError {
  /** Error message */
  message: string;
  /** Error code */
  code?: string;
  /** Whether the error is recoverable */
  recoverable?: boolean;
}

// ============================================================================
// Differential Privacy Types
// ============================================================================

/** Differential privacy configuration for the embedding step */
export interface DPConfig {
  /** Whether DP is enabled */
  enabled: boolean;
  /** Privacy parameter epsilon (lower = more privacy) */
  epsilon: number;
}

/** Result of a DP-protected embedding operation */
export interface DPEmbeddingResult {
  /** Dimensionality of the embedding vector */
  dimensions: number;
  /** Epsilon value used for this embedding */
  epsilonUsed: number;
  /** Timestamp of when the embedding was created */
  timestamp: Date;
}

/** Current state of the privacy budget */
export interface PrivacyBudgetState {
  /** Total epsilon consumed so far */
  consumed: number;
  /** Remaining epsilon budget */
  remaining: number;
  /** Maximum epsilon allowed */
  maxEpsilon: number;
  /** Whether the budget is fully exhausted */
  isExhausted: boolean;
  /** Whether the budget is running low (< 20% remaining) */
  isLow: boolean;
}

/** Human-readable privacy level derived from epsilon */
export interface PrivacyLevel {
  /** Display label */
  label: string;
  /** Tailwind color class */
  color: string;
}
