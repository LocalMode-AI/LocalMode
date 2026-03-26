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
}

/**
 * Hook for OCR text extraction from images.
 *
 * @param options - OCR model configuration
 * @returns Operation state with execute(image: string) function (image as data URL)
 */
export function useExtractText(options: UseExtractTextOptions) {
  const { model } = options;

  return useOperation<[string], ExtractTextResult>({
    fn: async (image: string, signal: AbortSignal) => {
      const { extractText } = await import('@localmode/core');
      return extractText({ model, image, abortSignal: signal });
    },
  });
}
