/**
 * wllama Reranker Model Implementation
 *
 * Implements RerankerModel interface using wllama v3's createRerank API.
 * Uses cross-encoder GGUF models for document relevance scoring.
 *
 * @packageDocumentation
 */

import type { RerankerModel, DoRerankOptions, DoRerankResult } from '@localmode/core';
import { ModelLoadError } from '@localmode/core';
import type { WllamaRerankerSettings, WllamaLoadProgress } from './types.js';
import { WLLAMA_MODELS } from './models.js';
import { isCrossOriginIsolated, resolveModelUrl } from './utils.js';

type WllamaInstance = InstanceType<Awaited<typeof import('@wllama/wllama')>['Wllama']>;

const WLLAMA_CDN_WASM = 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.2.3/src/wasm/wllama.wasm';
const WLLAMA_CDN_ESM = 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.2.3/esm/index.js';

async function importWllama(): Promise<{ Wllama: new (config: { default: string }) => WllamaInstance }> {
  const dynamicImport = new Function('u', 'return import(u)') as (url: string) => Promise<{ Wllama: new (config: { default: string }) => WllamaInstance }>;
  return dynamicImport(WLLAMA_CDN_ESM);
}

/**
 * wllama Reranker Model implementation using GGUF cross-encoder models.
 *
 * @example
 * ```ts
 * import { WllamaRerankerModel } from '@localmode/wllama';
 * import { rerank } from '@localmode/core';
 *
 * const model = new WllamaRerankerModel('jina-reranker-v2-base-multilingual-Q4_K_M');
 * const { results } = await rerank({ model, query: 'machine learning', documents: ['AI paper', 'cooking recipe'] });
 * ```
 */
export class WllamaRerankerModel implements RerankerModel {
  readonly modelId: string;
  readonly provider = 'wllama';

  private wllamaInstance: WllamaInstance | null = null;
  private loadPromise: Promise<WllamaInstance> | null = null;
  private baseModelId: string;
  private settings: WllamaRerankerSettings;

  constructor(baseModelId: string, settings: WllamaRerankerSettings = {}) {
    this.baseModelId = baseModelId;
    this.settings = settings;
    this.modelId = `wllama:${baseModelId}`;
  }

  private async loadModel(): Promise<WllamaInstance> {
    if (this.wllamaInstance) return this.wllamaInstance;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      try {
        const { Wllama } = await importWllama();

        const catalogEntry = (WLLAMA_MODELS as Record<string, { url: string }>)[this.baseModelId];
        const modelUrl = resolveModelUrl(
          catalogEntry ? catalogEntry.url : this.baseModelId,
          this.settings.modelUrl
        );

        let numThreads = this.settings.numThreads;
        if (numThreads === undefined) {
          numThreads = isCrossOriginIsolated()
            ? (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 1)
            : 1;
        }

        this.settings.onProgress?.({
          status: 'initiate',
          text: `Loading reranker model: ${this.baseModelId}`,
        });

        const wllamaInstance = new Wllama({ default: WLLAMA_CDN_WASM });

        await wllamaInstance.loadModelFromUrl(modelUrl, {
          n_threads: numThreads,
          n_ctx: this.settings.contextLength ?? 1024,
          progressCallback: (opts: { loaded: number; total: number }) => {
            if (this.settings.onProgress) {
              const pct = opts.total > 0 ? (opts.loaded / opts.total) * 100 : 0;
              const isDone = pct >= 100;
              const progress: WllamaLoadProgress = {
                status: isDone ? 'done' : 'download',
                progress: Math.min(pct, 100),
                loaded: opts.loaded,
                total: opts.total,
                text: isDone
                  ? 'Model loaded'
                  : `Downloading: ${(opts.loaded / (1024 * 1024)).toFixed(1)}MB / ${(opts.total / (1024 * 1024)).toFixed(1)}MB`,
              };
              this.settings.onProgress(progress);
            }
          },
        });

        this.settings.onProgress?.({
          status: 'ready',
          progress: 100,
          text: 'Reranker ready',
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

  async doRerank(options: DoRerankOptions): Promise<DoRerankResult> {
    const { query, documents, topK, abortSignal } = options;

    abortSignal?.throwIfAborted();
    const wllamaInstance = await this.loadModel();
    abortSignal?.throwIfAborted();

    const startTime = Date.now();

    const response = await (wllamaInstance as unknown as {
      createRerank: (opts: { query: string; documents: string[]; top_n?: number }) => Promise<{
        results: Array<{ index: number; relevance_score: number; document?: { text: string } }>;
      }>;
    }).createRerank({
      query,
      documents,
      ...(topK !== undefined ? { top_n: topK } : {}),
    });

    const results = (response.results ?? []).map((r) => ({
      index: r.index,
      score: r.relevance_score,
      text: documents[r.index],
    }));

    return {
      results,
      usage: {
        inputTokens: documents.reduce((sum, d) => sum + Math.ceil(d.length / 4), 0),
        durationMs: Date.now() - startTime,
      },
    };
  }

  async unload(): Promise<void> {
    if (this.wllamaInstance) {
      try { await this.wllamaInstance.exit(); } catch { /* ignore */ }
      this.wllamaInstance = null;
      this.loadPromise = null;
    }
  }
}

/**
 * Create a wllama reranker model.
 *
 * @param modelId - GGUF model identifier (catalog key, HuggingFace shorthand, or full URL)
 * @param settings - Model settings
 * @returns A WllamaRerankerModel instance
 */
export function createRerankerModel(
  modelId: string,
  settings?: WllamaRerankerSettings
): WllamaRerankerModel {
  return new WllamaRerankerModel(modelId, settings);
}
