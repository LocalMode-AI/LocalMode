/**
 * Vision Domain
 *
 * Vision functions and types for image processing tasks.
 *
 * @packageDocumentation
 */

// ═══════════════════════════════════════════════════════════════
// FUNCTIONS
// ═══════════════════════════════════════════════════════════════

// Image Classification
export {
  classifyImage,
  classifyImageZeroShot,
  setGlobalImageClassificationProvider,
} from './classify-image.js';

// Image Captioning
export { captionImage, setGlobalImageCaptionProvider } from './caption-image.js';

// Image Segmentation (P2)
export { segmentImage, setGlobalSegmentationProvider } from './segment-image.js';

// Object Detection (P2)
export { detectObjects, setGlobalObjectDetectionProvider } from './detect-objects.js';

// Image Feature Extraction (P2)
export { extractImageFeatures, setGlobalImageFeatureProvider } from './extract-features.js';

// Image-to-Image / Super Resolution (P2)
export { upscaleImage, imageToImage, setGlobalImageToImageProvider } from './image-to-image.js';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export * from './types.js';
