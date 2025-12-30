/**
 * Transformers Classification Model Implementation
 *
 * Implements ClassificationModel interface using Transformers.js
 *
 * @packageDocumentation
 */

import type { ClassificationModel, ClassificationResultItem, ClassificationUsage } from '@localmode/core';
import type { ModelSettings, TransformersDevice, ModelLoadProgress } from '../types.js';

// Dynamic import types
type TextClassificationPipeline = Awaited<
  ReturnType<typeof import('@huggingface/transformers').pipeline<'text-classification'>>
>;

/**
 * Text classification model implementation using Transformers.js
 */
export class TransformersClassificationModel implements ClassificationModel {
  readonly modelId: string;
  readonly provider = 'transformers';
  readonly labels: string[] = [];

  private pipeline: TextClassificationPipeline | null = null;
  private loadPromise: Promise<TextClassificationPipeline> | null = null;

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

  private async loadPipeline(): Promise<TextClassificationPipeline> {
    if (this.pipeline) {
      return this.pipeline;
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = (async () => {
      const { pipeline } = await import('@huggingface/transformers');

      const pipe = await pipeline('text-classification', this.baseModelId, {
        device: this.settings.device ?? 'auto',
        dtype: this.settings.quantized !== false ? 'q8' : 'fp32',
        progress_callback: this.settings.onProgress,
      });

      this.pipeline = pipe;
      return pipe;
    })();

    return this.loadPromise;
  }

  async doClassify(options: {
    texts: string[];
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
    providerOptions?: Record<string, Record<string, unknown>>;
  }): Promise<{
    results: ClassificationResultItem[];
    usage: ClassificationUsage;
  }> {
    const { texts, abortSignal } = options;
    const startTime = Date.now();

    abortSignal?.throwIfAborted();

    const pipe = await this.loadPipeline();

    abortSignal?.throwIfAborted();

    const results: ClassificationResultItem[] = [];
    let totalTokens = 0;

    for (const text of texts) {
      abortSignal?.throwIfAborted();

      const output = await pipe(text, { top_k: 5 });

      // Output is an array of { label, score }
      const predictions = Array.isArray(output) ? output : [output];

      // Get the top prediction
      const top = predictions[0] as { label: string; score: number };

      // Build allScores map
      const allScores: Record<string, number> = {};
      for (const pred of predictions as Array<{ label: string; score: number }>) {
        allScores[pred.label] = pred.score;
      }

      results.push({
        label: top.label,
        score: top.score,
        allScores,
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
 * Create a text classification model using Transformers.js
 */
export function createClassificationModel(
  modelId: string,
  settings?: ModelSettings
): TransformersClassificationModel {
  return new TransformersClassificationModel(modelId, settings);
}

