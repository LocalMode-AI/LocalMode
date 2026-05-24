/**
 * Energy VAD Provider
 *
 * Built-in zero-dependency RMS-based voice activity detection running
 * inside an `AudioWorkletNode` (with `ScriptProcessorNode` fallback).
 *
 * Suitable for push-to-talk and basic open-mic use. For
 * production-quality open-mic, prefer the silero adapter shipped with
 * `@localmode/transformers`.
 *
 * @packageDocumentation
 */

import type { VADProvider, VADStartOptions, VADFrame } from './types.js';
import {
  registerEnergyVADWorklet,
  ENERGY_VAD_PROCESSOR_NAME,
} from './worklet.js';
import {
  createScriptProcessorVADNode,
  type ScriptProcessorVADNode,
} from './script-processor-fallback.js';

function debugVoice(marker: string, payload: Record<string, unknown>): void {
  if (!(globalThis as { __DEBUG_VOICE__?: boolean }).__DEBUG_VOICE__) return;
  // eslint-disable-next-line no-console
  console.info(`[bg-voice] ${marker} ${JSON.stringify(payload)}`);
}

/**
 * Configuration options for {@link EnergyVADProvider}.
 */
export interface EnergyVADProviderOptions {
  /** RMS threshold (in dBFS) above which audio counts as speech. Default: `-45`. */
  rmsThresholdDb?: number;

  /** Audio must remain above threshold for this duration before `speech-start`. Default: `200`. */
  speechMinDurationMs?: number;

  /** Sub-threshold duration that ends an utterance. Default: `700`. */
  silenceTimeoutMs?: number;

  /** Grace period after dipping below threshold before counting toward silence. Default: `200`. */
  hangoverMs?: number;

  /** Samples per VAD frame. Default: `512`. */
  frameSize?: number;

  /** Sample rate in Hz. Default: `16000`. */
  sampleRate?: number;

  /**
   * The audio context used for capture. Energy VAD requires a context
   * because it constructs an `AudioWorkletNode` (or `ScriptProcessorNode`)
   * and connects it to the supplied microphone source.
   */
  audioContext: AudioContext;

  /**
   * The audio source connected to the VAD node (e.g.,
   * `audioContext.createMediaStreamSource(stream)`).
   */
  source: AudioNode;

  /** Optional worklet URL override (strict-CSP environments). */
  workletUrl?: string;
}

/**
 * Built-in RMS-based VAD provider.
 *
 * Implements the {@link VADProvider} contract by running the energy VAD
 * AudioWorklet on the audio thread. Falls back to `ScriptProcessorNode`
 * when AudioWorklet is unavailable.
 */
export class EnergyVADProvider implements VADProvider {
  readonly provider = 'energy';
  readonly frameSize: number;
  readonly sampleRate: number;

  private readonly rmsThresholdDb: number;
  private readonly speechMinDurationMs: number;
  private readonly silenceTimeoutMs: number;
  private readonly hangoverMs: number;
  private readonly audioContext: AudioContext;
  private readonly source: AudioNode;
  private readonly workletUrl?: string;

  // Runtime state
  private workletNode: AudioWorkletNode | null = null;
  private workletSink: GainNode | null = null;
  private fallbackNode: ScriptProcessorVADNode | null = null;
  private fallbackUnsubscribe: (() => void) | null = null;
  private workletMessageHandler: ((event: MessageEvent) => void) | null = null;
  private startOptions: VADStartOptions | null = null;
  private isStarted = false;
  private isDisposed = false;

  // Speech-state machine
  private inSpeech = false;
  private speechStartCandidateAt: number | null = null; // ms wall clock
  private subThresholdSinceMs: number | null = null; // ms wall clock

  constructor(options: EnergyVADProviderOptions) {
    this.rmsThresholdDb = options.rmsThresholdDb ?? -45;
    this.speechMinDurationMs = options.speechMinDurationMs ?? 200;
    this.silenceTimeoutMs = options.silenceTimeoutMs ?? 700;
    this.hangoverMs = options.hangoverMs ?? 200;
    this.frameSize = options.frameSize ?? 512;
    this.sampleRate = options.sampleRate ?? 16000;
    this.audioContext = options.audioContext;
    this.source = options.source;
    this.workletUrl = options.workletUrl;
  }

  async start(options: VADStartOptions): Promise<void> {
    if (this.isDisposed) {
      throw new Error('EnergyVADProvider: cannot start a disposed provider');
    }
    if (this.isStarted) return;
    options.abortSignal?.throwIfAborted();
    this.startOptions = options;

    const supportsWorklet =
      typeof (this.audioContext as AudioContext & { audioWorklet?: AudioWorklet })
        .audioWorklet !== 'undefined';

    if (supportsWorklet) {
      try {
        await registerEnergyVADWorklet(
          this.audioContext,
          this.workletUrl ? { url: this.workletUrl } : undefined
        );
        options.abortSignal?.throwIfAborted();

        const node = new AudioWorkletNode(this.audioContext, ENERGY_VAD_PROCESSOR_NAME, {
          processorOptions: {
            frameSize: this.frameSize,
            sampleRate: this.sampleRate,
          },
        });
        this.workletNode = node;

        const handler = (event: MessageEvent) => {
          const data = event.data as { type?: string; samples?: Float32Array; rmsDb?: number; timestamp?: number };
          if (!data || data.type !== 'frame' || !data.samples) return;
          const frame: VADFrame = {
            samples: data.samples,
            rmsDb: typeof data.rmsDb === 'number' ? data.rmsDb : -200,
            timestamp: typeof data.timestamp === 'number' ? data.timestamp : Date.now(),
          };
          this.handleFrame(frame);
        };
        this.workletMessageHandler = handler;
        node.port.addEventListener('message', handler);
        node.port.start();

        const sink = this.audioContext.createGain();
        sink.gain.value = 0;
        this.source.connect(node);
        node.connect(sink);
        sink.connect(this.audioContext.destination);
        this.workletSink = sink;
        this.isStarted = true;
        return;
      } catch (err) {
        // Worklet registration / instantiation failed — fall through to ScriptProcessorNode.
        // eslint-disable-next-line no-console
        console.warn('[localmode/audio] AudioWorklet path failed; using ScriptProcessorNode fallback.', err);
      }
    }

    // ScriptProcessorNode fallback path
    const fallback = createScriptProcessorVADNode(this.audioContext, {
      frameSize: this.frameSize,
    });
    this.fallbackNode = fallback;
    this.fallbackUnsubscribe = fallback.onFrame((frame) => this.handleFrame(frame));
    this.source.connect(fallback.node);
    fallback.node.connect(this.audioContext.destination); // ScriptProcessor needs an output sink.
    this.isStarted = true;
  }

  /**
   * Process a frame manually. Useful for custom-driver scenarios where
   * the caller is supplying frames from somewhere other than the worklet.
   * The worklet/fallback path drives this internally via `handleFrame`.
   */
  processFrame(samples: Float32Array): void {
    if (!this.isStarted || this.isDisposed) return;
    let sumSq = 0;
    for (let i = 0; i < samples.length; i++) {
      sumSq += samples[i] * samples[i];
    }
    const rms = Math.sqrt(sumSq / Math.max(samples.length, 1));
    const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -200;
    this.handleFrame({ samples, rmsDb, timestamp: Date.now() });
  }

  async stop(): Promise<void> {
    if (!this.isStarted) return;
    this.isStarted = false;

    // Flush any pending speech-end so consumers receive a clean transition.
    if (this.inSpeech && this.startOptions) {
      this.inSpeech = false;
      debugVoice('vad.energy.stop-flush', { timestamp: Date.now() });
      this.startOptions.onSpeechEnd({ timestamp: Date.now(), rmsDb: -200 });
    }
    this.speechStartCandidateAt = null;
    this.subThresholdSinceMs = null;

    if (this.workletNode) {
      try {
        this.source.disconnect(this.workletNode);
      } catch {
        // Ignore — already disconnected.
      }
      if (this.workletMessageHandler) {
        this.workletNode.port.removeEventListener('message', this.workletMessageHandler);
        this.workletMessageHandler = null;
      }
      try {
        this.workletNode.port.close();
      } catch {
        // Ignore.
      }
      try {
        if (this.workletSink) this.workletNode.disconnect(this.workletSink);
        else this.workletNode.disconnect();
      } catch {
        // Ignore — already disconnected.
      }
      this.workletNode = null;
    }
    if (this.workletSink) {
      try {
        this.workletSink.disconnect();
      } catch {
        // Ignore.
      }
      this.workletSink = null;
    }

    if (this.fallbackNode) {
      this.fallbackUnsubscribe?.();
      this.fallbackUnsubscribe = null;
      try {
        this.source.disconnect(this.fallbackNode.node);
      } catch {
        // Ignore.
      }
      this.fallbackNode.dispose();
      this.fallbackNode = null;
    }
  }

  async dispose(): Promise<void> {
    if (this.isDisposed) return;
    await this.stop();
    this.isDisposed = true;
    this.startOptions = null;
  }

  // ───────────────────────────────────────────────────────────────
  // Speech-state machine
  // ───────────────────────────────────────────────────────────────

  private handleFrame(frame: VADFrame): void {
    if (!this.startOptions) return;

    // Notify any frame listener for callers that need raw audio (e.g. live transcriber).
    this.startOptions.onFrame?.(frame);

    const now = frame.timestamp;
    const aboveThreshold = frame.rmsDb >= this.rmsThresholdDb;

    if (aboveThreshold) {
      this.subThresholdSinceMs = null;

      if (!this.inSpeech) {
        if (this.speechStartCandidateAt === null) {
          this.speechStartCandidateAt = now;
          debugVoice('vad.energy.speech-candidate', {
            timestamp: now,
            rmsDb: frame.rmsDb,
            thresholdDb: this.rmsThresholdDb,
          });
        }
        if (now - this.speechStartCandidateAt >= this.speechMinDurationMs) {
          this.inSpeech = true;
          this.speechStartCandidateAt = null;
          debugVoice('vad.energy.speech-start', {
            timestamp: now,
            rmsDb: frame.rmsDb,
            thresholdDb: this.rmsThresholdDb,
          });
          this.startOptions.onSpeechStart({ timestamp: now, rmsDb: frame.rmsDb });
        }
      }
    } else {
      // Below threshold
      this.speechStartCandidateAt = null;
      if (this.inSpeech) {
        if (this.subThresholdSinceMs === null) {
          this.subThresholdSinceMs = now;
        }
        const subThresholdDuration = now - this.subThresholdSinceMs;
        // Wait for hangover + silenceTimeout combined.
        if (subThresholdDuration >= this.hangoverMs + this.silenceTimeoutMs) {
          this.inSpeech = false;
          this.subThresholdSinceMs = null;
          debugVoice('vad.energy.speech-end', {
            timestamp: now,
            rmsDb: frame.rmsDb,
            thresholdDb: this.rmsThresholdDb,
            subThresholdDuration,
          });
          this.startOptions.onSpeechEnd({ timestamp: now, rmsDb: frame.rmsDb });
        }
      }
    }
  }
}
