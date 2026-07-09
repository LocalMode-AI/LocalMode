/**
 * Knowledge Base Engine
 *
 * The frozen {@link KnowledgeBaseEngine} contract and the provider-agnostic
 * core engine that implements it. A result-equivalent LangChain-adapter engine
 * lives in `@localmode/langchain`; a session-orchestration React hook lives in
 * `@localmode/react`.
 *
 * @packageDocumentation
 */

export type {
  ChunkingMode,
  DocumentSource,
  RawDocument,
  ChunkMetadata,
  KBSearchResult,
  IngestOptions,
  SearchOptions,
  AskOptions,
  AskResult,
  EngineStats,
  KnowledgeBaseEngine,
} from './types.js';

export {
  createKnowledgeBaseEngine,
} from './engine.js';

export type {
  CreateKnowledgeBaseEngineOptions,
  KnowledgeBaseAskConfig,
  KnowledgeBaseChunkDefaults,
} from './engine.js';
