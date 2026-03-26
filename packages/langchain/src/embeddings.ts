/**
 * LangChain Embeddings adapter for @localmode/core EmbeddingModel.
 *
 * @packageDocumentation
 */

import { Embeddings, type EmbeddingsParams } from '@langchain/core/embeddings';
import type { EmbeddingModel } from '@localmode/core';
import type { LocalModeEmbeddingsOptions } from './types.js';

/**
 * LangChain Embeddings backed by a LocalMode EmbeddingModel.
 *
 * Drop-in replacement for `OpenAIEmbeddings` or any LangChain `Embeddings` class,
 * powered by local inference via `@localmode/transformers`.
 *
 * @example
 * ```ts
 * import { LocalModeEmbeddings } from '@localmode/langchain';
 * import { transformers } from '@localmode/transformers';
 *
 * const embeddings = new LocalModeEmbeddings({
 *   model: transformers.embedding('Xenova/bge-small-en-v1.5'),
 * });
 *
 * const vectors = await embeddings.embedDocuments(['Hello', 'World']);
 * const queryVec = await embeddings.embedQuery('search term');
 * ```
 */
export class LocalModeEmbeddings extends Embeddings {
  private model: EmbeddingModel;

  constructor(options: LocalModeEmbeddingsOptions, params?: EmbeddingsParams) {
    super(params ?? {});
    this.model = options.model;
  }

  /**
   * Embed multiple documents.
   *
   * @param texts - Array of texts to embed
   * @returns Array of number arrays (LangChain format)
   */
  async embedDocuments(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const result = await this.model.doEmbed({ values: texts });
    return result.embeddings.map((e) => Array.from(e));
  }

  /**
   * Embed a single query.
   *
   * @param text - Text to embed
   * @returns Number array (LangChain format)
   */
  async embedQuery(text: string): Promise<number[]> {
    const result = await this.model.doEmbed({ values: [text] });
    return Array.from(result.embeddings[0]);
  }
}
