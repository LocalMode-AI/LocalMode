/**
 * Live Transcribe Types
 *
 * Types for streaming microphone-driven speech-to-text with VAD-based segmentation.
 *
 * @packageDocumentation
 */

import type { SpeechToTextModel } from './types.js';
import type { VADProvider } from './vad/types.js';

// ═══════════════════════════════════════════════════════════════
// LIVE TRANSCRIBER STATE
// ═══════════════════════════════════════════════════════════════

/**
 * Lifecycle state of a {@link LiveTranscriber} controller.
 */
export type LiveTranscriberState =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'error'
  | 'disposed';

// ═══════════════════════════════════════════════════════════════
// AUDIO PLAYBACK HANDLE (FOR BARGE-IN)
// ═══════════════════════════════════════════════════════════════

/**
 * Handle to an active audio playback (typically a TTS response).
 *
 * Pass via {@link LiveTranscriberOptions.bargeInWhilePlaying} so the
 * transcriber can stop the playback when the user begins speaking.
 */
export interface AudioPlaybackHandle {
  /** Returns true if the audio is currently playing. */
  isPlaying(): boolean;

  /** Stop the playback immediately. */
  stop(): void | Promise<void>;
}

// ═══════════════════════════════════════════════════════════════
// LIVE CHUNK / UTTERANCE / EVENTS
// ═══════════════════════════════════════════════════════════════

/**
 * A streaming transcript chunk emitted while the user is speaking
 * (or once when the utterance ends).
 *
 * Partial chunks (`isFinal: false`) provide the current best transcript
 * of the utterance so far. The final chunk (`isFinal: true`) supersedes
 * all partials with the same `utteranceId`.
 */
export interface LiveChunk {
  /** Best-effort transcript of the utterance from start up to this chunk's audio cut. */
  text: string;

  /** Duration of accumulated audio at chunk emission (seconds). */
  audioDurationSec: number;

  /** True for the chunk emitted at utterance end. False for in-progress partials. */
  isFinal: boolean;

  /** Monotonically increasing index within the current utterance (0-based). */
  chunkIndex: number;

  /** Stable identifier for this utterance — shared across all of its chunks. */
  utteranceId: string;

  /** When the chunk was produced. */
  timestamp: Date;
}

/**
 * A complete utterance produced by the live transcriber.
 *
 * Emitted once (per utterance) at speech end (or on `stop()` in push-to-talk).
 */
export interface LiveUtterance {
  /** Stable identifier shared with the utterance's chunks. */
  utteranceId: string;

  /** Final transcript text (canonical — supersedes all partials). */
  text: string;

  /** Total duration of the captured audio (seconds). */
  durationSec: number;

  /** The captured audio samples at the configured sample rate. */
  audio: Float32Array;

  /** True when the utterance was force-flushed because it exceeded `maxUtteranceSec`. */
  truncated: boolean;

  /** When the utterance ended. */
  timestamp: Date;
}

/**
 * Event payload describing a barge-in (user spoke during external playback).
 */
export interface BargeInEvent {
  /** When the barge-in was detected. */
  timestamp: Date;

  /** RMS audio level (in dBFS) of the triggering frame. */
  audioLevelDb: number;
}

/**
 * Event payload passed to {@link LiveTranscriberOptions.shouldStartUtterance}.
 */
export interface LiveSpeechStartGateEvent {
  /** When VAD detected speech start. */
  timestamp: Date;

  /** RMS audio level (in dBFS) of the triggering frame. */
  audioLevelDb: number;
}

/**
 * Event fired on every state machine transition.
 */
export interface LiveTranscriberStateChangeEvent {
  from: LiveTranscriberState;
  to: LiveTranscriberState;
  timestamp: Date;
}

/**
 * Coarse live-audio activity signal for diagnostics and UI feedback.
 */
export interface LiveAudioActivity {
  /** Current audio pipeline phase. */
  phase: 'listening' | 'speech-started' | 'speech-ended' | 'transcribing' | 'rearm';

  /** Recent RMS level on a linear 0..1 scale when available. */
  rms?: number;

  /** Recent peak level on a linear 0..1 scale when available. */
  peak?: number;

  /** Elapsed milliseconds for the phase when available. */
  elapsedMs?: number;
}

// ═══════════════════════════════════════════════════════════════
// LIVE TRANSCRIBER OPTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * VAD strategy selector. Use the string `'energy'` for the built-in
 * zero-dependency RMS VAD, `'silero'` to opt into the
 * `@localmode/transformers` silero adapter (which must be supplied as a
 * provider object — string mode throws if no adapter is registered),
 * or pass a custom {@link VADProvider} directly.
 */
export type LiveTranscriberVADOption = 'energy' | 'silero' | VADProvider;

/**
 * Operating mode for the live transcriber.
 *
 * - `'push-to-talk'` — caller drives `start()` / `stop()`. VAD output is ignored.
 * - `'open-mic'` — VAD auto-segments utterances. Multiple utterances per session.
 */
export type LiveTranscriberMode = 'push-to-talk' | 'open-mic';

/**
 * Options for {@link createLiveTranscriber}.
 *
 * @example Push-to-talk
 * ```ts
 * const transcriber = await createLiveTranscriber({
 *   model: transformers.speechToText('onnx-community/moonshine-tiny-ONNX'),
 *   mode: 'push-to-talk',
 *   vad: 'energy',
 * });
 *
 * await transcriber.start();
 * // ...user speaks...
 * await transcriber.stop();
 * ```
 *
 * @example Open-mic with barge-in
 * ```ts
 * const audio = new Audio(ttsBlobUrl);
 * const handle = {
 *   isPlaying: () => !audio.paused && !audio.ended,
 *   stop: () => audio.pause(),
 * };
 *
 * const transcriber = await createLiveTranscriber({
 *   model: transformers.speechToText('onnx-community/moonshine-tiny-ONNX'),
 *   mode: 'open-mic',
 *   vad: transformers.vad('onnx-community/silero-vad'),
 *   bargeInWhilePlaying: handle,
 * });
 *
 * transcriber.onBargeIn(() => console.log('User interrupted!'));
 * await transcriber.start();
 * ```
 */
export interface LiveTranscriberOptions {
  /** Speech-to-text model that transcribes each chunk. */
  model: SpeechToTextModel;

  /** Operating mode. Default: `'push-to-talk'`. */
  mode?: LiveTranscriberMode;

  /** VAD strategy. Default: `'energy'`. */
  vad?: LiveTranscriberVADOption;

  /** Sample rate in Hz. Default: `16000`. */
  sampleRate?: number;

  /**
   * Interval at which partial chunks are emitted while a user is speaking.
   * Set to `0` to disable partial chunks (only the final chunk fires).
   * Default: `800` (ms).
   */
  chunkInterval?: number;

  /**
   * Maximum length of a single utterance (seconds). When exceeded,
   * the current utterance is force-flushed with `truncated: true`
   * and a new utterance buffer is started.
   * Default: `25`.
   */
  maxUtteranceSec?: number;

  /**
   * Optional handle to an audio playback in progress. When the user begins
   * speaking while the handle reports `isPlaying() === true`, the
   * transcriber emits an `onBargeIn` event and calls `handle.stop()`.
   */
  bargeInWhilePlaying?: AudioPlaybackHandle;

  /**
   * Optional open-mic recording gate. VAD frames and barge-in detection still
   * run, but returning `false` prevents this speech-start from beginning an
   * utterance buffer.
   */
  shouldStartUtterance?: (event: LiveSpeechStartGateEvent) => boolean;

  /** Maximum retries per chunk for transient `doTranscribe()` failures. Default: `1`. */
  maxRetries?: number;

  /** AbortSignal honored at construction and during the session lifetime. */
  abortSignal?: AbortSignal;

  /** Optional URL for the energy VAD AudioWorklet (escape hatch for strict CSP). */
  workletUrl?: string;

  /** Optional coarse activity callback for UI feedback and diagnostics. */
  onActivity?: (activity: LiveAudioActivity) => void;
}

// ═══════════════════════════════════════════════════════════════
// LISTENER REGISTRATION
// ═══════════════════════════════════════════════════════════════

/** Unsubscribe function returned by listener registration methods. */
export type LiveTranscriberUnsubscribe = () => void;

/** Listener for chunk emission. */
export type LiveChunkListener = (chunk: LiveChunk) => void;

/** Listener for utterance end. */
export type LiveUtteranceListener = (utterance: LiveUtterance) => void;

/** Listener for barge-in events. */
export type LiveBargeInListener = (event: BargeInEvent) => void;

/** Listener for errors. */
export type LiveErrorListener = (error: Error) => void;

/** Listener for state machine transitions. */
export type LiveStateChangeListener = (event: LiveTranscriberStateChangeEvent) => void;

// ═══════════════════════════════════════════════════════════════
// LIVE TRANSCRIBER CONTROLLER
// ═══════════════════════════════════════════════════════════════

/**
 * The streaming microphone-driven STT controller returned by
 * {@link createLiveTranscriber}.
 */
export interface LiveTranscriber {
  /** Current state of the controller. */
  readonly state: LiveTranscriberState;

  /** Begin listening (and, in push-to-talk, begin a fresh utterance). */
  start(): Promise<void>;

  /**
   * Stop listening.
   *
   * In push-to-talk, emits the final chunk + utterance for the current capture.
   * In open-mic, ends any in-progress utterance and stops VAD analysis.
   */
  stop(): Promise<void>;

  /**
   * Release all resources — `MediaStream`, `AudioContext`, VAD provider.
   * Idempotent. After dispose(), `start()` throws.
   */
  dispose(): Promise<void>;

  /** Register a partial-or-final chunk listener. */
  onChunk(listener: LiveChunkListener): LiveTranscriberUnsubscribe;

  /** Register an utterance-end listener. */
  onUtteranceEnd(listener: LiveUtteranceListener): LiveTranscriberUnsubscribe;

  /** Register a barge-in listener. Fires only when `bargeInWhilePlaying` was provided. */
  onBargeIn(listener: LiveBargeInListener): LiveTranscriberUnsubscribe;

  /** Register an error listener. */
  onError(listener: LiveErrorListener): LiveTranscriberUnsubscribe;

  /** Register a state-change listener. */
  onStateChange(listener: LiveStateChangeListener): LiveTranscriberUnsubscribe;
}
