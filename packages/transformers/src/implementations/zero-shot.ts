/**
 * Transformers Zero-Shot Classification Model Implementation
 *
 * Implements ZeroShotClassificationModel interface using Transformers.js
 *
 * @packageDocumentation
 */

import type { ZeroShotClassificationModel, ClassificationUsage } from '@localmode/core';
import type { ModelSettings, TransformersDevice, ModelLoadProgress } from '../types.js';

// Dynamic import types
type ZeroShotClassificationPipeline = Awaited<
  ReturnType<typeof import('@huggingface/transformers').pipeline<'zero-shot-classification'>>
>;

/**
 * Zero-shot classification model implementation using Transformers.js
 */
export class TransformersZeroShotModel implements ZeroShotClassificationModel {
  readonly modelId: string;
  readonly provider = 'transformers';

  private pipeline: ZeroShotClassificationPipeline | null = null;
  private loadPromise: Promise<ZeroShotClassificationPipeline> | null = null;

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

  private async loadPipeline(): Promise<ZeroShotClassificationPipeline> {
    if (this.pipeline) {
      return this.pipeline;
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = (async () => {
      const { pipeline } = await import('@huggingface/transformers');

      const pipe = await pipeline('zero-shot-classification', this.baseModelId, {
        device: this.settings.device ?? 'auto',
        dtype: this.settings.quantized !== false ? 'q8' : 'fp32',
        progress_callback: this.settings.onProgress,
      });

      this.pipeline = pipe;
      return pipe;
    })();

    return this.loadPromise;
  }

  async doClassifyZeroShot(options: {
    texts: string[];
    candidateLabels: string[];
    multiLabel?: boolean;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
    providerOptions?: Record<string, Record<string, unknown>>;
  }): Promise<{
    results: Array<{ labels: string[]; scores: number[] }>;
    usage: ClassificationUsage;
  }> {
    const { texts, candidateLabels, multiLabel, abortSignal } = options;
    const startTime = Date.now();

    abortSignal?.throwIfAborted();

    const pipe = await this.loadPipeline();

    abortSignal?.throwIfAborted();

    const results: Array<{ labels: string[]; scores: number[] }> = [];
    let totalTokens = 0;

    for (const text of texts) {
      abortSignal?.throwIfAborted();

      const output = await pipe(text, candidateLabels, {
        multi_label: multiLabel ?? false,
      });

      // Output format: { sequence, labels: string[], scores: number[] }
      const result = output as { sequence: string; labels: string[]; scores: number[] };

      results.push({
        labels: result.labels,
        scores: result.scores,
      });

      totalTokens += Math.ceil(text.split(/\s+/).length * 1.3);
    }

    return {
      results,
      usage: {
        inputTokens: totalTokens,
        durationMs: Date.now() - startTime,
      },
    };
  }
}

/**
 * Create a zero-shot classification model using Transformers.js
 */
export function createZeroShotModel(
  modelId: string,
  settings?: ModelSettings
): TransformersZeroShotModel {
  return new TransformersZeroShotModel(modelId, settings);
}

