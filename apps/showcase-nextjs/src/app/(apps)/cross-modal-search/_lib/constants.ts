/**
 * @file constants.ts
 * @description Constants for the cross-modal search application
 */

/** CLIP model ID for multimodal embeddings */
export const MODEL_ID = 'Xenova/clip-vit-base-patch32';

/** Approximate model download size for display */
export const MODEL_SIZE = '~350MB';

/** VectorDB database name */
export const DB_NAME = 'cross-modal-search-db';

/** CLIP produces 512-dimensional embedding vectors */
export const EMBEDDING_DIMENSIONS = 512;

/** Default number of search results to return */
export const DEFAULT_TOP_K = 20;

/** Accepted image file MIME types */
export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
