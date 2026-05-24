/**
 * MediaPipe Text Embedder
 *
 * Implements the core `EmbeddingModel` interface using
 * `@mediapipe/tasks-text`'s `TextEmbedder` task (Universal Sentence Encoder).
 *
 * @packageDocumentation
 */

import type {
  EmbeddingModel,
  DoEmbedOptions,
  DoEmbedResult,
} from '@localmode/core';
import { EmbeddingError } from '@localmode/core';
import type { TextEmbedder } from '@mediapipe/tasks-text';
import type { MediaPipeModelSettings, MediaPipeProviderSettings } from '../types.js';
import { resolveModelUrl } from '../models.js';
import { resolveWasmPath } from '../utils.js';
import { LazyMediaPipeTask } from './base.js';

/** Default embedding dimension for the MediaPipe Universal Sentence Encoder. */
const DEFAULT_DIMENSIONS = 100;

/**
 * Text embedding model backed by MediaPipe's `TextEmbedder`.
 */
export class MediaPipeTextEmbedder implements EmbeddingModel {
  readonly modelId: string;
  readonly provider = 'mediapipe';
  readonly dimensions: number;
  readonly maxEmbeddingsPerCall = undefined;
  readonly supportsParallelCalls = false;

  private readonly task: LazyMediaPipeTask<TextEmbedder>;

  constructor(
    modelId: string,
    settings: MediaPipeModelSettings = {},
    providerSettings: MediaPipeProviderSettings = {}
  ) {
    this.modelId = `mediapipe:${modelId}`;
    this.dimensions = DEFAULT_DIMENSIONS;
    const modelUrl = resolveModelUrl(modelId, settings.modelPath);
    const wasmPath = resolveWasmPath('text', providerSettings.wasmBasePath, settings.wasmBasePath);
    const delegate = settings.delegate ?? providerSettings.delegate ?? 'GPU';

    this.task = new LazyMediaPipeTask<TextEmbedder>(async () => {
      const { FilesetResolver, TextEmbedder } = await import('@mediapipe/tasks-text');
      const fileset = await FilesetResolver.forTextTasks(wasmPath);
      return TextEmbedder.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: modelUrl, delegate },
      });
    }, this.modelId);
  }

  async doEmbed(options: DoEmbedOptions): Promise<DoEmbedResult> {
    const { values, abortSignal } = options;
    abortSignal?.throwIfAborted();

    const embedder = await this.task.get();
    abortSignal?.throwIfAborted();

    const embeddings: Float32Array[] = [];

    try {
      for (const value of values) {
        abortSignal?.throwIfAborted();
        const raw = embedder.embed(value);
        const floatEmbedding = raw.embeddings[0]?.floatEmbedding ?? [];
        embeddings.push(Float32Array.from(floatEmbedding));
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      throw new EmbeddingError(
        `Text embedding failed: ${(error as Error)?.message ?? String(error)}`,
        {
          hint: 'Ensure the input values are non-empty strings.',
          cause: error instanceof Error ? error : undefined,
        }
      );
    }

    return {
      embeddings,
      usage: { tokens: 0 },
      response: {
        modelId: this.modelId,
        timestamp: new Date(),
      },
    };
  }

  /** Dispose the underlying MediaPipe task and free WASM resources. */
  close(): void {
    this.task.close();
  }
}
