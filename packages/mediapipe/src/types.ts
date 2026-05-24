/**
 * MediaPipe Provider Types
 *
 * Provider, settings, and model-instance types for the `@localmode/mediapipe`
 * provider. Wraps `@mediapipe/tasks-vision`, `@mediapipe/tasks-audio`, and
 * `@mediapipe/tasks-text`.
 *
 * @packageDocumentation
 */

import type {
  HandLandmarkModel,
  PoseLandmarkModel,
  FaceDetectionModel,
  FaceLandmarkModel,
  GestureRecognitionModel,
  ImageClassificationModel,
  ObjectDetectionModel,
  SegmentationModel,
  ImageFeatureModel,
  AudioClassificationModel,
  ClassificationModel,
  EmbeddingModel,
  LanguageDetectionModel,
} from '@localmode/core';
import type {
  HandTracker,
  PoseTracker,
  FaceTracker,
  GestureTracker,
  HandTrackerOptions,
  PoseTrackerOptions,
  FaceTrackerOptions,
  GestureTrackerOptions,
} from './streaming/types.js';

/**
 * Inference delegate (hardware backend) for a MediaPipe task.
 *
 * - `GPU` — WebGL-accelerated (default, fastest)
 * - `CPU` — WASM-only (broadest compatibility)
 */
export type MediaPipeDelegate = 'GPU' | 'CPU';

/**
 * WASM runtime base paths for each MediaPipe task domain.
 *
 * Each domain (`@mediapipe/tasks-vision`, `-audio`, `-text`) ships its own
 * WASM runtime. When omitted, files are loaded from the jsDelivr CDN.
 */
export interface MediaPipeWasmPaths {
  /** Base path for the vision WASM runtime */
  vision?: string;
  /** Base path for the audio WASM runtime */
  audio?: string;
  /** Base path for the text WASM runtime */
  text?: string;
}

/**
 * Provider-level settings applied to all models created from a provider.
 */
export interface MediaPipeProviderSettings {
  /**
   * Base path for MediaPipe WASM runtime files. A single string applies to
   * all three domains; an object overrides each domain independently.
   */
  wasmBasePath?: string | MediaPipeWasmPaths;

  /** Default inference delegate for all tasks (default: 'GPU') */
  delegate?: MediaPipeDelegate;
}

/**
 * Per-model settings, overriding provider-level settings.
 */
export interface MediaPipeModelSettings {
  /** Custom model file URL, overriding the catalog default */
  modelPath?: string;

  /** Inference delegate for this model (default: provider setting or 'GPU') */
  delegate?: MediaPipeDelegate;

  /**
   * Base path for the WASM runtime of this model's domain. Overrides the
   * provider-level `wasmBasePath`.
   */
  wasmBasePath?: string;
}

/**
 * The `@localmode/mediapipe` provider.
 *
 * Factory methods for every supported MediaPipe task across vision, audio,
 * and text, plus real-time streaming tracker factories for vision.
 */
export interface MediaPipeProvider {
  // ─── Vision: landmarks & gestures ──────────────────────────────
  /** Create a hand landmark detection model (21-point hand topology). */
  handLandmarker(modelId?: string, settings?: MediaPipeModelSettings): HandLandmarkModel;
  /** Create a pose landmark detection model (33-point body topology). */
  poseLandmarker(modelId?: string, settings?: MediaPipeModelSettings): PoseLandmarkModel;
  /** Create a face landmark (478-point mesh) detection model. */
  faceLandmarker(modelId?: string, settings?: MediaPipeModelSettings): FaceLandmarkModel;
  /** Create a face detection model (bounding boxes + keypoints). */
  faceDetector(modelId?: string, settings?: MediaPipeModelSettings): FaceDetectionModel;
  /** Create a hand gesture recognition model. */
  gestureRecognizer(
    modelId?: string,
    settings?: MediaPipeModelSettings
  ): GestureRecognitionModel;

  // ─── Vision: existing core interfaces ──────────────────────────
  /** Create an image classification model. */
  imageClassifier(
    modelId?: string,
    settings?: MediaPipeModelSettings
  ): ImageClassificationModel;
  /** Create an object detection model. */
  objectDetector(modelId?: string, settings?: MediaPipeModelSettings): ObjectDetectionModel;
  /** Create an image segmentation model. */
  imageSegmenter(modelId?: string, settings?: MediaPipeModelSettings): SegmentationModel;
  /** Create an image embedding model. */
  imageEmbedder(modelId?: string, settings?: MediaPipeModelSettings): ImageFeatureModel;

  // ─── Audio ─────────────────────────────────────────────────────
  /** Create an audio classification model (YAMNet, 521 categories). */
  audioClassifier(
    modelId?: string,
    settings?: MediaPipeModelSettings
  ): AudioClassificationModel;

  // ─── Text ──────────────────────────────────────────────────────
  /**
   * Create a text classification model.
   *
   * MediaPipe ships no general-purpose text classifier — a custom-trained
   * `.tflite` model path is required.
   */
  textClassifier(modelPath: string, settings?: MediaPipeModelSettings): ClassificationModel;
  /** Create a text embedding model (Universal Sentence Encoder). */
  textEmbedder(modelId?: string, settings?: MediaPipeModelSettings): EmbeddingModel;
  /** Create a language detection model (110 languages). */
  languageDetector(
    modelId?: string,
    settings?: MediaPipeModelSettings
  ): LanguageDetectionModel;

  // ─── Streaming (vision, provider-specific) ─────────────────────
  /** Create a real-time hand tracker for a video element. */
  createHandTracker(options: HandTrackerOptions): HandTracker;
  /** Create a real-time pose tracker for a video element. */
  createPoseTracker(options: PoseTrackerOptions): PoseTracker;
  /** Create a real-time face mesh tracker for a video element. */
  createFaceTracker(options: FaceTrackerOptions): FaceTracker;
  /** Create a real-time gesture tracker for a video element. */
  createGestureTracker(options: GestureTrackerOptions): GestureTracker;
}
