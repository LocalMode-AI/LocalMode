/**
 * Transformers Silero VAD Implementation
 *
 * Wraps the silero-vad ONNX model loaded via Transformers.js's `AutoModel`
 * loader and adapts it to the {@link VADProvider} contract from
 * `@localmode/core`. Wires the ONNX inference function into the
 * `SileroVADProvider` adapter so core stays zero-dependency.
 *
 * @packageDocumentation
 */

import type { VADProvider, VADStartOptions } from '@localmode/core';
import { SileroVADProvider } from '@localmode/core';
import type { ModelSettings, ModelLoadProgress, TransformersDevice } from '../types.js';

/**
 * Options for the silero VAD factory.
 *
 * Extends {@link ModelSettings} with VAD-specific knobs.
 */
export interface SileroVADSettings extends ModelSettings {
  /** Speech probability threshold (0..1). Default: `0.5`. */
  threshold?: number;

  /** Sub-threshold duration that ends an utterance (ms). Default: `700`. */
  silenceTimeoutMs?: number;
}

/**
 * Silero VAD provider for `@localmode/transformers`.
 *
 * Loads the ONNX session lazily on first `start()` (or `warmUp()`).
 * Internally delegates the per-frame state machine to the core
 * `SileroVADProvider` adapter, supplying it with an `inferFrame`
 * callback that runs the ONNX session.
 *
 * @example
 * ```ts
 * import { transformers } from '@localmode/transformers';
 * import { createLiveTranscriber } from '@localmode/core';
 *
 * const vad = transformers.vad('onnx-community/silero-vad');
 * const transcriber = await createLiveTranscriber({
 *   model: transformers.speechToText('onnx-community/moonshine-tiny-ONNX'),
 *   mode: 'open-mic',
 *   vad,
 * });
 * ```
 */
export class TransformersSileroVAD implements VADProvider {
  readonly provider = 'transformers';
  readonly frameSize = 512;
  readonly sampleRate = 16000;

  // Lazy-loaded ONNX session and adapter.
  private session: unknown | null = null;
  private loadPromise: Promise<unknown> | null = null;
  private adapter: SileroVADProvider | null = null;
  private isReadyFlag = false;

  // Silero hidden state per session — propagated frame-to-frame.
  private hiddenState: { h: Float32Array; c: Float32Array } | { state: Float32Array } | null = null;

  constructor(
    private baseModelId: string,
    private settings: SileroVADSettings = {}
  ) {}

  // ───────────────────────────────────────────────────────────────
  // Model loading & warm-up
  // ───────────────────────────────────────────────────────────────

  /**
   * Load and initialize the ONNX session. Idempotent.
   */
  async warmUp(): Promise<void> {
    if (this.session) return;
    if (this.loadPromise) {
      await this.loadPromise;
      return;
    }
    this.loadPromise = this.loadModel();
    try {
      this.session = await this.loadPromise;
      this.isReadyFlag = true;
    } finally {
      this.loadPromise = null;
    }
  }

  /** Returns true when the ONNX session has been loaded. */
  isReady(): boolean {
    return this.isReadyFlag;
  }

  private async loadModel(): Promise<unknown> {
    const { AutoModel, env } = (await import('@huggingface/transformers')) as unknown as {
      AutoModel: { from_pretrained(id: string, options?: Record<string, unknown>): Promise<unknown> };
      env: { backends: { onnx: { logLevel: string } } };
    };
    env.backends.onnx.logLevel = 'error';

    const device: TransformersDevice = this.settings.device ?? 'wasm';
    const session = await AutoModel.from_pretrained(this.baseModelId, {
      device,
      progress_callback: this.settings.onProgress as ((progress: ModelLoadProgress) => void) | undefined,
      // silero is small (~1.8MB); keep at default precision.
    });
    return session;
  }

  // ───────────────────────────────────────────────────────────────
  // VADProvider implementation
  // ───────────────────────────────────────────────────────────────

  async start(options: VADStartOptions): Promise<void> {
    await this.warmUp();
    options.abortSignal?.throwIfAborted();
    this.resetHiddenState();
    this.adapter = new SileroVADProvider({
      threshold: this.settings.threshold ?? 0.5,
      silenceTimeoutMs: this.settings.silenceTimeoutMs ?? 700,
      frameSize: this.frameSize,
      sampleRate: this.sampleRate,
      inferFrame: (samples, signal) => this.runInference(samples, signal),
    });
    await this.adapter.start(options);
  }

  processFrame(samples: Float32Array): void {
    this.adapter?.processFrame(samples);
  }

  async stop(): Promise<void> {
    await this.adapter?.stop();
    this.adapter = null;
    this.resetHiddenState();
  }

  async dispose(): Promise<void> {
    await this.stop();
    this.session = null;
    this.isReadyFlag = false;
  }

  // ───────────────────────────────────────────────────────────────
  // ONNX inference
  // ───────────────────────────────────────────────────────────────

  private resetHiddenState(): void {
    if (this.usesStateTensor()) {
      // silero-vad 6.x exports a single state tensor: [2, 1, 128].
      this.hiddenState = { state: new Float32Array(2 * 128) };
      return;
    }
    // Older exports use separate h/c tensors: [2, 1, 64].
    this.hiddenState = { h: new Float32Array(2 * 64), c: new Float32Array(2 * 64) };
  }

  private async runInference(samples: Float32Array, signal?: AbortSignal): Promise<number> {
    signal?.throwIfAborted();
    if (!this.session) throw new Error('Silero VAD session not loaded');
    if (!this.hiddenState) this.resetHiddenState();

    const transformers = (await import('@huggingface/transformers')) as unknown as {
      Tensor: new (
        type: string,
        data: Float32Array | BigInt64Array,
        dims: number[]
      ) => unknown;
    };
    const Tensor = transformers.Tensor;

    const input = new Tensor('float32', samples, [1, samples.length]);
    const sr = new Tensor('int64', BigInt64Array.from([16000n]), []);

    const session = this.session as {
      (inputs: Record<string, unknown>): Promise<{
        output: { data: Float32Array };
        hn?: { data: Float32Array };
        cn?: { data: Float32Array };
        stateN?: { data: Float32Array };
      }>;
    };
    const result = 'state' in this.hiddenState!
      ? await session({
        input,
        sr,
        state: new Tensor('float32', this.hiddenState.state, [2, 1, 128]),
      })
      : await session({
        input,
        sr,
        h: new Tensor('float32', this.hiddenState!.h, [2, 1, 64]),
        c: new Tensor('float32', this.hiddenState!.c, [2, 1, 64]),
      });
    signal?.throwIfAborted();

    // Propagate hidden state for next call.
    if (result.stateN) {
      this.hiddenState = { state: new Float32Array(result.stateN.data) };
    } else if (result.hn && result.cn) {
      this.hiddenState = {
        h: new Float32Array(result.hn.data),
        c: new Float32Array(result.cn.data),
      };
    }

    const probability = result.output.data[0] ?? 0;
    return probability;
  }

  private usesStateTensor(): boolean {
    return /(^|\/)silero-vad-6(\.|-|$)/i.test(this.baseModelId) ||
      /^BricksDisplay\/silero-vad/i.test(this.baseModelId);
  }
}

/**
 * Create a silero VAD provider from a model id.
 *
 * @example
 * ```ts
 * const vad = createSileroVAD('onnx-community/silero-vad');
 * ```
 */
export function createSileroVAD(modelId: string, settings?: SileroVADSettings): TransformersSileroVAD {
  return new TransformersSileroVAD(modelId, settings);
}
