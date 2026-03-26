/**
 * Transformers Audio Classification Model Implementation
 *
 * Implements AudioClassificationModel and ZeroShotAudioClassificationModel
 * interfaces using Transformers.js
 *
 * @packageDocumentation
 */

import type {
  AudioClassificationModel,
  ZeroShotAudioClassificationModel,
  AudioInput,
  AudioUsage,
  AudioClassificationResultItem,
  ZeroShotAudioClassificationResultItem,
} from '@localmode/core';
import type { ModelSettings, TransformersDevice, ModelLoadProgress } from '../types.js';

// Dynamic import types
type AudioClassificationPipeline = Awaited<
  ReturnType<typeof import('@huggingface/transformers').pipeline<'audio-classification'>>
>;

type ZeroShotAudioClassificationPipeline = Awaited<
  ReturnType<typeof import('@huggingface/transformers').pipeline<'zero-shot-audio-classification'>>
>;

/**
 * Audio classification model implementation using Transformers.js
 */
export class TransformersAudioClassificationModel implements AudioClassificationModel {
  readonly modelId: string;
  readonly provider = 'transformers';

  private pipeline: AudioClassificationPipeline | null = null;
  private loadPromise: Promise<AudioClassificationPipeline> | null = null;

  constructor(
    private baseModelId: string,
    private settings: {
      device?: TransformersDevice;
      quantized?: boolean;
      onProgress?: (progress: ModelLoadProgress) => void;
    } = {}
  ) {
    this.modelId = `transformers:${baseModelId}`;
  }

  private async loadPipeline(): Promise<AudioClassificationPipeline> {
    if (this.pipeline) {
      return this.pipeline;
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');

      env.backends.onnx.logLevel = 'error';

      const pipe = await pipeline('audio-classification', this.baseModelId, {
        device: this.settings.device ?? 'auto',
        dtype: this.settings.quantized === true ? 'q8' : undefined,
        progress_callback: this.settings.onProgress,
      });

      this.pipeline = pipe;
      return pipe;
    })();

    return this.loadPromise;
  }

  private prepareAudio(audio: AudioInput): Blob | Float32Array {
    if (audio instanceof Float32Array) {
      return audio;
    }
    if (audio instanceof Blob) {
      return audio;
    }
    if (audio instanceof ArrayBuffer) {
      return new Blob([audio], { type: 'audio/wav' });
    }
    return audio as Blob;
  }

  async doClassify(options: {
    audio: AudioInput[];
    topK?: number;
    abortSignal?: AbortSignal;
    providerOptions?: Record<string, Record<string, unknown>>;
  }): Promise<{
    results: AudioClassificationResultItem[][];
    usage: AudioUsage;
  }> {
    const { audio, topK = 5, abortSignal } = options;
    const startTime = Date.now();

    abortSignal?.throwIfAborted();

    const pipe = await this.loadPipeline();

    abortSignal?.throwIfAborted();

    const results: AudioClassificationResultItem[][] = [];

    for (const audioInput of audio) {
      abortSignal?.throwIfAborted();

      const prepared = this.prepareAudio(audioInput);
      const output = await pipe(prepared as unknown as string, { top_k: topK });

      const items = (Array.isArray(output) ? output : [output]) as Array<{
        label: string;
        score: number;
      }>;

      results.push(
        items.map((item) => ({
          label: String(item.label),
          score: Number(item.score),
        }))
      );
    }

    return {
      results,
      usage: {
        durationMs: Date.now() - startTime,
      },
    };
  }
}

/**
 * Zero-shot audio classification model implementation using Transformers.js (CLAP)
 */
export class TransformersZeroShotAudioClassificationModel
  implements ZeroShotAudioClassificationModel
{
  readonly modelId: string;
  readonly provider = 'transformers';

  private pipeline: ZeroShotAudioClassificationPipeline | null = null;
  private loadPromise: Promise<ZeroShotAudioClassificationPipeline> | null = null;

  constructor(
    private baseModelId: string,
    private settings: {
      device?: TransformersDevice;
      quantized?: boolean;
      onProgress?: (progress: ModelLoadProgress) => void;
    } = {}
  ) {
    this.modelId = `transformers:${baseModelId}`;
  }

  private async loadPipeline(): Promise<ZeroShotAudioClassificationPipeline> {
    if (this.pipeline) {
      return this.pipeline;
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');

      env.backends.onnx.logLevel = 'error';

      const pipe = await pipeline('zero-shot-audio-classification', this.baseModelId, {
        device: this.settings.device ?? 'auto',
        dtype: this.settings.quantized === true ? 'q8' : undefined,
        progress_callback: this.settings.onProgress,
      });

      this.pipeline = pipe;
      return pipe;
    })();

    return this.loadPromise;
  }

  private prepareAudio(audio: AudioInput): Blob | Float32Array {
    if (audio instanceof Float32Array) {
      return audio;
    }
    if (audio instanceof Blob) {
      return audio;
    }
    if (audio instanceof ArrayBuffer) {
      return new Blob([audio], { type: 'audio/wav' });
    }
    return audio as Blob;
  }

  async doClassifyZeroShot(options: {
    audio: AudioInput[];
    candidateLabels: string[];
    abortSignal?: AbortSignal;
    providerOptions?: Record<string, Record<string, unknown>>;
  }): Promise<{
    results: ZeroShotAudioClassificationResultItem[];
    usage: AudioUsage;
  }> {
    const { audio, candidateLabels, abortSignal } = options;
    const startTime = Date.now();

    abortSignal?.throwIfAborted();

    const pipe = await this.loadPipeline();

    abortSignal?.throwIfAborted();

    const results: ZeroShotAudioClassificationResultItem[] = [];

    for (const audioInput of audio) {
      abortSignal?.throwIfAborted();

      const prepared = this.prepareAudio(audioInput);
      const output = await pipe(prepared as unknown as string, candidateLabels);

      const items = (Array.isArray(output) ? output : [output]) as Array<{
        label: string;
        score: number;
      }>;

      // Sort by score descending
      items.sort((a, b) => b.score - a.score);

      results.push({
        labels: items.map((item) => String(item.label)),
        scores: items.map((item) => Number(item.score)),
      });
    }

    return {
      results,
      usage: {
        durationMs: Date.now() - startTime,
      },
    };
  }
}

/**
 * Create an audio classification model using Transformers.js
 */
export function createAudioClassificationModel(
  modelId: string,
  settings?: ModelSettings
): TransformersAudioClassificationModel {
  return new TransformersAudioClassificationModel(modelId, settings);
}

/**
 * Create a zero-shot audio classification model using Transformers.js (CLAP)
 */
export function createZeroShotAudioClassificationModel(
  modelId: string,
  settings?: ModelSettings
): TransformersZeroShotAudioClassificationModel {
  return new TransformersZeroShotAudioClassificationModel(modelId, settings);
}
