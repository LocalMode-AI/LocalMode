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

    if (lowerModelId.includes('minilm-l6') || lowerModelId.includes('bge-small') || lowerModelId.includes('arctic-embed-xs') || lowerModelId.includes('arctic-embed-s')) {
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

      // Suppress ONNX runtime warnings — both the JS-side `logLevel` and
      // the C++/WASM `logSeverityLevel` (3=ERROR) which silences the
      // `[W:onnxruntime:, session_state.cc:1280 VerifyEachNodeIsAssignedToAnEp]`
      // verbose mixed-EP warning that fires on every WebGPU/WASM split.
      env.backends.onnx.logLevel = 'error';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (env.backends.onnx as any).logSeverityLevel = 3;
      if (env.backends.onnx.wasm) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (env.backends.onnx.wasm as any).logLevel = 'error';
      }

      // MV3 extension contexts forbid "remotely hosted code", so the
      // default ONNX runtime fetch from jsdelivr CDN
      // (`https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.x/dist/...`)
      // fails silently with "Failed to fetch dynamically imported module".
      // When `chrome.runtime.getURL` is available, redirect the loader
      // to a locally-bundled `transformers-wasm/` path so the ONNX
      // runtime resolves under `chrome-extension://<id>/transformers-wasm/`.
      // No-op outside extension contexts.
      try {
        const cr = (
          globalThis as { chrome?: { runtime?: { getURL?: (p: string) => string } } }
        ).chrome?.runtime?.getURL;
        if (typeof cr === 'function') {
          const base = cr('transformers-wasm/');
          const onnx = env.backends.onnx as {
            wasm?: { wasmPaths?: string | Record<string, string> };
          };
          if (onnx.wasm) {
            onnx.wasm.wasmPaths = base;
          }
        }
      } catch {
        /* fall through to default CDN behavior */
      }

      // Explicit dtype silences "dtype not specified for model" log noise.
      const dtype: 'q8' | 'fp32' = this.settings.quantized === true ? 'q8' : 'fp32';
      const pipe = await pipeline('feature-extraction', this.baseModelId, {
        device: this.settings.device ?? 'auto',
        dtype,
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
