/**
 * OCR Domain Types
 *
 * Types and interfaces for optical character recognition.
 *
 * @packageDocumentation
 */

import type { ImageInput } from '../vision/types.js';

// ═══════════════════════════════════════════════════════════════
// COMMON TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Usage information for OCR.
 */
export interface OCRUsage {
  /** Time spent on processing (milliseconds) */
  durationMs: number;
}

/**
 * Response metadata for OCR.
 */
export interface OCRResponse {
  /** Optional request ID */
  id?: string;

  /** Model ID used */
  modelId: string;

  /** Timestamp of the response */
  timestamp: Date;
}

/**
 * A text region detected in an image.
 */
export interface TextRegion {
  /** The extracted text */
  text: string;

  /** Confidence score (0-1) */
  confidence: number;

  /** Bounding box (x, y, width, height) */
  bbox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  /** Individual words/characters with positions */
  words?: Array<{
    text: string;
    confidence: number;
    bbox?: { x: number; y: number; width: number; height: number };
  }>;
}

// ═══════════════════════════════════════════════════════════════
// OCR MODEL INTERFACE
// ═══════════════════════════════════════════════════════════════

/**
 * Interface for OCR models.
 *
 * Providers implement this interface to enable text extraction from images.
 */
export interface OCRModel {
  /** Unique identifier for this model */
  readonly modelId: string;

  /** Provider name */
  readonly provider: string;

  /** Supported languages */
  readonly supportedLanguages?: string[];

  /**
   * Extract text from images.
   *
   * @param options - OCR options
   * @returns Promise with OCR result
   */
  doOCR(options: DoOCROptions): Promise<DoOCRResult>;
}

/**
 * Options passed to OCRModel.doOCR()
 */
export interface DoOCROptions {
  /** Images to process */
  images: ImageInput[];

  /** Language hint(s) */
  languages?: string[];

  /** Whether to detect text regions */
  detectRegions?: boolean;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from OCRModel.doOCR()
 */
export interface DoOCRResult {
  /** Extracted text from each image */
  texts: string[];

  /** Text regions (if detectRegions was true) */
  regions?: TextRegion[][];

  /** Usage information */
  usage: OCRUsage;
}

// ═══════════════════════════════════════════════════════════════
// EXTRACT TEXT FUNCTION OPTIONS & RESULTS
// ═══════════════════════════════════════════════════════════════

/**
 * Options for the extractText() function.
 *
 * @example
 * ```ts
 * const { text } = await extractText({
 *   model: transformers.ocr('Xenova/trocr-base-handwritten'),
 *   image: imageBlob,
 * });
 * ```
 */
export interface ExtractTextOptions {
  /** The OCR model to use */
  model: OCRModel | string;

  /** Image to extract text from */
  image: ImageInput;

  /** Language hint(s) */
  languages?: string[];

  /** Whether to detect text regions (default: false) */
  detectRegions?: boolean;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Maximum retry attempts (default: 2) */
  maxRetries?: number;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from the extractText() function.
 */
export interface ExtractTextResult {
  /** Extracted text */
  text: string;

  /** Detected text regions (if detectRegions was true) */
  regions?: TextRegion[];

  /** Usage information */
  usage: OCRUsage;

  /** Response metadata */
  response: OCRResponse;
}

/**
 * Options for the extractTextMany() function.
 */
export interface ExtractTextManyOptions {
  /** The OCR model to use */
  model: OCRModel | string;

  /** Images to extract text from */
  images: ImageInput[];

  /** Language hint(s) */
  languages?: string[];

  /** Whether to detect text regions (default: false) */
  detectRegions?: boolean;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Maximum retry attempts (default: 2) */
  maxRetries?: number;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from the extractTextMany() function.
 */
export interface ExtractTextManyResult {
  /** Extracted texts from each image */
  texts: string[];

  /** Detected text regions per image (if detectRegions was true) */
  regions?: TextRegion[][];

  /** Usage information */
  usage: OCRUsage;

  /** Response metadata */
  response: OCRResponse;
}

// ═══════════════════════════════════════════════════════════════
// PROVIDER FACTORY TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Factory function type for creating OCR models.
 */
export type OCRModelFactory = (modelId: string, settings?: Record<string, unknown>) => OCRModel;

