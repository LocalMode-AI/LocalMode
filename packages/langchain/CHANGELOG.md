# @localmode/langchain

## 2.1.0

### Added

- `createLangChainKnowledgeBaseEngine()` — a `kind: 'langchain'` engine implementing the frozen `KnowledgeBaseEngine` contract from `@localmode/core` (chunk → embed → store, vector search, grounded `ask`) via the `LocalModeEmbeddings` / `LocalModeVectorStore` / `ChatLocalMode` adapters. Result-equivalent to core's `createKnowledgeBaseEngine`, so a knowledge base UI can toggle engines over one shared corpus; models are injected, so the package gains no provider dependency. New exports: `createLangChainKnowledgeBaseEngine`, `CreateLangChainKnowledgeBaseEngineOptions`, `LangChainKnowledgeBaseAskConfig`, `LangChainKnowledgeBaseChunkDefaults`.

## 2.0.0

### Major Changes

- New package: LangChain.js adapters for local-first AI
- `LocalModeEmbeddings` adapter for LangChain embeddings interface
- `ChatLocalMode` adapter for LangChain chat model interface
- `LocalModeVectorStore` adapter for LangChain vector store interface
- Reranker integration

### Patch Changes

- Updated dependencies
  - @localmode/core@2.0.0
