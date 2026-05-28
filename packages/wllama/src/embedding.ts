/**
 * wllama Embedding Model Implementation
 *
 * Implements EmbeddingModel interface using wllama v3's createEmbedding() API.
 * Enables GGUF embedding models (e.g., nomic-embed, mxbai-embed) in the browser.
 *
 * @packageDocumentation
 */

import type {
  EmbeddingModel,
  DoEmbedOptions,
  DoEmbedResult,
} from '@localmode/core';
import { ModelLoadError, EmbeddingError } from '@localmode/core';
import type { WllamaEmbeddingSettings, WllamaLoadProgress } from './types.js';
import { WLLAMA_MODELS } from './models.js';
import { isCrossOriginIsolated, resolveModelUrl } from './utils.js';
import { parseGGUFMetadata } from './gguf.js';
import { resolveWasmPath } from './model.js';

type WllamaInstance = InstanceType<Awaited<typeof import('@wllama/wllama')>['Wllama']>;

/**
 * wllama Embedding Model implementation.
 *
 * Uses wllama v3's createEmbedding() API with GGUF embedding models.
 *
 * @example
 * ```ts
 * import { WllamaEmbeddingModel } from '@localmode/wllama';
 * import { embed } from '@localmode/core';
 *
 * const model = new WllamaEmbeddingModel(
 *   'nomic-ai/nomic-embed-text-v1.5-GGUF:nomic-embed-text-v1.5.Q4_K_M.gguf'
 * );
 *
 * const { embedding } = await embed({ model, value: 'Hello world' });
 * ```
 */
export class WllamaEmbeddingModel implements EmbeddingModel {
  readonly modelId: string;
  readonly provider = 'wllama';
  readonly dimensions: number;
  readonly maxEmbeddingsPerCall = 1;
  readonly supportsParallelCalls = false;

  private wllamaInstance: WllamaInstance | null = null;
  private loadPromise: Promise<WllamaInstance> | null = null;
  private baseModelId: string;
  private settings: WllamaEmbeddingSettings;

  constructor(baseModelId: string, settings: WllamaEmbeddingSettings = {}) {
    this.baseModelId = baseModelId;
    this.settings = settings;
    this.modelId = `wllama:${baseModelId}`;
    this.dimensions = settings.dimensions ?? 0;
  }

  /** @internal */
  private async loadModel(): Promise<WllamaInstance> {
    if (this.wllamaInstance) return this.wllamaInstance;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      try {
        const cdnBase = 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.2.3';
        const dynamicImport = new Function('u', 'return import(u)') as (url: string) => Promise<{ Wllama: new (config: { default: string }) => WllamaInstance }>;
        const { Wllama } = await dynamicImport(`${cdnBase}/esm/index.js`);

        const catalogEntry = (WLLAMA_MODELS as Record<string, { url: string; dimensions?: number }>)[this.baseModelId];
        const modelUrl = resolveModelUrl(
          catalogEntry ? catalogEntry.url : this.baseModelId,
          this.settings.modelUrl
        );

        // Auto-detect dimensions from GGUF metadata if not set
        if (!this.settings.dimensions && !this.dimensions) {
          try {
            if (catalogEntry?.dimensions) {
              (this as { dimensions: number }).dimensions = catalogEntry.dimensions;
            } else {
              const metadata = await parseGGUFMetadata(modelUrl);
              if (metadata.embeddingLength && metadata.embeddingLength > 0) {
                (this as { dimensions: number }).dimensions = metadata.embeddingLength;
              }
            }
          } catch { /* fall back to 0 — will be set after first embed */ }
        }

        let numThreads = this.settings.numThreads;
        if (numThreads === undefined) {
          numThreads = isCrossOriginIsolated()
            ? (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 1)
            : 1;
        }

        this.settings.onProgress?.({
          status: 'initiate',
          text: `Loading embedding model: ${this.baseModelId}`,
        });

        const wllamaInstance = new Wllama(resolveWasmPath());

        // Resolve GPU layers
        let nGpuLayers: number | undefined;
        if (this.settings.nGpuLayers !== undefined) {
          nGpuLayers = this.settings.nGpuLayers;
        } else if (this.settings.useWebGPU === true || this.settings.useWebGPU === 'auto') {
          try {
            const { isWebGPUSupported } = require('@localmode/core') as { isWebGPUSupported: () => boolean };
            if (isWebGPUSupported()) nGpuLayers = -1;
          } catch { /* core not available */ }
        }

        await wllamaInstance.loadModelFromUrl(modelUrl, {
          n_threads: numThreads,
          n_ctx: this.settings.contextLength ?? 512,
          embeddings: true,
          ...(nGpuLayers !== undefined ? { n_gpu_layers: nGpuLayers } : {}),
          progressCallback: (opts: { loaded: number; total: number }) => {
            if (this.settings.onProgress) {
              const pct = opts.total > 0 ? (opts.loaded / opts.total) * 100 : 0;
              const progress: WllamaLoadProgress = {
                status: pct >= 100 ? 'done' : 'download',
                progress: Math.min(pct, 100),
                loaded: opts.loaded,
                total: opts.total,
              };
              this.settings.onProgress(progress);
            }
          },
        });

        this.settings.onProgress?.({
          status: 'ready',
          progress: 100,
          text: 'Embedding model ready',
        });

        this.wllamaInstance = wllamaInstance;
        return wllamaInstance;
      } catch (error) {
        this.loadPromise = null;
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
        if (error instanceof ModelLoadError) throw error;
        const cause = error instanceof Error ? error : undefined;
        throw new ModelLoadError(this.baseModelId, cause);
      }
    })();

    return this.loadPromise;
  }

  /**
   * Generate embeddings for the given text values.
   */
  async doEmbed(options: DoEmbedOptions): Promise<DoEmbedResult> {
    const { values, abortSignal } = options;

    abortSignal?.throwIfAborted();

    const wllamaInstance = await this.loadModel();

    abortSignal?.throwIfAborted();

    const embeddings: Float32Array[] = [];

    try {
      for (const value of values) {
        abortSignal?.throwIfAborted();

        const response = await wllamaInstance.createEmbedding({
          input: value,
        });

        const embeddingData = response.data?.[0]?.embedding;
        if (Array.isArray(embeddingData)) {
          const vec = new Float32Array(embeddingData as number[]);
          embeddings.push(vec);

          // Set dimensions from first result if not already set
          if (!this.dimensions && vec.length > 0) {
            (this as { dimensions: number }).dimensions = vec.length;
          }
        } else {
          embeddings.push(new Float32Array(0));
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      if (error instanceof Error && error.name === 'AbortError') throw error;

      const cause = error instanceof Error ? error : undefined;
      throw new EmbeddingError(
        `Embedding failed with model ${this.modelId}: ${cause?.message ?? String(error)}`,
        { cause }
      );
    }

    return {
      embeddings,
      usage: { tokens: values.reduce((sum, v) => sum + Math.ceil(v.length / 4), 0) },
      response: { modelId: this.modelId, timestamp: new Date() },
    };
  }

  /**
   * Unload the model and free WASM memory.
   */
  async unload(): Promise<void> {
    if (this.wllamaInstance) {
      try { await this.wllamaInstance.exit(); } catch { /* ignore */ }
      this.wllamaInstance = null;
      this.loadPromise = null;
    }
  }
}
