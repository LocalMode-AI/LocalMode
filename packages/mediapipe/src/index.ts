/**
 * @localmode/mediapipe
 *
 * MediaPipe Tasks provider for LocalMode. Wraps `@mediapipe/tasks-vision`,
 * `@mediapipe/tasks-audio`, and `@mediapipe/tasks-text` as a single unified
 * provider — hand/pose/face landmarks, gesture recognition, image and audio
 * classification, image embeddings, language detection, and text embeddings,
 * plus real-time streaming trackers for video.
 *
 * @packageDocumentation
 */

// Provider
export { createMediaPipe, mediapipe } from './provider.js';

// Model catalog
export {
  MEDIAPIPE_MODELS,
  DEFAULT_MODELS,
  getModelEntry,
  resolveModelUrl,
} from './models.js';
export type {
  MediaPipeModelEntry,
  MediaPipeModelId,
  MediaPipeTaskDomain,
} from './models.js';

// Streaming trackers
export {
  createHandTracker,
  createPoseTracker,
  createFaceTracker,
  createGestureTracker,
} from './streaming/index.js';
export type {
  TrackerInstance,
  BaseTrackerOptions,
  HandTrackerOptions,
  PoseTrackerOptions,
  FaceTrackerOptions,
  GestureTrackerOptions,
  HandTracker,
  PoseTracker,
  FaceTracker,
  GestureTracker,
} from './streaming/index.js';

// Implementations (for advanced use / custom wiring)
export {
  MediaPipeHandLandmarker,
  MediaPipePoseLandmarker,
  MediaPipeFaceDetector,
  MediaPipeFaceLandmarker,
  MediaPipeGestureRecognizer,
  MediaPipeImageClassifier,
  MediaPipeObjectDetector,
  MediaPipeImageSegmenter,
  MediaPipeImageEmbedder,
  MediaPipeAudioClassifier,
  MediaPipeTextClassifier,
  MediaPipeTextEmbedder,
  MediaPipeLanguageDetector,
} from './implementations/index.js';

// Types
export type {
  MediaPipeProvider,
  MediaPipeProviderSettings,
  MediaPipeModelSettings,
  MediaPipeDelegate,
  MediaPipeWasmPaths,
} from './types.js';
