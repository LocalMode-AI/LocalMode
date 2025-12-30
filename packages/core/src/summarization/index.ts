/**
 * Summarization Domain
 *
 * Functions and types for text summarization.
 *
 * @packageDocumentation
 */

// ═══════════════════════════════════════════════════════════════
// FUNCTIONS
// ═══════════════════════════════════════════════════════════════

export { summarize, summarizeMany, setGlobalSummarizationProvider } from './summarize.js';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type {
  // Common types
  SummarizationUsage,
  SummarizationResponse,
  // Model interface
  SummarizationModel,
  DoSummarizeOptions,
  DoSummarizeResult,
  // summarize() types
  SummarizeOptions,
  SummarizeResult,
  // summarizeMany() types
  SummarizeManyOptions,
  SummarizeManyResult,
  // Factory types
  SummarizationModelFactory,
} from './types.js';

