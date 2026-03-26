/**
 * @file segmenter.service.ts
 * @description Service for creating the segmentation model via @localmode/transformers
 */
import { transformers } from '@localmode/transformers';
import { MODEL_CONFIG } from '../_lib/constants';

/**
 * Create the segmentation model for background removal.
 * The actual segmentation call is handled by the useSegmentImage hook from @localmode/react.
 *
 * @returns A SegmentationModel instance configured for background removal
 */
export function createSegmentationModel() {
  return transformers.segmenter(MODEL_CONFIG.modelId);
}
