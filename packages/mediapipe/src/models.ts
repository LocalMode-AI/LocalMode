/**
 * MediaPipe Model Catalog
 *
 * Curated catalog of MediaPipe Tasks model files. Vision models use the
 * `.task` bundle format; audio and text models use raw `.tflite` files.
 * All URLs point to Google's public model CDN (`storage.googleapis.com`).
 *
 * @packageDocumentation
 */

/** MediaPipe task domain a model belongs to. */
export type MediaPipeTaskDomain = 'vision' | 'audio' | 'text';

/** Entry in the MediaPipe model catalog. */
export interface MediaPipeModelEntry {
  /** Human-readable model name */
  name: string;

  /** Short description */
  description: string;

  /** MediaPipe task this model serves */
  task: string;

  /** Task domain (determines which WASM runtime is used) */
  domain: MediaPipeTaskDomain;

  /** Model file download URL */
  url: string;

  /** File size in bytes (verified against the CDN) */
  sizeBytes: number;

  /** Human-readable file size */
  size: string;
}

/**
 * MediaPipe models curated for browser use.
 *
 * Each entry is verified against `storage.googleapis.com`. Override any
 * model with a custom `modelPath` setting when creating a model instance.
 */
export const MEDIAPIPE_MODELS = {
  // ─── Vision ────────────────────────────────────────────────────
  hand_landmarker: {
    name: 'Hand Landmarker',
    description: '21-point hand landmark detection with handedness.',
    task: 'hand_landmarker',
    domain: 'vision',
    url: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    sizeBytes: 7_819_105,
    size: '7.8MB',
  },
  pose_landmarker: {
    name: 'Pose Landmarker (Lite)',
    description: '33-point body pose landmark detection — lite variant.',
    task: 'pose_landmarker',
    domain: 'vision',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
    sizeBytes: 5_777_746,
    size: '5.8MB',
  },
  pose_landmarker_full: {
    name: 'Pose Landmarker (Full)',
    description: '33-point body pose landmark detection — higher accuracy.',
    task: 'pose_landmarker',
    domain: 'vision',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
    sizeBytes: 9_398_198,
    size: '9.4MB',
  },
  face_landmarker: {
    name: 'Face Landmarker',
    description: '478-point face mesh detection with optional blendshapes.',
    task: 'face_landmarker',
    domain: 'vision',
    url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
    sizeBytes: 3_758_596,
    size: '3.8MB',
  },
  face_detector: {
    name: 'Face Detector (BlazeFace)',
    description: 'Fast face detection with bounding boxes and 6 keypoints.',
    task: 'face_detector',
    domain: 'vision',
    url: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
    sizeBytes: 229_746,
    size: '230KB',
  },
  gesture_recognizer: {
    name: 'Gesture Recognizer',
    description: 'Recognizes 8 hand gestures with hand landmarks.',
    task: 'gesture_recognizer',
    domain: 'vision',
    url: 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
    sizeBytes: 8_373_440,
    size: '8.4MB',
  },
  image_classifier: {
    name: 'Image Classifier (EfficientNet-Lite0)',
    description: 'General image classification (ImageNet, 1000 classes).',
    task: 'image_classifier',
    domain: 'vision',
    url: 'https://storage.googleapis.com/mediapipe-models/image_classifier/efficientnet_lite0/float32/1/efficientnet_lite0.tflite',
    sizeBytes: 18_582_189,
    size: '18.6MB',
  },
  object_detector: {
    name: 'Object Detector (EfficientDet-Lite0)',
    description: 'General object detection (COCO, 80 classes).',
    task: 'object_detector',
    domain: 'vision',
    url: 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite',
    sizeBytes: 7_254_339,
    size: '7.3MB',
  },
  image_segmenter: {
    name: 'Image Segmenter (Selfie)',
    description: 'Selfie / person segmentation masks.',
    task: 'image_segmenter',
    domain: 'vision',
    url: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite',
    sizeBytes: 249_537,
    size: '250KB',
  },
  image_embedder: {
    name: 'Image Embedder (MobileNet-V3 Small)',
    description: 'Image embedding vectors for similarity search.',
    task: 'image_embedder',
    domain: 'vision',
    url: 'https://storage.googleapis.com/mediapipe-models/image_embedder/mobilenet_v3_small/float32/1/mobilenet_v3_small.tflite',
    sizeBytes: 4_117_670,
    size: '4.1MB',
  },

  // ─── Audio ─────────────────────────────────────────────────────
  audio_classifier: {
    name: 'Audio Classifier (YAMNet)',
    description: 'Environmental audio event classification (521 categories).',
    task: 'audio_classifier',
    domain: 'audio',
    url: 'https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite',
    sizeBytes: 4_126_810,
    size: '4.1MB',
  },

  // ─── Text ──────────────────────────────────────────────────────
  language_detector: {
    name: 'Language Detector',
    description: 'Identifies the language of text (110 languages).',
    task: 'language_detector',
    domain: 'text',
    url: 'https://storage.googleapis.com/mediapipe-models/language_detector/language_detector/float32/1/language_detector.tflite',
    sizeBytes: 315_294,
    size: '315KB',
  },
  text_embedder: {
    name: 'Text Embedder (Universal Sentence Encoder)',
    description: 'Semantic text embedding vectors.',
    task: 'text_embedder',
    domain: 'text',
    url: 'https://storage.googleapis.com/mediapipe-models/text_embedder/universal_sentence_encoder/float32/1/universal_sentence_encoder.tflite',
    sizeBytes: 6_120_274,
    size: '6.1MB',
  },
} as const satisfies Record<string, MediaPipeModelEntry>;

/** A known MediaPipe model catalog ID. */
export type MediaPipeModelId = keyof typeof MEDIAPIPE_MODELS;

/** Default catalog model ID for each task type. */
export const DEFAULT_MODELS = {
  hand_landmarker: 'hand_landmarker',
  pose_landmarker: 'pose_landmarker',
  face_landmarker: 'face_landmarker',
  face_detector: 'face_detector',
  gesture_recognizer: 'gesture_recognizer',
  image_classifier: 'image_classifier',
  object_detector: 'object_detector',
  image_segmenter: 'image_segmenter',
  image_embedder: 'image_embedder',
  audio_classifier: 'audio_classifier',
  language_detector: 'language_detector',
  text_embedder: 'text_embedder',
} as const satisfies Record<string, MediaPipeModelId>;

/**
 * Look up a catalog entry by ID. Returns `undefined` for unknown IDs.
 */
export function getModelEntry(id: string): MediaPipeModelEntry | undefined {
  return (MEDIAPIPE_MODELS as Record<string, MediaPipeModelEntry>)[id];
}

/**
 * Resolve a model URL from a catalog ID, a custom path, or a direct URL.
 *
 * @param modelIdOrUrl - Catalog ID or direct model URL
 * @param customPath - Explicit `modelPath` setting that takes precedence
 * @returns The resolved model file URL
 */
export function resolveModelUrl(modelIdOrUrl: string, customPath?: string): string {
  if (customPath) {
    return customPath;
  }
  const entry = getModelEntry(modelIdOrUrl);
  if (entry) {
    return entry.url;
  }
  // Treat anything else as a direct URL / path
  return modelIdOrUrl;
}
