/**
 * @file use-captioner.ts
 * @description Hook for image captioning using useOperationList from @localmode/react
 */
'use client';

import { useState } from 'react';
import { useOperationList, toAppError, readFileAsDataUrl, validateFile } from '@localmode/react';
import type { CaptionImageResult } from '@localmode/core';
import { getCaptionerModel } from '../_services/captioner.service';
import { ACCEPTED_IMAGE_TYPES, MAX_FILE_SIZE } from '../_lib/constants';
import type { CaptionedImage, AppError } from '../_lib/types';

/** Hook for image captioning */
export function useCaptioner() {
  const [validationError, setValidationError] = useState<AppError | null>(null);

  const { items, isLoading, error: hookError, execute, cancel, reset: resetOp, clearItems, removeItem } = useOperationList<
    [{ image: string; fileName: string }], CaptionImageResult, CaptionedImage
  >({
    fn: async (input: { image: string; fileName: string }, signal: AbortSignal) => {
      const { captionImage } = await import('@localmode/core');
      return captionImage({ model: getCaptionerModel(), image: input.image, abortSignal: signal });
    },
    transform: (result, input) => ({
      id: crypto.randomUUID(),
      dataUrl: input.image,
      caption: result.caption,
      fileName: input.fileName,
    }),
  });

  const captionFile = async (file: File) => {
    const validationErr = validateFile({ file, accept: ACCEPTED_IMAGE_TYPES, maxSize: MAX_FILE_SIZE });
    if (validationErr) { setValidationError(validationErr); return; }
    setValidationError(null);
    const dataUrl = await readFileAsDataUrl(file);
    await execute({ image: dataUrl, fileName: file.name });
  };

  const images = items;
  const error = validationError ?? toAppError(hookError);
  const removeImage = (id: string) => removeItem((img) => img.id === id);
  const clearAll = () => { clearItems(); };
  const clearError = () => { setValidationError(null); if (hookError) resetOp(); };

  return { images, isProcessing: isLoading, error, captionFile, cancel, removeImage, clearAll, clearError };
}
