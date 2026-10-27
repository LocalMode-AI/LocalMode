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
import type { TranslatorSettings, TransformersDevice, ModelLoadProgress } from '../types.js';
import { installResilientModelCache } from '../resilient-cache.js';

/**
 * Target-language tokens for the multi-target Opus-MT models the provider
 * knows about, keyed by Hugging Face model id.
 *
 * These models translate into several languages or scripts and require a
 * sentence-initial `>>id<<` token naming the target (the token must be in the
 * model's vocabulary). The value is the token the translator prepends by
 * default: Simplified Mandarin for `en-zh`, Modern Standard Arabic for `en-ar`.
 * Pick another target with the `targetLanguageToken` setting (for example
 * `'>>cmn_Hant<<'` or `'>>yue_Hant<<'` on `en-zh`).
 */
export const OPUS_MT_TARGET_LANGUAGE_TOKENS: Readonly<Record<string, string>> = Object.freeze({
  'Xenova/opus-mt-en-zh': '>>cmn_Hans<<',
  'Xenova/opus-mt-en-ar': '>>ara<<',
});

const TARGET_TOKEN_PREFIX = /^\s*(>>[^<>\s]+<<)\s*/;

/** Minimal shapes of the translation pipeline's tokenizer and model. */
interface TokenTensorLike {
  data: ArrayLike<number | bigint>;
}
interface MarianTokenizerLike {
  (text: string, options: { truncation: boolean }): { input_ids: TokenTensorLike };
  convert_tokens_to_ids(token: string): number | null | undefined;
  batch_decode(ids: unknown, options: { skip_special_tokens: boolean }): string[];
  model_max_length?: number;
}
interface Seq2SeqModelLike {
  generate(options: Record<string, unknown>): Promise<unknown>;
}

/**
 * Resolve the sentence-initial target-language token for a translation model.
 *
 * @param modelId - Hugging Face model id (a `transformers:` prefix is accepted)
 * @param override - An explicit token (used as given), `false` to send none,
 *   or `undefined` to use {@link OPUS_MT_TARGET_LANGUAGE_TOKENS}
 * @returns The token to prepend, or `undefined` when none applies
 *
 * @example
 * ```ts
 * resolveTargetLanguageToken('Xenova/opus-mt-en-zh'); // '>>cmn_Hans<<'
 * resolveTargetLanguageToken('Xenova/opus-mt-en-zh', false); // undefined
 * resolveTargetLanguageToken('Xenova/opus-mt-en-de'); // undefined
 * ```
 *
 * @see {@link OPUS_MT_TARGET_LANGUAGE_TOKENS}
 */
export function resolveTargetLanguageToken(
  modelId: string,
  override?: string | false
): string | undefined {
  if (override === false) return undefined;
  if (typeof override === 'string' && override.length > 0) return override;
  const id = modelId.startsWith('transformers:') ? modelId.slice('transformers:'.length) : modelId;
  return OPUS_MT_TARGET_LANGUAGE_TOKENS[id];
}

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
      revision?: string;
      quantized?: boolean;
      targetLanguageToken?: string | false;
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
      const { pipeline, env } = await import('@huggingface/transformers');

      // Suppress ONNX runtime warnings about node execution providers
      env.backends.onnx.logLevel = 'error';
      installResilientModelCache(env);

      const pipe = await pipeline('translation', this.baseModelId, {
        device: this.settings.device ?? 'auto',
        dtype: this.settings.quantized === true ? 'q8' : 'fp32',
        revision: this.settings.revision ?? 'main',
        progress_callback: this.settings.onProgress,
      });

      this.pipeline = pipe;
      return pipe;
    })();

    return this.loadPromise;
  }

  /**
   * Translate one text with a target-language token as the first input id.
   *
   * The token is a single vocabulary entry. Transformers.js tokenizes text
   * with its generic tokenizer, which splits `>>id<<` into sub-word pieces
   * the model does not read as a target, so the id is inserted directly and
   * the pipeline's generation step is run on the resulting ids.
   */
  private async translateWithTargetToken(
    pipe: TranslationPipeline,
    text: string,
    targetToken: string
  ): Promise<string> {
    const { Tensor } = await import('@huggingface/transformers');
    const tokenizer = (pipe as unknown as { tokenizer: MarianTokenizerLike }).tokenizer;
    const model = (pipe as unknown as { model: Seq2SeqModelLike }).model;

    const tokenId = tokenizer.convert_tokens_to_ids(targetToken);
    if (typeof tokenId !== 'number' || tokenId < 0) {
      throw new Error(
        `Target-language token '${targetToken}' is not in the vocabulary of ${this.baseModelId}. ` +
          `Use one of the model's >>id<< tokens, or set targetLanguageToken: false.`
      );
    }

    const encoded = Array.from(tokenizer(text, { truncation: true }).input_ids.data, Number);
    const maxLength = tokenizer.model_max_length ?? Infinity;
    // Keep the trailing end-of-sequence id when the extra token overflows.
    const ids =
      encoded.length + 1 > maxLength
        ? [tokenId, ...encoded.slice(0, maxLength - 2), encoded[encoded.length - 1]]
        : [tokenId, ...encoded];

    const dims = [1, ids.length];
    const inputIds = new Tensor('int64', BigInt64Array.from(ids, (id) => BigInt(id)), dims);
    const attentionMask = new Tensor('int64', new BigInt64Array(ids.length).fill(BigInt(1)), dims);

    const defaults =
      (pipe as unknown as { _default_generation_config?: Record<string, unknown> })
        ._default_generation_config ?? { max_new_tokens: 256 };
    const output = await model.generate({
      ...defaults,
      input_ids: inputIds,
      attention_mask: attentionMask,
    });
    return tokenizer.batch_decode(output, { skip_special_tokens: true })[0] ?? '';
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
    const { texts, abortSignal, providerOptions } = options;
    const startTime = Date.now();

    const perCall = providerOptions?.transformers?.targetLanguageToken;
    const token = resolveTargetLanguageToken(
      this.baseModelId,
      perCall === false || typeof perCall === 'string' ? perCall : this.settings.targetLanguageToken
    );

    abortSignal?.throwIfAborted();

    const pipe = await this.loadPipeline();

    abortSignal?.throwIfAborted();

    const translations: string[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (const text of texts) {
      abortSignal?.throwIfAborted();

      // A sentence-initial `>>id<<` already in the text names the target.
      const leading = TARGET_TOKEN_PREFIX.exec(text);
      const textToken = leading?.[1];
      const body = leading ? text.slice(leading[0].length) : text;
      const targetToken = textToken ?? token;

      let translatedText: string;
      if (targetToken) {
        translatedText = await this.translateWithTargetToken(pipe, body, targetToken);
      } else {
        // Translation pipeline returns { translation_text: string }
        const output = await pipe(text);
        if (Array.isArray(output)) {
          translatedText = (output[0] as { translation_text: string }).translation_text;
        } else {
          translatedText = (output as { translation_text: string }).translation_text;
        }
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
  settings?: TranslatorSettings
): TransformersTranslationModel {
  return new TransformersTranslationModel(modelId, settings);
}

