/**
 * MediaPipe Task Implementations
 *
 * Barrel export for all MediaPipe model implementations across the vision,
 * audio, and text domains.
 *
 * @packageDocumentation
 */

export { LazyMediaPipeTask } from './base.js';

// Vision — landmarks & gestures
export { MediaPipeHandLandmarker } from './hand-landmarker.js';
export { MediaPipePoseLandmarker } from './pose-landmarker.js';
export { MediaPipeFaceDetector } from './face-detector.js';
export { MediaPipeFaceLandmarker } from './face-landmarker.js';
export { MediaPipeGestureRecognizer } from './gesture-recognizer.js';

// Vision — existing core interfaces
export { MediaPipeImageClassifier } from './image-classifier.js';
export { MediaPipeObjectDetector } from './object-detector.js';
export { MediaPipeImageSegmenter } from './image-segmenter.js';
export { MediaPipeImageEmbedder } from './image-embedder.js';

// Audio
export { MediaPipeAudioClassifier } from './audio-classifier.js';

// Text
export { MediaPipeTextClassifier } from './text-classifier.js';
export { MediaPipeTextEmbedder } from './text-embedder.js';
export { MediaPipeLanguageDetector } from './language-detector.js';
