/**
 * @file embedding-model.ts
 * @description Adapter wrapping a LocalMode EmbeddingModel as an AI SDK EmbeddingModelV3
 */

import type { EmbeddingModel } from '@localmode/core';
import type {
  EmbeddingModelV3,
  EmbeddingModelV3CallOptions,
  EmbeddingModelV3Result,
} from '@ai-sdk/provider';

/**
 * Wraps a `@localmode/core` EmbeddingModel as an AI SDK EmbeddingModelV3.
 *
 * Converts Float32Array embeddings to number[] arrays as required by the AI SDK.
 *
 * @example
 * ```ts
 * import { transformers } from '@localmode/transformers';
 * import { embed } from 'ai';
 *
 * const model = new LocalModeEmbeddingModel(
 *   transformers.embedding('Xenova/bge-small-en-v1.5')
 * );
 * const { embedding } = await embed({ model, value: 'Hello world' });
 * ```
 */
export class LocalModeEmbeddingModel implements EmbeddingModelV3 {
  readonly specificationVersion = 'v3' as const;
  readonly provider = 'localmode';
  readonly modelId: string;
  readonly maxEmbeddingsPerCall: number | undefined;
  readonly supportsParallelCalls: boolean;

  /** @internal The wrapped LocalMode embedding model */
  private readonly model: EmbeddingModel;

  /**
   * @param model - A LocalMode EmbeddingModel instance to wrap
   */
  constructor(model: EmbeddingModel) {
    this.model = model;
    this.modelId = model.modelId;
    this.maxEmbeddingsPerCall = model.maxEmbeddingsPerCall;
    this.supportsParallelCalls = model.supportsParallelCalls;
  }

  /**
   * Generate embeddings for the given values.
   *
   * @param options - AI SDK embedding call options
   * @returns AI SDK embedding result with number[][] embeddings
   */
  async doEmbed(options: EmbeddingModelV3CallOptions): Promise<EmbeddingModelV3Result> {
    const result = await this.model.doEmbed({
      values: options.values,
      abortSignal: options.abortSignal,
    });

    // Convert Float32Array[] to number[][] as required by AI SDK
    const embeddings = result.embeddings.map((embedding) => Array.from(embedding));

    return {
      embeddings,
      usage: { tokens: result.usage.tokens },
      warnings: [],
    };
  }
}
