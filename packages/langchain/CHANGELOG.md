# @localmode/langchain

## 2.1.2

### Patch Changes

- security: the `@langchain/core` dependency range is `>=0.3.80 <1.0.0 || >=1.1.0 <2.0.0` (was `>=0.3.0`). Versions below 0.3.80 have a serialization-injection flaw that can leak secrets (GHSA-r399-636x-v7f6); 1.0.0 through 1.0.6 shipped a `dist/` without the top-level shims that `moduleResolution: "node"` consumers need (fixed in 1.1.0). Every abstract surface this package extends (`Embeddings`, `VectorStore`, `BaseChatModel`, `BaseDocumentCompressor`) is identical between 0.3.80 and 1.2.12; the built package was exercised against an installed 0.3.80 and against 1.2.12 with identical results. Development and tests run against 1.2.12 / `langsmith` 0.10.5.

## 2.1.1

### Patch Changes

- docs: replace the README "Demo" badge with "UI Components" (localmode.ai) and add a "Blocks & Apps" badge linking to the localmode.ai/blocks gallery

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
