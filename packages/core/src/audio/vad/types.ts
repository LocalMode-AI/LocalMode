/**
 * Voice Activity Detection (VAD) Types
 *
 * Provider-agnostic interfaces for VAD implementations used by
 * {@link createLiveTranscriber}.
 *
 * @packageDocumentation
 */

/**
 * A single audio frame as observed by a VAD implementation.
 */
export interface VADFrame {
  /** PCM samples in `[-1, 1]` at the provider's `sampleRate`. */
  samples: Float32Array;

  /** Wall-clock timestamp at frame production (ms since epoch). */
  timestamp: number;

  /** Frame RMS in dBFS (computed for convenience by the implementation). */
  rmsDb: number;
}

/**
 * Discriminated event union emitted by a VAD implementation when its
 * internal speech-state machine transitions.
 */
export type VADEvent =
  | { type: 'speech-start'; timestamp: number; rmsDb: number }
  | { type: 'speech-end'; timestamp: number; rmsDb: number };

/**
 * Options accepted by {@link VADProvider.start}.
 */
export interface VADStartOptions {
  /** Called the first time speech is detected after a `start()` or `speech-end`. */
  onSpeechStart: (event: { timestamp: number; rmsDb: number }) => void;

  /** Called when sub-threshold audio has lasted longer than the silence timeout. */
  onSpeechEnd: (event: { timestamp: number; rmsDb: number }) => void;

  /** Optional listener for every audio frame (mostly used by orchestrators that buffer audio themselves). */
  onFrame?: (frame: VADFrame) => void;

  /** AbortSignal honored during VAD startup. */
  abortSignal?: AbortSignal;
}

/**
 * The VAD provider contract.
 *
 * Custom implementations must satisfy this structural type. The
 * `EnergyVADProvider` (built-in) and the `silero-vad` adapter from
 * `@localmode/transformers` both implement it.
 *
 * @example
 * ```ts
 * import type { VADProvider } from '@localmode/core';
 *
 * class MyVAD implements VADProvider {
 *   readonly provider = 'custom';
 *   readonly frameSize = 512;
 *   readonly sampleRate = 16000;
 *   async start(options) { /* ... *\/ }
 *   processFrame(samples: Float32Array) { /* ... *\/ }
 *   async stop() { /* ... *\/ }
 *   async dispose() { /* ... *\/ }
 * }
 * ```
 */
export interface VADProvider {
  /** Provider identifier (e.g. `'energy'`, `'silero'`, `'custom'`). */
  readonly provider: string;

  /** Samples per frame the implementation expects. */
  readonly frameSize: number;

  /** Expected input sample rate in Hz. */
  readonly sampleRate: number;

  /** Begin VAD analysis. Must be called before any frames are processed. */
  start(options: VADStartOptions): Promise<void>;

  /** Process one frame of audio. Implementations may buffer or downsample internally. */
  processFrame(samples: Float32Array): void;

  /** Stop analysis. Pending speech-end events should be flushed before resolution. */
  stop(): Promise<void>;

  /** Release all resources. Idempotent. */
  dispose(): Promise<void>;
}
