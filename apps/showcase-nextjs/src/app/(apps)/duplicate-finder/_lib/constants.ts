/**
 * @file constants.ts
 * @description App constants and configuration for duplicate-finder
 */

/**
 * Image feature extraction model ID.
 * Note: "dinov3" in the model ID is a community naming convention on HuggingFace.
 * Only DINOv1 and DINOv2 exist as official Meta research models. This is a
 * community-converted DINOv2-based model, not an official "DINOv3".
 */
export const MODEL_ID = 'onnx-community/dinov3-vits16-pretrain-lvd1689m-ONNX';

/** Approximate model download size for display */
export const MODEL_SIZE = '~86MB';

/** Cosine similarity threshold to consider images as duplicates */
export const SIMILARITY_THRESHOLD = 0.85;

/** Accepted image file types for upload */
export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
