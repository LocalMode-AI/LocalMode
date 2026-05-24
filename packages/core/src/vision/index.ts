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

// Hand Landmark Detection
export { detectHands, setGlobalHandLandmarkProvider } from './detect-hands.js';

// Pose Landmark Detection
export { detectPose, setGlobalPoseLandmarkProvider } from './detect-pose.js';

// Face Detection
export { detectFace, setGlobalFaceDetectionProvider } from './detect-face.js';

// Face Landmark Detection
export {
  detectFaceLandmarks,
  setGlobalFaceLandmarkProvider,
} from './detect-face-landmarks.js';

// Gesture Recognition
export {
  recognizeGesture,
  setGlobalGestureRecognitionProvider,
} from './recognize-gesture.js';

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

export {
  HAND_CONNECTIONS,
  POSE_CONNECTIONS,
  FACE_CONNECTIONS,
  GESTURE_CATEGORIES,
} from './landmarks.js';
export type { GestureCategory } from './landmarks.js';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export * from './types.js';
