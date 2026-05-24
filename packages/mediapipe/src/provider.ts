/**
 * MediaPipe Provider
 *
 * Factory for creating MediaPipe Tasks model instances across the vision,
 * audio, and text domains, plus real-time streaming tracker factories.
 *
 * @packageDocumentation
 */

import type { MediaPipeProvider, MediaPipeProviderSettings, MediaPipeModelSettings } from './types.js';
import { DEFAULT_MODELS } from './models.js';
import {
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
import {
  createHandTracker,
  createPoseTracker,
  createFaceTracker,
  createGestureTracker,
} from './streaming/index.js';
import type {
  HandTrackerOptions,
  PoseTrackerOptions,
  FaceTrackerOptions,
  GestureTrackerOptions,
} from './streaming/types.js';
import { resolveWasmPath } from './utils.js';

/**
 * Resolve the vision WASM base path for a streaming tracker, applying the
 * provider-level setting when the tracker options omit it.
 */
function trackerWasmPath(
  providerSettings: MediaPipeProviderSettings,
  optionPath?: string
): string {
  return optionPath ?? resolveWasmPath('vision', providerSettings.wasmBasePath);
}

/**
 * Create a MediaPipe provider with custom settings.
 *
 * @param settings - Provider-level settings applied to all models
 * @returns A `MediaPipeProvider` instance
 *
 * @example Basic usage
 * ```ts
 * import { createMediaPipe } from '@localmode/mediapipe';
 *
 * const myMediaPipe = createMediaPipe({ delegate: 'CPU' });
 * const handModel = myMediaPipe.handLandmarker();
 * ```
 */
export function createMediaPipe(
  settings: MediaPipeProviderSettings = {}
): MediaPipeProvider {
  return {
    // ─── Vision: landmarks & gestures ────────────────────────────
    handLandmarker(modelId = DEFAULT_MODELS.hand_landmarker, modelSettings) {
      return new MediaPipeHandLandmarker(modelId, modelSettings, settings);
    },
    poseLandmarker(modelId = DEFAULT_MODELS.pose_landmarker, modelSettings) {
      return new MediaPipePoseLandmarker(modelId, modelSettings, settings);
    },
    faceLandmarker(modelId = DEFAULT_MODELS.face_landmarker, modelSettings) {
      return new MediaPipeFaceLandmarker(modelId, modelSettings, settings);
    },
    faceDetector(modelId = DEFAULT_MODELS.face_detector, modelSettings) {
      return new MediaPipeFaceDetector(modelId, modelSettings, settings);
    },
    gestureRecognizer(modelId = DEFAULT_MODELS.gesture_recognizer, modelSettings) {
      return new MediaPipeGestureRecognizer(modelId, modelSettings, settings);
    },

    // ─── Vision: existing core interfaces ────────────────────────
    imageClassifier(modelId = DEFAULT_MODELS.image_classifier, modelSettings) {
      return new MediaPipeImageClassifier(modelId, modelSettings, settings);
    },
    objectDetector(modelId = DEFAULT_MODELS.object_detector, modelSettings) {
      return new MediaPipeObjectDetector(modelId, modelSettings, settings);
    },
    imageSegmenter(modelId = DEFAULT_MODELS.image_segmenter, modelSettings) {
      return new MediaPipeImageSegmenter(modelId, modelSettings, settings);
    },
    imageEmbedder(modelId = DEFAULT_MODELS.image_embedder, modelSettings) {
      return new MediaPipeImageEmbedder(modelId, modelSettings, settings);
    },

    // ─── Audio ───────────────────────────────────────────────────
    audioClassifier(modelId = DEFAULT_MODELS.audio_classifier, modelSettings) {
      return new MediaPipeAudioClassifier(modelId, modelSettings, settings);
    },

    // ─── Text ────────────────────────────────────────────────────
    textClassifier(modelPath: string, modelSettings?: MediaPipeModelSettings) {
      return new MediaPipeTextClassifier(modelPath, modelSettings, settings);
    },
    textEmbedder(modelId = DEFAULT_MODELS.text_embedder, modelSettings) {
      return new MediaPipeTextEmbedder(modelId, modelSettings, settings);
    },
    languageDetector(modelId = DEFAULT_MODELS.language_detector, modelSettings) {
      return new MediaPipeLanguageDetector(modelId, modelSettings, settings);
    },

    // ─── Streaming (vision, provider-specific) ───────────────────
    createHandTracker(options: HandTrackerOptions) {
      return createHandTracker({
        ...options,
        wasmBasePath: trackerWasmPath(settings, options.wasmBasePath),
        delegate: options.delegate ?? settings.delegate,
      });
    },
    createPoseTracker(options: PoseTrackerOptions) {
      return createPoseTracker({
        ...options,
        wasmBasePath: trackerWasmPath(settings, options.wasmBasePath),
        delegate: options.delegate ?? settings.delegate,
      });
    },
    createFaceTracker(options: FaceTrackerOptions) {
      return createFaceTracker({
        ...options,
        wasmBasePath: trackerWasmPath(settings, options.wasmBasePath),
        delegate: options.delegate ?? settings.delegate,
      });
    },
    createGestureTracker(options: GestureTrackerOptions) {
      return createGestureTracker({
        ...options,
        wasmBasePath: trackerWasmPath(settings, options.wasmBasePath),
        delegate: options.delegate ?? settings.delegate,
      });
    },
  };
}

/**
 * Default MediaPipe provider instance.
 *
 * @example
 * ```ts
 * import { mediapipe } from '@localmode/mediapipe';
 * import { detectHands } from '@localmode/core';
 *
 * const { hands } = await detectHands({
 *   model: mediapipe.handLandmarker(),
 *   image: imageBlob,
 * });
 * ```
 */
export const mediapipe: MediaPipeProvider = createMediaPipe();
