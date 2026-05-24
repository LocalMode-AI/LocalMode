/**
 * @file use-extract-text.ts
 * @description Hook for OCR text extraction with @localmode/core extractText()
 */

import type { OCRModel, ExtractTextResult } from '@localmode/core';
import { useOperation } from '../core/use-operation.js';

/** Options for the useExtractText hook */
interface UseExtractTextOptions {
  /** The OCR model to use */
  model: OCRModel;
  /** Text prompt for generative OCR models (e.g., 'Table Recognition:') */
  prompt?: string;
}

/**
 * Hook for OCR text extraction from images.
 *
 * @param options - OCR model configuration
 * @returns Operation state with execute(image: string) function (image as data URL)
 */
export function useExtractText(options: UseExtractTextOptions) {
  const { model, prompt } = options;

  return useOperation<[string], ExtractTextResult>({
    fn: async (image: string, signal: AbortSignal) => {
      const { extractText } = await import('@localmode/core');
      return extractText({ model, image, prompt, abortSignal: signal });
    },
  });
}
