/**
 * Transformers Fill-Mask Model Implementation
 *
 * Implements FillMaskModel interface using Transformers.js (BERT, RoBERTa, etc.)
 *
 * @packageDocumentation
 */

import type {
  FillMaskModel,
  FillMaskUsage,
  FillMaskPrediction,
} from '@localmode/core';
import type { ModelSettings, TransformersDevice, ModelLoadProgress } from '../types.js';

// Dynamic import types
type FillMaskPipeline = Awaited<
  ReturnType<typeof import('@huggingface/transformers').pipeline<'fill-mask'>>
>;

/**
 * Fill-mask model implementation using Transformers.js
 */
export class TransformersFillMaskModel implements FillMaskModel {
  readonly modelId: string;
  readonly provider = 'transformers';
  readonly maskToken: string = '[MASK]';

  private pipeline: FillMaskPipeline | null = null;
  private loadPromise: Promise<FillMaskPipeline> | null = null;

  constructor(
    private baseModelId: string,
    private settings: {
      device?: TransformersDevice;
      quantized?: boolean;
      maskToken?: string;
      onProgress?: (progress: ModelLoadProgress) => void;
    } = {}
  ) {
    this.modelId = `transformers:${baseModelId}`;
    if (settings.maskToken) {
      (this as { maskToken: string }).maskToken = settings.maskToken;
    }
  }

  private async loadPipeline(): Promise<FillMaskPipeline> {
    if (this.pipeline) {
      return this.pipeline;
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = (async () => {
      const { pipeline } = await import('@huggingface/transformers');

      const pipe = await pipeline('fill-mask', this.baseModelId, {
        device: this.settings.device ?? 'auto',
        dtype: this.settings.quantized !== false ? 'q8' : 'fp32',
        progress_callback: this.settings.onProgress,
      });

      this.pipeline = pipe;
      return pipe;
    })();

    return this.loadPromise;
  }

  async doFillMask(options: {
    texts: string[];
    topK?: number;
    abortSignal?: AbortSignal;
    providerOptions?: Record<string, Record<string, unknown>>;
  }): Promise<{
    results: FillMaskPrediction[][];
    usage: FillMaskUsage;
  }> {
    const { texts, topK = 5, abortSignal } = options;
    const startTime = Date.now();

    abortSignal?.throwIfAborted();

    const pipe = await this.loadPipeline();

    abortSignal?.throwIfAborted();

    const allResults: FillMaskPrediction[][] = [];
    let totalInputTokens = 0;

    for (const text of texts) {
      abortSignal?.throwIfAborted();

      // Fill-mask pipeline returns array of { token_str, score, ... }
      const output = await pipe(text, { top_k: topK });

      const results = (Array.isArray(output) ? output : [output]) as Array<Record<string, unknown>>;

      const predictions: FillMaskPrediction[] = results.map((pred) => ({
        token: String(pred.token_str ?? ''),
        score: Number(pred.score ?? 0),
        sequence: String(pred.sequence ?? ''),
      }));

      allResults.push(predictions);
      totalInputTokens += text.split(/\s+/).length;
    }

    return {
      results: allResults,
      usage: {
        inputTokens: totalInputTokens,
        durationMs: Date.now() - startTime,
      },
    };
  }
}

/**
 * Create a fill-mask model using Transformers.js
 */
export function createFillMaskModel(
  modelId: string,
  settings?: ModelSettings
): TransformersFillMaskModel {
  return new TransformersFillMaskModel(modelId, settings);
}

