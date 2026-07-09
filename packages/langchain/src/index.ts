/**
 * @localmode/langchain
 *
 * LangChain.js adapters for LocalMode — drop-in local inference
 * for existing LangChain applications.
 *
 * @packageDocumentation
 */

export { LocalModeEmbeddings } from './embeddings.js';
export { ChatLocalMode } from './chat-model.js';
export { LocalModeVectorStore } from './vector-store.js';
export { LocalModeReranker } from './reranker.js';

export type {
  LocalModeEmbeddingsOptions,
  ChatLocalModeOptions,
  LocalModeVectorStoreOptions,
  LocalModeRerankerOptions,
} from './types.js';

// Knowledge base engine — a LangChain-adapter implementation of the frozen
// `KnowledgeBaseEngine` contract exported by `@localmode/core` (the contract
// type source; already a peerDependency). Consumers who never toggle the
// LangChain engine never pull this dependency.
export { createLangChainKnowledgeBaseEngine } from './knowledge-base-engine.js';

export type {
  CreateLangChainKnowledgeBaseEngineOptions,
  LangChainKnowledgeBaseAskConfig,
  LangChainKnowledgeBaseChunkDefaults,
} from './knowledge-base-engine.js';
