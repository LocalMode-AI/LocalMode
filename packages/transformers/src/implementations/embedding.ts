/**
 * Transformers Embedding Model Implementation
 *
 * Implements EmbeddingModel interface using Transformers.js
 *
 * @packageDocumentation
 */

import type { EmbeddingModel } from '@localmode/core';
import type { ModelSettings, TransformersDevice, ModelLoadProgress } from '../types.js';

// Dynamic import to avoid bundling transformers.js if not used
type FeatureExtractionPipeline = Awaited<
  ReturnType<typeof import('@huggingface/transformers').pipeline<'feature-extraction'>>
>;

/**
 * Embedding model implementation using Transformers.js
 */
export class TransformersEmbeddingModel implements EmbeddingModel {
  readonly modelId: string;
  readonly provider = 'transformers';
  readonly dimensions: number;
  readonly maxEmbeddingsPerCall = 128;
  readonly supportsParallelCalls = false;

  private pipeline: FeatureExtractionPipeline | null = null;
  private loadPromise: Promise<FeatureExtractionPipeline> | null = null;

  constructor(
    private baseModelId: string,
    private settings: {
      device?: TransformersDevice;
      quantized?: boolean;
      onProgress?: (progress: ModelLoadProgress) => void;
    } = {}
  ) {
    this.modelId = `transformers:${baseModelId}`;
    // Common embedding dimensions - will be corrected after model loads
    this.dimensions = this.getDimensionsFromModelId(baseModelId);
  }

  /**
   * Estimate dimensions from model ID.
   */
  private getDimensionsFromModelId(modelId: string): number {
    const lowerModelId = modelId.toLowerCase();

    if (lowerModelId.includes('minilm-l6') || lowerModelId.includes('bge-small')) {
      return 384;
    }
    if (lowerModelId.includes('mpnet') || lowerModelId.includes('bge-base')) {
      return 768;
    }
    if (lowerModelId.includes('e5-large') || lowerModelId.includes('bge-large')) {
      return 1024;
    }

    // Default to 384 for unknown models
    return 384;
  }

  /**
   * Load the pipeline if not already loaded.
   */
  private async loadPipeline(): Promise<FeatureExtractionPipeline> {
    if (this.pipeline) {
      return this.pipeline;
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');

      // Suppress ONNX runtime warnings about node execution providers
      // These are informational and don't affect functionality
      env.backends.onnx.logSeverityLevel = 3; // Only show errors, suppress warnings

      const pipe = await pipeline('feature-extraction', this.baseModelId, {
        device: this.settings.device ?? 'auto',
        dtype: this.settings.quantized !== false ? 'q8' : 'fp32',
        progress_callback: this.settings.onProgress,
      });

      this.pipeline = pipe;
      return pipe;
    })();

    return this.loadPromise;
  }

  async doEmbed(options: {
    values: string[];
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
    providerOptions?: Record<string, Record<string, unknown>>;
  }): Promise<{
    embeddings: Float32Array[];
    usage: { tokens: number };
    response: { id?: string; modelId: string; timestamp: Date };
  }> {
    const { values, abortSignal } = options;

    // Check for cancellation
    abortSignal?.throwIfAborted();

    const pipe = await this.loadPipeline();

    // Check again after loading
    abortSignal?.throwIfAborted();

    const embeddings: Float32Array[] = [];
    let totalTokens = 0;

    // Process each value
    for (const value of values) {
      abortSignal?.throwIfAborted();

      // Run the pipeline
      const output = await pipe(value, {
        pooling: 'mean',
        normalize: true,
      });

      // Extract the embedding from the output
      // The output is a Tensor, we need to get the data
      const embeddingData = output.data;
      const embedding = new Float32Array(embeddingData as ArrayLike<number>);

      embeddings.push(embedding);

      // Estimate tokens (rough approximation)
      totalTokens += Math.ceil(value.split(/\s+/).length * 1.3);
    }

    return {
      embeddings,
      usage: { tokens: totalTokens },
      response: {
        modelId: this.modelId,
        timestamp: new Date(),
      },
    };
  }
}

/**
 * Create an embedding model using Transformers.js
 */
export function createEmbeddingModel(
  modelId: string,
  settings?: ModelSettings
): TransformersEmbeddingModel {
  return new TransformersEmbeddingModel(modelId, settings);
}
