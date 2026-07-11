# @localmode/core

## 2.4.2

### Patch Changes

- **`jsonSchema()` / `generateObject` now accept Zod 4 schemas.** The duck-typed Zod reader in `generation/schema.ts` only understood Zod 3's `_def` layout, so every Zod 4 scalar collapsed to `{ type: 'object' }`. It now normalizes both layouts (Zod 3 `_def.typeName` ⇄ Zod 4 `_def.type`, and the moved array/enum/literal fields `element`/`entries`), plus `bigint`.
- **`buildStructuredPrompt()` produces a filled example.** The structured-output prompt now includes a concrete example instance and, in object mode, an explicit "exactly these top-level keys" line, so a small model returns data instead of echoing the schema back.

## 2.4.0

### Minor Changes

- **Fixed: Chrome Built-in AI capability detection never fired on modern Chrome.** `isChromeAISupported()` was literally `'ai' in self`, and `isSummarizerAPISupported()` / `isTranslatorAPISupported()` / `isLanguageModelAPISupported()` all read the `self.ai.*` namespace that Chrome has removed. They therefore returned `false` on exactly the browsers where the APIs exist, and `detectCapabilities().features.chromeAI` was always `false`. All four now read the modern top-level `self.Summarizer` / `self.Translator` / `self.LanguageModel` globals, with the legacy `self.ai.*` namespace as a fallback, and `isChromeAISupported()` reports whether _any_ of the three APIs is present.
- docs: replace the README "Demo" badge with "UI Components" (localmode.ai) and add a "Blocks & Apps" badge linking to the localmode.ai/blocks gallery

## 2.3.0

### Added

- **Knowledge base engine** — `createKnowledgeBaseEngine({ embeddingModel, getLanguageModel, storage?, chunkDefaults?, askConfig? })` returns a `kind: 'core'` engine implementing the new frozen `KnowledgeBaseEngine` contract: chunk (off/recursive/semantic) → embed → typed-metadata VectorDB, vector `search`, and grounded streaming `ask` with reasoning stripped and PDF page attribution. Models are **injected**, so core gains a RAG engine with no new runtime dependency; a result-equivalent LangChain engine ships in `@localmode/langchain`. New exports: `RawDocument`, `KBSearchResult`, `AskOptions`, `AskResult`, `EngineStats`, `ChunkingMode`, `DocumentSource`, `CreateKnowledgeBaseEngineOptions`, `KnowledgeBaseAskConfig`, `KnowledgeBaseChunkDefaults`, plus the contract's `ChunkMetadata`/`IngestOptions`/`SearchOptions` under `KnowledgeBase*` aliases.
- **Agent tool approval** — opt-in human-in-the-loop gate for the ReAct loop. `ToolDefinition.requiresApproval` flags a tool; an `onToolApproval` callback (`AgentConfig`, per-run override on `AgentRunOptions`) approves or denies each gated call. Denials feed a reason back to the model as the step observation and are recorded on `AgentStep.approval`; a pending decision races the run's `abortSignal`, approval wait is excluded from `maxDurationMs`, and a flagged tool with no callback fails fast with `AgentError`. New types: `ToolApprovalRequest`, `ToolApprovalDecision`. Fully backward compatible.
- **`defineTool()`** — identity helper that anchors `ToolDefinition<TParams, TResult>` generics so `parameters` (e.g. from `jsonSchema(zodSchema)`) and `execute(params)` are type-checked against each other, letting typed tools fit `ToolDefinition[]` without `as ToolDefinition` casts.
- **`ingest()` object call form + `abortSignal`** — `ingest({ db, documents, model?, embedder?, ...options })` joins the positional `ingest(db, documents, options?)` as an overload. Passing an `EmbeddingModel` as `model` generates chunk embeddings via `embedMany()` and defaults `generateEmbeddings` to `true`; `model` and `embedder` are mutually exclusive. `IngestOptions` gains `abortSignal` (checked before chunking and between batches), and both forms throw actionable errors on a missing `db` or non-array `documents`. New type: `IngestObjectOptions`.
- **`TEXT_METADATA_FIELD` export** — the metadata key (`'_text'`) under which `ingest()`/`ingestChunks()`/`HybridSearch` store chunk text, now a single shared constant consumed by both the write side and `semanticSearch()`'s read side so the two cannot drift.
- **`streamEmbedManyImages()`** — streaming batch image embedding mirroring `streamEmbedMany()`: yields `{ embedding, index }` per image, an `onBatch` progress callback, `batchSize` (default 32) with opt-in `adaptiveBatching`, and per-batch `abortSignal` checks + retry. New types: `StreamEmbedManyImagesOptions`, `StreamEmbedImageResult`.
- **`createStorageAdapterConformanceSuite()`** — a framework-agnostic StorageAdapter contract suite returned as `Array<{ name, run }>` with dependency-free assertions. Its 21 cases cover full-`Collection` fidelity (including the extended quantization/compression/fingerprint fields), document/vector/index ops, `Uint8Array` payload fidelity, and — via a factory-supplied `reopen()` handle — close→reopen persistence and SQ8 cross-session fidelity, so it catches adapters that look fine in-session and corrupt on reopen. Adopted by `@localmode/dexie`, `@localmode/idb`, and `@localmode/localforage`. New types: `StorageAdapterConformanceCase`, `StorageAdapterConformanceContext`, `StorageAdapterConformanceFactory`.
- **`createMockRerankerModel()`** — deterministic mock `RerankerModel` for tests: configurable `scores`/`scoreFn`, honors `topK`, abortable `delayMs`, and recorded `calls`. New types: `MockRerankerModelOptions`, `MockRerankerModel`.
- **`KMeansOptions.random`** — injectable random source for `kMeansCluster()` centroid init; pass a seeded generator for deterministic clustering. Defaults to `Math.random` (behavior unchanged).

### Changed

- `ModelLoadError` default message generalized from `Failed to load embedding model: {modelId}` to `Failed to load model: {modelId}` — the error class is shared by every model domain (generation, audio, vision, …), not just embeddings.

### Fixed

- `semanticSearch()` now round-trips text stored by `ingest()`. `extractText()` checked `__text` but never the `_text` key that ingestion writes, so every ingested chunk returned `text: undefined` and RAG flows building context from `results[].text` injected empty strings. Extraction precedence is now `text`, `content`, `body`, `_text` (`TEXT_METADATA_FIELD`), `__text`, `pageContent`; explicit `text` metadata still wins, and `streamSemanticSearch()` inherits the fix.
- `jsonSchema()` type inference fixed — it now actually infers `T` from the Zod schema's `parse` return type (previously the result collapsed to `ObjectSchema<unknown>`), and `ToolDefinition.execute` is declared with method syntax so a tool typed via `defineTool()`/`jsonSchema()` is assignable to `ToolDefinition[]` without casts.
- `semanticCacheMiddleware()` now caches on the streaming path. It previously stored the response only after the `for await` loop, which never runs for consumers that stop at the `done` chunk (every `streamText()`/`useChat` turn), so streaming lookups always missed. The store now fires once when `done` is observed; a turn cancelled mid-stream still stores nothing.
- Agent runs on reasoning/thinking models no longer fail with `Failed to generate valid object after 3 attempts`. `generateObject()` now appends the Qwen3 `/no_think` switch to the user prompt as well as the system prompt (baked-template engines only see user messages), ReAct action generations get an explicit 2048-token budget so long `<think>` blocks no longer truncate before the JSON, and the action parser unwraps a schema-parroted single-element `oneOf`/`anyOf` wrapper.

### Backward Compatibility

- `StorageAdapter.getVector()` / `getAllVectors()` return types widened to `Float32Array | Uint8Array`. The implementations (MemoryStorage, IndexedDBStorage) have always returned `Uint8Array` for SQ8/PQ-compressed payloads, so this is a type-only correction with no runtime change; callers assigning the result to `Float32Array` may need to narrow (decompress compressed payloads with `decompressVectors()` / `pqDequantize()`).
- `jsonSchema<T, S>` simplified to `jsonSchema<T>` — the redundant second type parameter (which never inferred) is gone. Inferred calls (`jsonSchema(zodSchema)`) and explicit single-type-arg calls (`jsonSchema<MyType>(...)`) still compile; only code that passed the second type argument explicitly needs to drop it.

## 2.2.0

### Minor Changes

- Audit log with append-only, hash-chained, signed entries (`createAuditLog`, `verifyChain`, `exportAuditLog`, `deriveAuditKey`, `generateEphemeralAuditKey`)
- Live transcription with VAD integration (`createLiveTranscriber`, `createTurnTaker`, `EnergyVADProvider`, `SileroVADProvider`)
- Streaming speech synthesis with clause splitting and playback (`streamSynthesizeSpeech`, `splitIntoClauses`, `playStreamedSpeech`)
- Generative OCR prompt support for document-level OCR
- `AudioPart` content type for multimodal generation
- Capability detection helpers (`isLiveTranscribeSupported`)
- `MediaNotSupportedError` error class

## 2.0.0

### Major Changes

- Agent framework with ReAct loop, tool registry, and VectorDB-backed memory
- Evaluation SDK with accuracy, F1, ROUGE, BLEU, NDCG, MRR metrics
- Pipeline builder with composable multi-step workflows and pre-built step factories
- Inference queue with priority-based scheduling and concurrency control
- Model cache with chunked IndexedDB downloads, LRU eviction, and cross-tab coordination
- WebGPU-accelerated vector distance via WGSL compute shaders
- Import/export adapters for Pinecone, ChromaDB, CSV, and JSONL formats
- Structured output with `generateObject()`, `streamObject()`, and Zod schema support
- Language model middleware with `wrapLanguageModel()` and `composeLanguageModelMiddleware()`
- Semantic cache middleware for LLM response caching via embedding similarity
- Scalar (SQ8) and product quantization (PQ) for 4-32x vector compression
- Storage compression with `compressVectors()` and `decompressVectors()`
- Differential privacy middleware for embeddings and classification
- Multimodal embeddings with `embedImage()` and CLIP support
- Embedding drift detection with model fingerprinting and automatic reindexing
- Threshold calibration from corpus sampling with per-model presets
- Adaptive batch sizing via `computeOptimalBatchSize()`
- Model registry with device-aware recommendations via `recommendModels()`
- Semantic chunking via embedding cosine similarity for topic-boundary detection
- Typed VectorDB metadata with generic type parameter and Zod schema validation
- Audio classification and depth estimation functions
- **Breaking**: `ChatMessage.content` is now `string | ContentPart[]`
- **Breaking**: `StorageAdapter` requires new `updateCollection()` method
- **Breaking**: `jsonSchema()` signature updated for Zod 4 compatibility

## 1.0.2

### Patch Changes

- bump to v1.0.2

## 1.0.1

### Patch Changes

- d311bd7: update package metadata and readme files
