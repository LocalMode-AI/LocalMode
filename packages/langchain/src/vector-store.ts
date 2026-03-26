/**
 * LangChain VectorStore adapter for @localmode/core VectorDB.
 *
 * @packageDocumentation
 */

import { VectorStore } from '@langchain/core/vectorstores';
import { Document } from '@langchain/core/documents';
import type { EmbeddingsInterface } from '@langchain/core/embeddings';
import type { VectorDB } from '@localmode/core';

/**
 * LangChain VectorStore backed by a LocalMode VectorDB.
 *
 * Provides HNSW-indexed vector search with persistent IndexedDB storage.
 *
 * @example
 * ```ts
 * import { LocalModeVectorStore, LocalModeEmbeddings } from '@localmode/langchain';
 * import { transformers } from '@localmode/transformers';
 * import { createVectorDB } from '@localmode/core';
 *
 * const embeddings = new LocalModeEmbeddings({
 *   model: transformers.embedding('Xenova/bge-small-en-v1.5'),
 * });
 * const db = await createVectorDB({ name: 'docs', dimensions: 384 });
 * const store = new LocalModeVectorStore(embeddings, { db });
 * ```
 */
export class LocalModeVectorStore extends VectorStore {
  private db: VectorDB;

  constructor(
    embeddings: EmbeddingsInterface,
    options: { db: VectorDB }
  ) {
    super(embeddings, {});
    this.db = options.db;
  }

  _vectorstoreType(): string {
    return 'localmode';
  }

  /**
   * Add documents with automatic embedding.
   *
   * @param documents - LangChain Document array
   * @returns Generated document IDs
   */
  async addDocuments(documents: Document[]): Promise<string[]> {
    const texts = documents.map((d) => d.pageContent);
    const vectors = await this.embeddings.embedDocuments(texts);
    return this.addVectors(vectors, documents);
  }

  /**
   * Add pre-computed vectors.
   *
   * @param vectors - Array of number arrays
   * @param documents - Corresponding LangChain Documents
   * @returns Generated document IDs
   */
  async addVectors(vectors: number[][], documents: Document[]): Promise<string[]> {
    const ids: string[] = [];

    const docs = vectors.map((vec, i) => {
      const id = crypto.randomUUID();
      ids.push(id);
      return {
        id,
        vector: new Float32Array(vec),
        metadata: {
          ...documents[i].metadata,
          text: documents[i].pageContent,
        },
      };
    });

    await this.db.addMany(docs);
    return ids;
  }

  /**
   * Search for similar vectors with scores.
   *
   * @param query - Query vector as number[]
   * @param k - Number of results
   * @param filter - Optional metadata filter
   * @returns Array of [Document, score] tuples
   */
  async similaritySearchVectorWithScore(
    query: number[],
    k: number,
    filter?: Record<string, unknown>
  ): Promise<[Document, number][]> {
    const results = await this.db.search(new Float32Array(query), {
      k,
      ...(filter ? { filter } : {}),
    });

    return results.map((r) => {
      const metadata = { ...(r.metadata ?? {}) };
      const text = (metadata.text as string) ?? '';
      delete metadata.text;

      return [
        new Document({
          pageContent: text,
          metadata,
        }),
        r.score,
      ];
    });
  }

  /**
   * Create a vector store from documents.
   *
   * @param docs - Documents to add
   * @param embeddings - Embeddings instance
   * @param options - VectorDB options
   * @returns Populated vector store
   */
  static async fromDocuments(
    docs: Document[],
    embeddings: EmbeddingsInterface,
    options: { db: VectorDB }
  ): Promise<LocalModeVectorStore> {
    const store = new LocalModeVectorStore(embeddings, options);
    await store.addDocuments(docs);
    return store;
  }

  /**
   * Create a vector store from an existing index.
   *
   * @param embeddings - Embeddings instance
   * @param options - VectorDB options
   * @returns Vector store wrapping existing data
   */
  static async fromExistingIndex(
    embeddings: EmbeddingsInterface,
    options: { db: VectorDB }
  ): Promise<LocalModeVectorStore> {
    return new LocalModeVectorStore(embeddings, options);
  }
}
