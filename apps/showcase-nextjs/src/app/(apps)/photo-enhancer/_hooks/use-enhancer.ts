/**
 * @file use-enhancer.ts
 * @description Thin wrapper around useImageToImage from @localmode/react
 */
'use client';
import { useState, useEffect } from 'react';
import { useImageToImage, toAppError, readFileAsDataUrl, validateFile, downloadBlob } from '@localmode/react';
import { createImageToImageModel } from '../_services/enhancer.service';
import { imageResultToDataUrl } from '../_lib/utils';
import { ACCEPTED_IMAGE_TYPES } from '../_lib/constants';
import type { AppError } from '../_lib/types';

let modelInstance: ReturnType<typeof createImageToImageModel> | null = null;
function getModel() { if (!modelInstance) modelInstance = createImageToImageModel(); return modelInstance; }

export function useEnhancer() {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [enhancedImage, setEnhancedImage] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<AppError | null>(null);
  const { data, isLoading: isProcessing, error: hookError, execute, cancel, reset: resetOp } = useImageToImage({ model: getModel(), scale: 2 });

  useEffect(() => {
    if (!data) return;
    imageResultToDataUrl(data.image).then(setEnhancedImage).catch(() => setValidationError({ message: 'Failed to convert enhanced image', recoverable: true }));
  }, [data]);

  const processImage = async (file: File) => {
    const validationErr = validateFile({ file, accept: ACCEPTED_IMAGE_TYPES });
    if (validationErr) { setValidationError(validationErr); return; }
    setValidationError(null);
    const dataUrl = await readFileAsDataUrl(file);
    setOriginalImage(dataUrl); setEnhancedImage(null);
    await execute(dataUrl);
  };
  const error = validationError ?? toAppError(hookError);
  const downloadEnhanced = () => { if (enhancedImage) downloadBlob(enhancedImage, `enhanced-2x-${Date.now()}.png`); };
  const clearError = () => { setValidationError(null); if (hookError) resetOp(); };
  const reset = () => { setOriginalImage(null); setEnhancedImage(null); setValidationError(null); resetOp(); };
  return { originalImage, enhancedImage, isProcessing, error, processImage, cancelProcessing: cancel, downloadEnhanced, clearError, reset };
}
