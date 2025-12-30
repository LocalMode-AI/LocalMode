/**
 * Audio Domain Types
 *
 * Audio interfaces for:
 * - Speech-to-Text (STT) / Automatic Speech Recognition (ASR)
 * - Text-to-Speech (TTS)
 * - Audio Classification
 *
 * @packageDocumentation
 */

// ═══════════════════════════════════════════════════════════════
// COMMON TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Audio input type - supports multiple formats.
 */
export type AudioInput = Blob | ArrayBuffer | Float32Array;

/**
 * Audio task usage information.
 */
export interface AudioUsage {
  /** Duration of audio processed (seconds) */
  audioDurationSec?: number;

  /** Time spent on processing (milliseconds) */
  durationMs: number;
}

/**
 * Audio task response metadata.
 */
export interface AudioResponse {
  /** Optional request ID */
  id?: string;

  /** Model ID used */
  modelId: string;

  /** Timestamp of the response */
  timestamp: Date;
}

/**
 * A transcription segment with timestamps.
 */
export interface TranscriptionSegment {
  /** Segment text */
  text: string;

  /** Start time in seconds */
  start: number;

  /** End time in seconds */
  end: number;

  /** Optional confidence score */
  confidence?: number;
}

// ═══════════════════════════════════════════════════════════════
// SPEECH-TO-TEXT MODEL INTERFACE
// ═══════════════════════════════════════════════════════════════

/**
 * Interface for speech-to-text models (e.g., Whisper).
 */
export interface SpeechToTextModel {
  /** Unique identifier for this model */
  readonly modelId: string;

  /** Provider name */
  readonly provider: string;

  /** Supported languages (ISO codes) */
  readonly languages?: string[];

  /**
   * Transcribe the given audio.
   *
   * @param options - Transcription options
   * @returns Promise with transcription result
   */
  doTranscribe(options: DoTranscribeOptions): Promise<DoTranscribeResult>;
}

/**
 * Options passed to SpeechToTextModel.doTranscribe()
 */
export interface DoTranscribeOptions {
  /** Audio to transcribe */
  audio: AudioInput;

  /** Language code (ISO 639-1) */
  language?: string;

  /** Task type */
  task?: 'transcribe' | 'translate';

  /** Whether to return word-level timestamps */
  returnTimestamps?: boolean | 'word';

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Custom headers */
  headers?: Record<string, string>;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from SpeechToTextModel.doTranscribe()
 */
export interface DoTranscribeResult {
  /** Full transcribed text */
  text: string;

  /** Segments with timestamps (if requested) */
  segments?: TranscriptionSegment[];

  /** Detected language (ISO code) */
  language?: string;

  /** Usage information */
  usage: AudioUsage;
}

/**
 * Options for the transcribe() function.
 *
 * @example
 * ```ts
 * const { text, segments } = await transcribe({
 *   model: transformers.speechToText('Xenova/whisper-tiny'),
 *   audio: audioBlob,
 *   returnTimestamps: true,
 * });
 * ```
 */
export interface TranscribeOptions {
  /** The speech-to-text model to use */
  model: SpeechToTextModel | string;

  /** Audio to transcribe */
  audio: AudioInput;

  /** Language code (ISO 639-1) */
  language?: string;

  /** Task type */
  task?: 'transcribe' | 'translate';

  /** Whether to return timestamps */
  returnTimestamps?: boolean | 'word';

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Maximum retry attempts (default: 2) */
  maxRetries?: number;

  /** Custom headers */
  headers?: Record<string, string>;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from the transcribe() function.
 */
export interface TranscribeResult {
  /** Full transcribed text */
  text: string;

  /** Segments with timestamps (if requested) */
  segments?: TranscriptionSegment[];

  /** Detected language */
  language?: string;

  /** Usage information */
  usage: AudioUsage;

  /** Response metadata */
  response: AudioResponse;
}

// ═══════════════════════════════════════════════════════════════
// TEXT-TO-SPEECH MODEL INTERFACE
// ═══════════════════════════════════════════════════════════════

/**
 * Interface for text-to-speech models.
 */
export interface TextToSpeechModel {
  /** Unique identifier for this model */
  readonly modelId: string;

  /** Provider name */
  readonly provider: string;

  /** Available voice IDs */
  readonly voices?: string[];

  /**
   * Synthesize speech from text.
   *
   * @param options - Synthesis options
   * @returns Promise with audio result
   */
  doSynthesize(options: DoSynthesizeOptions): Promise<DoSynthesizeResult>;
}

/**
 * Options passed to TextToSpeechModel.doSynthesize()
 */
export interface DoSynthesizeOptions {
  /** Text to synthesize */
  text: string;

  /** Voice ID to use */
  voice?: string;

  /** Speech rate (0.5-2.0, default: 1.0) */
  speed?: number;

  /** Pitch adjustment */
  pitch?: number;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from TextToSpeechModel.doSynthesize()
 */
export interface DoSynthesizeResult {
  /** Generated audio as Blob */
  audio: Blob;

  /** Sample rate of the audio */
  sampleRate: number;

  /** Usage information */
  usage: {
    /** Number of characters synthesized */
    characterCount: number;

    /** Time spent on synthesis (ms) */
    durationMs: number;
  };
}

/**
 * Options for the synthesizeSpeech() function.
 *
 * @example
 * ```ts
 * const { audio } = await synthesizeSpeech({
 *   model: transformers.textToSpeech('Xenova/speecht5-tts'),
 *   text: 'Hello, world!',
 * });
 * ```
 */
export interface SynthesizeSpeechOptions {
  /** The text-to-speech model to use */
  model: TextToSpeechModel | string;

  /** Text to synthesize */
  text: string;

  /** Voice ID to use */
  voice?: string;

  /** Speech rate (0.5-2.0, default: 1.0) */
  speed?: number;

  /** Pitch adjustment */
  pitch?: number;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Maximum retry attempts (default: 2) */
  maxRetries?: number;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from the synthesizeSpeech() function.
 */
export interface SynthesizeSpeechResult {
  /** Generated audio as Blob */
  audio: Blob;

  /** Sample rate of the audio */
  sampleRate: number;

  /** Usage information */
  usage: {
    /** Number of characters synthesized */
    characterCount: number;

    /** Time spent on synthesis (ms) */
    durationMs: number;
  };

  /** Response metadata */
  response: AudioResponse;
}

// ═══════════════════════════════════════════════════════════════
// AUDIO CLASSIFICATION MODEL INTERFACE
// ═══════════════════════════════════════════════════════════════

/**
 * Interface for audio classification models.
 */
export interface AudioClassificationModel {
  /** Unique identifier for this model */
  readonly modelId: string;

  /** Provider name */
  readonly provider: string;

  /**
   * Classify the given audio.
   *
   * @param options - Classification options
   * @returns Promise with classification results
   */
  doClassify(options: DoClassifyAudioOptions): Promise<DoClassifyAudioResult>;
}

/**
 * Options passed to AudioClassificationModel.doClassify()
 */
export interface DoClassifyAudioOptions {
  /** Audio samples to classify */
  audio: AudioInput[];

  /** Number of top predictions to return */
  topK?: number;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from AudioClassificationModel.doClassify()
 */
export interface DoClassifyAudioResult {
  /** Classification results (one array per input audio) */
  results: AudioClassificationResultItem[][];

  /** Usage information */
  usage: AudioUsage;
}

/**
 * A single audio classification prediction.
 */
export interface AudioClassificationResultItem {
  /** The predicted label */
  label: string;

  /** Confidence score (0-1) */
  score: number;
}

/**
 * Interface for zero-shot audio classification models (e.g., CLAP).
 */
export interface ZeroShotAudioClassificationModel {
  /** Unique identifier for this model */
  readonly modelId: string;

  /** Provider name */
  readonly provider: string;

  /**
   * Classify audio into candidate labels without fine-tuning.
   *
   * @param options - Classification options
   * @returns Promise with classification results
   */
  doClassifyZeroShot(
    options: DoClassifyAudioZeroShotOptions
  ): Promise<DoClassifyAudioZeroShotResult>;
}

/**
 * Options passed to ZeroShotAudioClassificationModel.doClassifyZeroShot()
 */
export interface DoClassifyAudioZeroShotOptions {
  /** Audio samples to classify */
  audio: AudioInput[];

  /** Candidate labels to classify into */
  candidateLabels: string[];

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from ZeroShotAudioClassificationModel.doClassifyZeroShot()
 */
export interface DoClassifyAudioZeroShotResult {
  /** Classification results (one per input audio) */
  results: ZeroShotAudioClassificationResultItem[];

  /** Usage information */
  usage: AudioUsage;
}

/**
 * A single zero-shot audio classification result.
 */
export interface ZeroShotAudioClassificationResultItem {
  /** Labels sorted by score (highest first) */
  labels: string[];

  /** Corresponding scores for each label */
  scores: number[];
}

/**
 * Options for the classifyAudio() function.
 */
export interface ClassifyAudioOptions {
  /** The audio classification model to use */
  model: AudioClassificationModel | string;

  /** Audio to classify */
  audio: AudioInput;

  /** Number of top predictions to return (default: 5) */
  topK?: number;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Maximum retry attempts (default: 2) */
  maxRetries?: number;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from the classifyAudio() function.
 */
export interface ClassifyAudioResult {
  /** Top predictions sorted by score */
  predictions: AudioClassificationResultItem[];

  /** Usage information */
  usage: AudioUsage;

  /** Response metadata */
  response: AudioResponse;
}

/**
 * Options for the classifyAudioZeroShot() function.
 */
export interface ClassifyAudioZeroShotOptions {
  /** The zero-shot audio classification model to use */
  model: ZeroShotAudioClassificationModel | string;

  /** Audio to classify */
  audio: AudioInput;

  /** Candidate labels to classify into */
  candidateLabels: string[];

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Maximum retry attempts (default: 2) */
  maxRetries?: number;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from the classifyAudioZeroShot() function.
 */
export interface ClassifyAudioZeroShotResult {
  /** Labels sorted by score (highest first) */
  labels: string[];

  /** Corresponding scores for each label */
  scores: number[];

  /** Usage information */
  usage: AudioUsage;

  /** Response metadata */
  response: AudioResponse;
}

// ═══════════════════════════════════════════════════════════════
// PROVIDER FACTORY TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Factory function type for creating speech-to-text models.
 */
export type SpeechToTextModelFactory = (
  modelId: string,
  settings?: Record<string, unknown>
) => SpeechToTextModel;

/**
 * Factory function type for creating text-to-speech models.
 */
export type TextToSpeechModelFactory = (
  modelId: string,
  settings?: Record<string, unknown>
) => TextToSpeechModel;

/**
 * Factory function type for creating audio classification models.
 */
export type AudioClassificationModelFactory = (
  modelId: string,
  settings?: Record<string, unknown>
) => AudioClassificationModel;

/**
 * Factory function type for creating zero-shot audio classification models.
 */
export type ZeroShotAudioClassificationModelFactory = (
  modelId: string,
  settings?: Record<string, unknown>
) => ZeroShotAudioClassificationModel;

