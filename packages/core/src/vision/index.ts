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

// Image Segmentation
export { segmentImage, setGlobalSegmentationProvider } from './segment-image.js';

// Object Detection
export { detectObjects, setGlobalObjectDetectionProvider } from './detect-objects.js';

// Image Feature Extraction
export { extractImageFeatures, setGlobalImageFeatureProvider } from './extract-features.js';

// Image-to-Image / Super Resolution
export { upscaleImage, imageToImage, setGlobalImageToImageProvider } from './image-to-image.js';

// Depth Estimation
export { estimateDepth, setGlobalDepthEstimationProvider } from './estimate-depth.js';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export * from './types.js';
