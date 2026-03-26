/**
 * Type definitions for @localmode/langchain adapters.
 *
 * @packageDocumentation
 */

import type { EmbeddingModel, LanguageModel, RerankerModel, VectorDB } from '@localmode/core';

/** Options for LocalModeEmbeddings constructor. */
export interface LocalModeEmbeddingsOptions {
  /** The LocalMode embedding model instance */
  model: EmbeddingModel;
}

/** Options for ChatLocalMode constructor. */
export interface ChatLocalModeOptions {
  /** The LocalMode language model instance */
  model: LanguageModel;

  /** Default temperature for generation */
  temperature?: number;

  /** Default max tokens for generation */
  maxTokens?: number;

  /** Default system prompt */
  systemPrompt?: string;
}

/** Options for LocalModeVectorStore constructor (passed as second arg). */
export interface LocalModeVectorStoreOptions {
  /** The LocalMode VectorDB instance */
  db: VectorDB;
}

/** Options for LocalModeReranker constructor. */
export interface LocalModeRerankerOptions {
  /** The LocalMode reranker model instance */
  model: RerankerModel;

  /** Maximum number of documents to return (default: all) */
  topK?: number;
}
