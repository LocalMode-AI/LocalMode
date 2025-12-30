/**
 * Fill-Mask Domain
 *
 * Functions and types for masked language modeling.
 *
 * @packageDocumentation
 */

// ═══════════════════════════════════════════════════════════════
// FUNCTIONS
// ═══════════════════════════════════════════════════════════════

export { fillMask, fillMaskMany, setGlobalFillMaskProvider } from './fill-mask.js';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type {
  // Common types
  FillMaskUsage,
  FillMaskResponse,
  FillMaskPrediction,
  // Model interface
  FillMaskModel,
  DoFillMaskOptions,
  DoFillMaskResult,
  // fillMask() types
  FillMaskOptions,
  FillMaskResult,
  // fillMaskMany() types
  FillMaskManyOptions,
  FillMaskManyResult,
  // Factory types
  FillMaskModelFactory,
} from './types.js';

