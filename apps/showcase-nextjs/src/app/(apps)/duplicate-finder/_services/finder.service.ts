/**
 * @file finder.service.ts
 * @description Service for image feature model creation using @localmode/transformers.
 *
 * Feature extraction is handled by the useExtractImageFeatures hook from
 * @localmode/react. This service provides the singleton model instance and
 * the custom abort error class used during batch processing.
 */
import { transformers } from '@localmode/transformers';
import type { ImageFeatureModel } from '@localmode/core';
import { MODEL_ID } from '../_lib/constants';

/** Error thrown when a feature extraction request is aborted */
export class FinderAbortError extends Error {
  constructor() {
    super('Feature extraction was aborted');
    this.name = 'FinderAbortError';
  }
}

/** Singleton model instance */
let model: ImageFeatureModel | null = null;

/**
 * Get or create the image feature model singleton.
 * Used as the model argument for useExtractImageFeatures.
 */
export function getModel() {
  if (!model) {
    model = transformers.imageFeatures(MODEL_ID);
  }
  return model;
}
