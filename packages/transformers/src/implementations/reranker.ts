/**
 * Transformers Reranker Model Implementation
 *
 * Implements RerankerModel interface using Transformers.js
 *
 * @packageDocumentation
 */

import type { RerankerModel, RankedDocument, RerankUsage } from '@localmode/core';
import type { ModelSettings, TransformersDevice, ModelLoadProgress } from '../types.js';

// Rerankers typically use text-classification pipeline with query-document pairs
type TextClassificationPipeline = Awaited<
  ReturnType<typeof import('@huggingface/transformers').pipeline<'text-classification'>>
>;

/**
 * Reranker model implementation using Transformers.js
 *
 * Rerankers score query-document pairs for relevance. They're typically
 * used after initial retrieval to improve result quality.
 */
export class TransformersRerankerModel implements RerankerModel {
  readonly modelId: string;
  readonly provider = 'transformers';

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

      // Rerankers use text-classification pipeline with special input format
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

  async doRerank(options: {
    query: string;
    documents: string[];
    topK?: number;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
    providerOptions?: Record<string, Record<string, unknown>>;
  }): Promise<{
    results: RankedDocument[];
    usage: RerankUsage;
  }> {
    const { query, documents, topK, abortSignal } = options;
    const startTime = Date.now();

    abortSignal?.throwIfAborted();

    const pipe = await this.loadPipeline();

    abortSignal?.throwIfAborted();

    // Score each query-document pair
    const scoredDocs: Array<{ index: number; score: number; text: string }> = [];
    let totalTokens = 0;

    for (let i = 0; i < documents.length; i++) {
      abortSignal?.throwIfAborted();

      const doc = documents[i];

      // Create query-document pair input
      // Most rerankers expect: [CLS] query [SEP] document [SEP]
      // Transformers.js handles this when we pass an array pair
      const output = await pipe([query, doc]);

      // Get the relevance score
      // For cross-encoders, we typically want the score for the positive class
      const result = Array.isArray(output) ? output[0] : output;
      const prediction = result as { label: string; score: number };

      // Some models output logits, some output probabilities
      // We normalize to 0-1 range
      let score = prediction.score;

      // If the label indicates this is a "not relevant" prediction, invert
      if (
        prediction.label.toLowerCase().includes('not') ||
        prediction.label === 'LABEL_0' ||
        prediction.label === '0'
      ) {
        score = 1 - score;
      }

      scoredDocs.push({
        index: i,
        score,
        text: doc,
      });

      // Estimate tokens
      totalTokens += Math.ceil((query.split(/\s+/).length + doc.split(/\s+/).length) * 1.3);
    }

    // Sort by score descending
    scoredDocs.sort((a, b) => b.score - a.score);

    // Apply topK if specified
    const results = topK ? scoredDocs.slice(0, topK) : scoredDocs;

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
 * Create a reranker model using Transformers.js
 */
export function createRerankerModel(
  modelId: string,
  settings?: ModelSettings
): TransformersRerankerModel {
  return new TransformersRerankerModel(modelId, settings);
}

