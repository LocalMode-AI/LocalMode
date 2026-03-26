/**
 * LangChain BaseDocumentCompressor adapter for @localmode/core RerankerModel.
 *
 * @packageDocumentation
 */

import { BaseDocumentCompressor } from '@langchain/core/retrievers/document_compressors';
import { Document } from '@langchain/core/documents';
import type { RerankerModel } from '@localmode/core';
import type { LocalModeRerankerOptions } from './types.js';

/**
 * LangChain document compressor backed by a LocalMode RerankerModel.
 *
 * Reranks documents by relevance to a query using cross-encoder models.
 *
 * @example
 * ```ts
 * import { LocalModeReranker } from '@localmode/langchain';
 * import { transformers } from '@localmode/transformers';
 *
 * const reranker = new LocalModeReranker({
 *   model: transformers.reranker('Xenova/ms-marco-MiniLM-L-6-v2'),
 *   topK: 5,
 * });
 *
 * const reranked = await reranker.compressDocuments(docs, 'search query');
 * ```
 */
export class LocalModeReranker extends BaseDocumentCompressor {
  private model: RerankerModel;
  private topK?: number;

  constructor(options: LocalModeRerankerOptions) {
    super();
    this.model = options.model;
    this.topK = options.topK;
  }

  /**
   * Rerank documents by relevance to a query.
   *
   * @param documents - LangChain Document array
   * @param query - Query string
   * @returns Reranked documents with relevanceScore in metadata
   */
  async compressDocuments(
    documents: Document[],
    query: string
  ): Promise<Document[]> {
    if (documents.length === 0) return [];

    const texts = documents.map((d) => d.pageContent);

    const result = await this.model.doRerank({
      query,
      documents: texts,
      topK: this.topK,
    });

    return result.results.map((ranked) => {
      const originalDoc = documents[ranked.index];
      return new Document({
        pageContent: originalDoc.pageContent,
        metadata: {
          ...originalDoc.metadata,
          relevanceScore: ranked.score,
        },
      });
    });
  }
}
