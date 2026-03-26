/**
 * @file constants.ts
 * @description Constants for the smart gallery application
 */

/** SigLIP model ID for image features and zero-shot classification */
export const MODEL_ID = 'Xenova/siglip-base-patch16-224';

/** Approximate model download size for display */
export const MODEL_SIZE = '~400MB';

/** SigLIP produces 768-dimensional feature vectors */
export const EMBEDDING_DIMENSIONS = 768;

/** VectorDB database name */
export const DB_NAME = 'smart-gallery-db';

/** Accepted image file MIME types */
export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/** Categories for zero-shot image classification */
export const CATEGORIES = [
  'nature',
  'people',
  'animals',
  'food',
  'architecture',
  'vehicles',
  'art',
  'technology',
  'sports',
  'other',
] as const;

/** Default number of search results to return */
export const DEFAULT_TOP_K = 20;
