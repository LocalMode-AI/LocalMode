/**
 * @file constants.ts
 * @description Constants for the document redactor application
 */

/** NER model identifier */
export const MODEL_ID = 'Xenova/bert-base-NER';

/** Approximate model download size */
export const MODEL_SIZE = '~110MB';

/** Color classes for each entity type */
export const ENTITY_COLORS: Record<string, string> = {
  PER: 'bg-poster-accent-pink/20 text-poster-accent-pink border-poster-accent-pink/30',
  LOC: 'bg-poster-accent-teal/20 text-poster-accent-teal border-poster-accent-teal/30',
  ORG: 'bg-poster-accent-purple/20 text-poster-accent-purple border-poster-accent-purple/30',
  MISC: 'bg-poster-accent-orange/20 text-poster-accent-orange border-poster-accent-orange/30',
};

/** Human-readable labels for each entity type */
export const ENTITY_LABELS: Record<string, string> = {
  PER: 'Person',
  LOC: 'Location',
  ORG: 'Organization',
  MISC: 'Miscellaneous',
};

/** Sample text with various PII for demonstration */
export const SAMPLE_TEXT = `John Smith met with Dr. Sarah Johnson at the Microsoft headquarters in Seattle, Washington on March 15th. They discussed the upcoming partnership with Google and the European Union regulations. Contact John at john.smith@example.com or call +1-555-0123. His social security number is 123-45-6789.`;

// ============================================================================
// Differential Privacy Constants
// ============================================================================

/** Embedding model identifier for DP demonstration */
export const EMBEDDING_MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

/** Approximate embedding model download size */
export const EMBEDDING_MODEL_SIZE = '~23MB';

/** Default epsilon value */
export const DEFAULT_EPSILON = 1.0;

/** Minimum epsilon value */
export const MIN_EPSILON = 0.5;

/** Maximum epsilon value */
export const MAX_EPSILON = 10.0;

/** Epsilon slider step size */
export const EPSILON_STEP = 0.5;

/** Maximum total epsilon for privacy budget */
export const MAX_BUDGET_EPSILON = 10.0;

/** Threshold below which the budget is considered low (as fraction of max) */
export const LOW_BUDGET_THRESHOLD = 0.2;
