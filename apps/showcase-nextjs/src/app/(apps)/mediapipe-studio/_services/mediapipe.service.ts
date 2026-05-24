/**
 * @file mediapipe.service.ts
 * @description Model and tracker factories backed by @localmode/mediapipe
 */
import { mediapipe } from '@localmode/mediapipe';
import type {
  AudioClassificationModel,
  LanguageDetectionModel,
  EmbeddingModel,
} from '@localmode/core';

/** The MediaPipe provider (WASM runtime loads from the jsDelivr CDN). */
export { mediapipe };

// Single-frame model singletons — created once, loaded lazily on first use.
let audioClassifier: AudioClassificationModel | null = null;
let languageDetector: LanguageDetectionModel | null = null;
let textEmbedder: EmbeddingModel | null = null;

/** Get the shared YAMNet audio classifier model. */
export function getAudioClassifier(): AudioClassificationModel {
  audioClassifier ??= mediapipe.audioClassifier();
  return audioClassifier;
}

/** Get the shared language detection model. */
export function getLanguageDetector(): LanguageDetectionModel {
  languageDetector ??= mediapipe.languageDetector();
  return languageDetector;
}

/** Get the shared text embedding model. */
export function getTextEmbedder(): EmbeddingModel {
  textEmbedder ??= mediapipe.textEmbedder();
  return textEmbedder;
}
