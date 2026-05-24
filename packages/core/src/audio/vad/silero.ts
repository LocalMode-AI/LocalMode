/**
 * Silero VAD Adapter (core side)
 *
 * Adapter shape that accepts a user-supplied per-frame inference function.
 * Keeps `@localmode/core` zero-dependency — the actual ONNX inference is
 * provided by `@localmode/transformers` via its `transformers.vad()`
 * factory, which constructs a `SileroVADProvider` and wires the
 * `inferFrame` callback.
 *
 * @packageDocumentation
 */

import type { VADProvider, VADStartOptions, VADFrame } from './types.js';

/**
 * Configuration for {@link SileroVADProvider}.
 */
export interface SileroVADProviderOptions {
  /**
   * User-supplied per-frame inference function returning the speech
   * probability (0..1). Typically wired by `@localmode/transformers`.
   */
  inferFrame: (samples: Float32Array, abortSignal?: AbortSignal) => Promise<number>;

  /** Speech probability threshold. Default: `0.5`. */
  threshold?: number;

  /** Sub-threshold duration that ends an utterance (ms). Default: `700`. */
  silenceTimeoutMs?: number;

  /** Frame size silero expects (samples). Default: `512`. */
  frameSize?: number;

  /** Sample rate. Silero expects 16kHz. Default: `16000`. */
  sampleRate?: number;

  /** Optional hook called when the underlying ONNX session warms up. */
  onWarmUp?: () => Promise<void>;
}

/**
 * Adapter that wraps a user-supplied silero ONNX inference function in
 * the {@link VADProvider} contract.
 *
 * Custom drivers feed frames via {@link SileroVADProvider.processFrame}.
 * The adapter does not own an `AudioContext` — orchestrators (such as
 * `createLiveTranscriber()`) supply the audio frames from their own
 * worklet pipeline.
 */
export class SileroVADProvider implements VADProvider {
  readonly provider = 'silero';
  readonly frameSize: number;
  readonly sampleRate: number;

  private readonly inferFrame: (
    samples: Float32Array,
    abortSignal?: AbortSignal
  ) => Promise<number>;
  private readonly threshold: number;
  private readonly silenceTimeoutMs: number;
  private readonly onWarmUp?: () => Promise<void>;

  private startOptions: VADStartOptions | null = null;
  private isStarted = false;
  private isDisposed = false;

  // Speech-state machine
  private inSpeech = false;
  private subThresholdSinceMs: number | null = null;

  // In-flight inference tracking for clean shutdown.
  private inflightAbort: AbortController | null = null;
  private isProcessingFrame = false;
  private pendingSamples: Float32Array | null = null;

  constructor(options: SileroVADProviderOptions) {
    this.inferFrame = options.inferFrame;
    this.threshold = options.threshold ?? 0.5;
    this.silenceTimeoutMs = options.silenceTimeoutMs ?? 700;
    this.frameSize = options.frameSize ?? 512;
    this.sampleRate = options.sampleRate ?? 16000;
    this.onWarmUp = options.onWarmUp;
  }

  async start(options: VADStartOptions): Promise<void> {
    if (this.isDisposed) {
      throw new Error('SileroVADProvider: cannot start a disposed provider');
    }
    if (this.isStarted) return;
    options.abortSignal?.throwIfAborted();

    if (this.onWarmUp) {
      await this.onWarmUp();
      options.abortSignal?.throwIfAborted();
    }

    this.startOptions = options;
    this.isStarted = true;
    this.inflightAbort = new AbortController();
  }

  processFrame(samples: Float32Array): void {
    if (!this.isStarted || this.isDisposed || !this.startOptions) return;
    const copy = new Float32Array(samples);
    if (this.isProcessingFrame) {
      this.pendingSamples = copy;
      return;
    }
    void this.processSamples(copy);
  }

  private async processSamples(samples: Float32Array): Promise<void> {
    if (!this.isStarted || this.isDisposed || !this.startOptions) return;
    this.isProcessingFrame = true;

    const opts = this.startOptions;
    const signal = this.inflightAbort?.signal;
    const timestamp = Date.now();

    try {
      const probability = await this.inferFrame(samples, signal);
      if (!this.isStarted || this.isDisposed) return;
      const frame: VADFrame = {
        samples,
        rmsDb: -100, // Silero doesn't compute RMS — leave as a sentinel.
        timestamp,
      };
      opts.onFrame?.(frame);

      if (probability >= this.threshold) {
        this.subThresholdSinceMs = null;
        if (!this.inSpeech) {
          this.inSpeech = true;
          opts.onSpeechStart({ timestamp, rmsDb: frame.rmsDb });
        }
      } else if (this.inSpeech) {
        if (this.subThresholdSinceMs === null) {
          this.subThresholdSinceMs = timestamp;
        }
        if (timestamp - this.subThresholdSinceMs >= this.silenceTimeoutMs) {
          this.inSpeech = false;
          this.subThresholdSinceMs = null;
          opts.onSpeechEnd({ timestamp, rmsDb: frame.rmsDb });
        }
      }
    } catch (err) {
      // Keep VAD frame failures visible. A broken external VAD can otherwise
      // leave open-mic callers stuck in "listening" forever with no
      // transcription or surfaced error.
      // eslint-disable-next-line no-console
      console.warn('[localmode/audio] Silero VAD frame inference failed.', err);
    } finally {
      const pending = this.pendingSamples;
      this.pendingSamples = null;
      if (pending && this.isStarted && !this.isDisposed) {
        void this.processSamples(pending);
      } else {
        this.isProcessingFrame = false;
      }
    }
  }

  async stop(): Promise<void> {
    if (!this.isStarted) return;
    this.isStarted = false;

    this.inflightAbort?.abort();
    this.inflightAbort = null;
    this.pendingSamples = null;
    this.isProcessingFrame = false;

    if (this.inSpeech && this.startOptions) {
      this.inSpeech = false;
      this.startOptions.onSpeechEnd({ timestamp: Date.now(), rmsDb: -200 });
    }
    this.subThresholdSinceMs = null;
  }

  async dispose(): Promise<void> {
    if (this.isDisposed) return;
    await this.stop();
    this.isDisposed = true;
    this.startOptions = null;
  }
}
