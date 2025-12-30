/**
 * OCR Domain
 *
 * Functions and types for optical character recognition.
 *
 * @packageDocumentation
 */

// ═══════════════════════════════════════════════════════════════
// FUNCTIONS
// ═══════════════════════════════════════════════════════════════

export { extractText, extractTextMany, setGlobalOCRProvider } from './extract-text.js';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type {
  // Common types
  OCRUsage,
  OCRResponse,
  TextRegion,
  // Model interface
  OCRModel,
  DoOCROptions,
  DoOCRResult,
  // extractText() types
  ExtractTextOptions,
  ExtractTextResult,
  // extractTextMany() types
  ExtractTextManyOptions,
  ExtractTextManyResult,
  // Factory types
  OCRModelFactory,
} from './types.js';

