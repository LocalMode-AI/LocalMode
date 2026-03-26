/**
 * @file constants.ts
 * @description Constants for the product search application
 */

/** SigLIP model ID for image feature extraction and zero-shot classification */
export const MODEL_ID = 'Xenova/siglip-base-patch16-224';

/** Approximate model download size */
export const MODEL_SIZE = '~400MB';

/** Feature vector dimensions for SigLIP-Base-Patch16-224 */
export const EMBEDDING_DIMENSIONS = 768;

/** VectorDB database name */
export const DB_NAME = 'product-search-db';

/** Default number of search results to return */
export const DEFAULT_TOP_K = 20;

/** Product categories for zero-shot classification */
export const CATEGORIES = [
  'Electronics',
  'Clothing',
  'Home & Garden',
  'Toys',
  'Food & Beverage',
  'Sports',
  'Books',
  'Automotive',
  'Health',
  'Other',
] as const;

/** Accepted image MIME types for upload */
export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/**
 * Default similarity threshold for CLIP/SigLIP cross-modal search.
 *
 * Cross-modal (text-to-image) cosine similarity scores are typically lower
 * than same-modality text embedding scores. A threshold of 0.2 filters
 * clearly irrelevant results while remaining permissive enough for the
 * cross-modal use case. Used as a fallback when `getDefaultThreshold()`
 * returns `undefined` (SigLIP is not in the preset map).
 */
export const CLIP_SIMILARITY_THRESHOLD = 0.2;
