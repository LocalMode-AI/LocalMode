/**
 * Transformers NER Model Implementation
 *
 * Implements NERModel interface using Transformers.js
 *
 * @packageDocumentation
 */

import type { NERModel, NERResultItem, Entity, NERUsage } from '@localmode/core';
import type { ModelSettings, TransformersDevice, ModelLoadProgress } from '../types.js';

// Dynamic import types
type TokenClassificationPipeline = Awaited<
  ReturnType<typeof import('@huggingface/transformers').pipeline<'token-classification'>>
>;

/**
 * NER model implementation using Transformers.js
 */
export class TransformersNERModel implements NERModel {
  readonly modelId: string;
  readonly provider = 'transformers';
  readonly entityTypes: string[] = ['PERSON', 'ORG', 'LOC', 'MISC'];

  private pipeline: TokenClassificationPipeline | null = null;
  private loadPromise: Promise<TokenClassificationPipeline> | null = null;

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

  private async loadPipeline(): Promise<TokenClassificationPipeline> {
    if (this.pipeline) {
      return this.pipeline;
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');

      // Suppress ONNX runtime warnings about node execution providers
      env.backends.onnx.logLevel = 'error';

      const pipe = await pipeline('token-classification', this.baseModelId, {
        device: this.settings.device ?? 'auto',
        dtype: this.settings.quantized === true ? 'q8' : undefined,
        progress_callback: this.settings.onProgress,
      });

      this.pipeline = pipe;
      return pipe;
    })();

    return this.loadPromise;
  }

  async doExtract(options: {
    texts: string[];
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
    providerOptions?: Record<string, Record<string, unknown>>;
  }): Promise<{
    results: NERResultItem[];
    usage: NERUsage;
  }> {
    const { texts, abortSignal } = options;
    const startTime = Date.now();

    abortSignal?.throwIfAborted();

    const pipe = await this.loadPipeline();

    abortSignal?.throwIfAborted();

    const results: NERResultItem[] = [];
    let totalTokens = 0;

    for (const text of texts) {
      abortSignal?.throwIfAborted();

      // Use type assertion for pipeline options as API may vary
      const output = await pipe(text, {
        aggregation_strategy: 'simple',
      } as Record<string, unknown>);

      // Output is array of { word, entity, score, start, end, index }
      const entities: Entity[] = [];

      const predictions = Array.isArray(output) ? output : [output];

      // Track search position for fallback offset computation
      let searchFrom = 0;

      for (const pred of predictions as Array<{
        word: string;
        entity: string;
        entity_group?: string;
        score: number;
        start?: number;
        end?: number;
      }>) {
        // Handle both 'entity' and 'entity_group' (aggregation mode)
        const entityType = pred.entity_group ?? pred.entity;

        // Remove B- or I- prefix if present
        const cleanType = entityType.replace(/^[BI]-/, '');

        // Compute start/end offsets — fallback to text search if pipeline doesn't provide them
        let start = pred.start;
        let end = pred.end;

        if (start == null || end == null) {
          const cleanWord = pred.word.replace(/^#+\s*/, '').trim();
          const idx = text.indexOf(cleanWord, searchFrom);
          if (idx !== -1) {
            start = idx;
            end = idx + cleanWord.length;
            searchFrom = end;
          } else {
            // Last resort: try case-insensitive search
            const lowerIdx = text.toLowerCase().indexOf(cleanWord.toLowerCase(), searchFrom);
            if (lowerIdx !== -1) {
              start = lowerIdx;
              end = lowerIdx + cleanWord.length;
              searchFrom = end;
            } else {
              start = 0;
              end = 0;
            }
          }
        } else {
          searchFrom = end;
        }

        entities.push({
          text: pred.word,
          type: cleanType,
          start,
          end,
          score: pred.score,
        });
      }

      results.push({ entities });

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
 * Create a NER model using Transformers.js
 */
export function createNERModel(modelId: string, settings?: ModelSettings): TransformersNERModel {
  return new TransformersNERModel(modelId, settings);
}
