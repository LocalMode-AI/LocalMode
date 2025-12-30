/**
 * Transformers Translation Model Implementation
 *
 * Implements TranslationModel interface using Transformers.js (opus-mt, nllb, etc.)
 *
 * @packageDocumentation
 */

import type {
  TranslationModel,
  TranslationUsage,
} from '@localmode/core';
import type { ModelSettings, TransformersDevice, ModelLoadProgress } from '../types.js';

// Dynamic import types
type TranslationPipeline = Awaited<
  ReturnType<typeof import('@huggingface/transformers').pipeline<'translation'>>
>;

/**
 * Translation model implementation using Transformers.js
 */
export class TransformersTranslationModel implements TranslationModel {
  readonly modelId: string;
  readonly provider = 'transformers';

  private pipeline: TranslationPipeline | null = null;
  private loadPromise: Promise<TranslationPipeline> | null = null;

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

  private async loadPipeline(): Promise<TranslationPipeline> {
    if (this.pipeline) {
      return this.pipeline;
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = (async () => {
      const { pipeline } = await import('@huggingface/transformers');

      const pipe = await pipeline('translation', this.baseModelId, {
        device: this.settings.device ?? 'auto',
        dtype: this.settings.quantized !== false ? 'q8' : 'fp32',
        progress_callback: this.settings.onProgress,
      });

      this.pipeline = pipe;
      return pipe;
    })();

    return this.loadPromise;
  }

  async doTranslate(options: {
    texts: string[];
    sourceLanguage?: string;
    targetLanguage?: string;
    abortSignal?: AbortSignal;
    providerOptions?: Record<string, Record<string, unknown>>;
  }): Promise<{
    translations: string[];
    detectedLanguage?: string;
    usage: TranslationUsage;
  }> {
    const { texts, abortSignal } = options;
    const startTime = Date.now();

    abortSignal?.throwIfAborted();

    const pipe = await this.loadPipeline();

    abortSignal?.throwIfAborted();

    const translations: string[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (const text of texts) {
      abortSignal?.throwIfAborted();

      // Translation pipeline returns { translation_text: string }
      const output = await pipe(text);

      let translatedText: string;
      if (Array.isArray(output)) {
        translatedText = (output[0] as { translation_text: string }).translation_text;
      } else {
        translatedText = (output as { translation_text: string }).translation_text;
      }

      translations.push(translatedText);
      totalInputTokens += text.split(/\s+/).length;
      totalOutputTokens += translatedText.split(/\s+/).length;
    }

    return {
      translations,
      usage: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        durationMs: Date.now() - startTime,
      },
    };
  }
}

/**
 * Create a translation model using Transformers.js
 */
export function createTranslationModel(
  modelId: string,
  settings?: ModelSettings
): TransformersTranslationModel {
  return new TransformersTranslationModel(modelId, settings);
}

