/**
 * @file use-ocr.ts
 * @description Thin wrapper around useExtractText from @localmode/react
 */
'use client';

import { useState } from 'react';
import { useExtractText, toAppError, readFileAsDataUrl, validateFile } from '@localmode/react';
import { getOCRModel } from '../_services/ocr.service';
import { ACCEPTED_IMAGE_TYPES, MAX_FILE_SIZE } from '../_lib/constants';
import type { AppError } from '../_lib/types';

export function useOCR() {
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<AppError | null>(null);
  const { data, isLoading, error: hookError, execute, reset: resetOp } = useExtractText({ model: getOCRModel() });

  const processFile = async (file: File) => {
    const validationErr = validateFile({ file, accept: ACCEPTED_IMAGE_TYPES, maxSize: MAX_FILE_SIZE });
    if (validationErr) { setValidationError(validationErr); return; }
    setValidationError(null);
    const dataUrl = await readFileAsDataUrl(file);
    setImageDataUrl(dataUrl);
    await execute(dataUrl);
  };

  const error = validationError ?? toAppError(hookError);

  const reset = () => { setImageDataUrl(null); setValidationError(null); resetOp(); };
  const clearError = () => { setValidationError(null); if (hookError) resetOp(); };

  return { imageDataUrl, extractedText: data?.text ?? '', isProcessing: isLoading, error, processFile, clearError, reset };
}
