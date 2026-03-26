/**
 * @file use-detector.ts
 * @description Hook for managing object detection workflow using @localmode/react
 */
'use client';

import { useState } from 'react';
import { useDetectObjects, toAppError, readFileAsDataUrl } from '@localmode/react';
import { transformers } from '@localmode/transformers';
import { getImageDimensions } from '../_lib/utils';
import { MODEL_CONFIG } from '../_lib/constants';

/** Instantiate the object detection model once */
const model = transformers.objectDetector(MODEL_CONFIG.modelId);

/** Hook for object detection operations */
export function useDetector() {
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageWidth, setImageWidth] = useState(0);
  const [imageHeight, setImageHeight] = useState(0);

  const { data, error: hookError, isLoading, execute, cancel, reset: resetOp } = useDetectObjects({ model });

  /** Handle file upload and run detection */
  const processImage = async (file: File) => {
    const dataUrl = await readFileAsDataUrl(file);
    const { width, height } = await getImageDimensions(dataUrl);
    setImageDataUrl(dataUrl);
    setImageWidth(width);
    setImageHeight(height);
    await execute(dataUrl);
  };

  /** Reset the entire state */
  const reset = () => {
    setImageDataUrl(null);
    setImageWidth(0);
    setImageHeight(0);
    resetOp();
  };

  return {
    imageDataUrl,
    imageWidth,
    imageHeight,
    detections: data?.objects ?? [],
    isProcessing: isLoading,
    error: toAppError(hookError),
    processImage,
    cancelDetection: cancel,
    clearError: resetOp,
    reset,
  };
}
