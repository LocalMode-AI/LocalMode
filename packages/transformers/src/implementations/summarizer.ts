/**
 * Transformers Summarization Model Implementation
 *
 * Implements SummarizationModel interface using Transformers.js (BART, T5, etc.)
 *
 * @packageDocumentation
 */

import type {
  SummarizationModel,
  SummarizationUsage,
} from '@localmode/core';
import type { ModelSettings, TransformersDevice, ModelLoadProgress } from '../types.js';

// Dynamic import types
type SummarizationPipeline = Awaited<
  ReturnType<typeof import('@huggingface/transformers').pipeline<'summarization'>>
>;

/**
 * Summarization model implementation using Transformers.js
 */
export class TransformersSummarizationModel implements SummarizationModel {
  readonly modelId: string;
  readonly provider = 'transformers';

  private pipeline: SummarizationPipeline | null = null;
  private loadPromise: Promise<SummarizationPipeline> | null = null;

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

  private async loadPipeline(): Promise<SummarizationPipeline> {
    if (this.pipeline) {
      return this.pipeline;
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = (async () => {
      const { pipeline } = await import('@huggingface/transformers');

      const pipe = await pipeline('summarization', this.baseModelId, {
        device: this.settings.device ?? 'auto',
        dtype: this.settings.quantized !== false ? 'q8' : 'fp32',
        progress_callback: this.settings.onProgress,
      });

      this.pipeline = pipe;
      return pipe;
    })();

    return this.loadPromise;
  }

  async doSummarize(options: {
    texts: string[];
    maxLength?: number;
    minLength?: number;
    mode?: 'extractive' | 'abstractive';
    abortSignal?: AbortSignal;
    providerOptions?: Record<string, Record<string, unknown>>;
  }): Promise<{
    summaries: string[];
    usage: SummarizationUsage;
  }> {
    const { texts, maxLength, minLength, abortSignal } = options;
    const startTime = Date.now();

    abortSignal?.throwIfAborted();

    const pipe = await this.loadPipeline();

    abortSignal?.throwIfAborted();

    const pipelineOptions: Record<string, unknown> = {};
    if (maxLength !== undefined) {
      pipelineOptions.max_length = maxLength;
    }
    if (minLength !== undefined) {
      pipelineOptions.min_length = minLength;
    }

    const summaries: string[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (const text of texts) {
      abortSignal?.throwIfAborted();

      // Summarization pipeline returns { summary_text: string }
      const output = await pipe(text, pipelineOptions as unknown as Parameters<typeof pipe>[1]);

      let summaryText: string;
      if (Array.isArray(output)) {
        summaryText = (output[0] as { summary_text: string }).summary_text;
      } else {
        summaryText = (output as { summary_text: string }).summary_text;
      }

      summaries.push(summaryText);
      totalInputTokens += text.split(/\s+/).length;
      totalOutputTokens += summaryText.split(/\s+/).length;
    }

    return {
      summaries,
      usage: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        durationMs: Date.now() - startTime,
      },
    };
  }
}

/**
 * Create a summarization model using Transformers.js
 */
export function createSummarizationModel(
  modelId: string,
  settings?: ModelSettings
): TransformersSummarizationModel {
  return new TransformersSummarizationModel(modelId, settings);
}

