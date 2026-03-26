/**
 * @file enhancer.service.ts
 * @description Service for creating the image-to-image model via @localmode/transformers.
 * The actual enhancement call is handled by the useImageToImage hook from @localmode/react.
 */
import { transformers } from '@localmode/transformers';
import { MODEL_CONFIG } from '../_lib/constants';

/**
 * Create the image-to-image model for super-resolution enhancement.
 *
 * @returns An ImageToImageModel instance configured for 2x upscaling
 */
export function createImageToImageModel() {
  return transformers.imageToImage(MODEL_CONFIG.modelId);
}
