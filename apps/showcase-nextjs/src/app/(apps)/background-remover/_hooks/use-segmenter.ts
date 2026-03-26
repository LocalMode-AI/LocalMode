/**
 * @file use-segmenter.ts
 * @description Hook for managing background removal workflow using useSegmentImage from @localmode/react
 */
'use client';

import { useState } from 'react';
import { useSegmentImage, toAppError, readFileAsDataUrl } from '@localmode/react';
import { createSegmentationModel } from '../_services/segmenter.service';
import { applyMaskToImage } from '../_lib/utils';

/** Lazily created segmentation model singleton */
let modelInstance: ReturnType<typeof createSegmentationModel> | null = null;
function getModel() {
  if (!modelInstance) modelInstance = createSegmentationModel();
  return modelInstance;
}

/** Hook for background removal operations */
export function useSegmenter() {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);

  const { error: hookError, isLoading, execute, cancel, reset: resetOp } = useSegmentImage({ model: getModel() });

  /** Handle file upload, run segmentation, and apply mask */
  const processImage = async (file: File) => {
    const dataUrl = await readFileAsDataUrl(file);
    setOriginalImage(dataUrl);
    setProcessedImage(null);
    const result = await execute(dataUrl);
    if (result && result.masks.length > 0) {
      const best = result.masks.reduce((a, b) => (b.score > a.score ? b : a));
      setProcessedImage(await applyMaskToImage(dataUrl, best.mask));
    }
  };

  /** Download the processed image as PNG */
  const downloadProcessed = () => {
    if (!processedImage) return;
    Object.assign(document.createElement('a'), { href: processedImage, download: `background-removed-${Date.now()}.png` }).click();
  };

  const reset = () => { setOriginalImage(null); setProcessedImage(null); resetOp(); };

  return {
    originalImage,
    processedImage,
    isProcessing: isLoading,
    error: toAppError(hookError),
    processImage,
    cancelProcessing: cancel,
    downloadProcessed,
    clearError: resetOp,
    reset,
  };
}
