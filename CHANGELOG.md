# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-03-25

Major release expanding LocalMode from an embeddings-and-search toolkit into a comprehensive local-first AI platform. Adds 6 new packages, 8 new core domains, 30 new showcase applications, and full documentation coverage.

### Added

#### New Packages

- **`@localmode/react`** — Complete React integration with 34+ hooks (`useEmbed`, `useGenerateText`, `useClassify`, `useChat`, `useAgent`, `usePipeline`, `useSemanticCache`, `useCalibrateThreshold`, and more), operation utilities (`useOperation`, `useOperationList`, `useSequentialBatch`, `useStreaming`), and helpers (`toAppError`, `readFileAsDataUrl`, `validateFile`, `downloadBlob`)
- **`@localmode/wllama`** — GGUF model provider via llama.cpp WASM with access to 135K+ HuggingFace models, GGUF metadata parser, and universal browser support (no WebGPU required)
- **`@localmode/chrome-ai`** — Chrome Built-in AI provider for zero-download inference via Gemini Nano, with summarization and translation implementations and automatic fallback
- **`@localmode/ai-sdk`** — Vercel AI SDK provider adapter with `LanguageModel` and `EmbeddingModel` adapters for seamless integration with the AI SDK ecosystem
- **`@localmode/devtools`** — In-app DevTools widget for real-time observability of models, inference queue, pipeline execution, events, VectorDB state, and device capabilities across 6 panels
- **`@localmode/langchain`** — LangChain.js adapters including `LocalModeEmbeddings`, `ChatLocalMode`, `LocalModeVectorStore`, and reranker integration

#### `@localmode/core` — New Domains

- **Agent Framework** (`core/src/agents/`) — Local-first ReAct agent loop with `createAgent()`, `runAgent()`, type-safe tool registry via `createToolRegistry()`, and VectorDB-backed conversation memory via `createAgentMemory()`. Supports configurable max steps, timeout, loop detection, and step-level observability callbacks
- **Evaluation SDK** (`core/src/evaluation/`) — Model evaluation orchestrator `evaluateModel()` with built-in metrics: `accuracy`, `precision`, `recall`, `f1Score`, `bleuScore`, `rougeScore`, `cosineDistance`, `mrr`, `ndcg`, and `confusionMatrix`. Supports batch evaluation with progress callbacks and AbortSignal
- **Import/Export Adapters** (`core/src/import-export/`) — Vector data migration with `importFrom()`, `exportToCSV()`, `exportToJSONL()`, and `convertFormat()`. Parses Pinecone, ChromaDB, CSV, and JSONL formats with auto-detection, text-only record re-embedding, and dimension validation
- **WebGPU Vector Distance** (`core/src/hnsw/gpu/`) — GPU-accelerated batch distance computation via WGSL compute shaders for cosine, euclidean, and dot product metrics. Automatic CPU fallback with threshold-based dispatch via `createGPUDistanceComputer()`
- **Pipeline Builder** (`core/src/pipeline/`) — Composable multi-step workflows via `createPipeline()` with chainable `.step()` builder and pre-built step factories: `embedStep`, `embedManyStep`, `chunkStep`, `semanticChunkStep`, `searchStep`, `rerankStep`, `storeStep`, `classifyStep`, `summarizeStep`, `generateStep`. Supports progress callbacks and AbortSignal
- **Inference Queue** (`core/src/queue/`) — Priority-based task scheduling via `createInferenceQueue()` with multi-priority levels (interactive, background, prefetch), concurrency limiting, per-task AbortSignal, and real-time stats events
- **Model Cache** (`core/src/model-cache/`) — Chunked model downloads via `createModelLoader()` with 16MB IndexedDB chunks, HTTP Range resume, LRU eviction, cross-tab Web Lock coordination, exponential backoff retry, and human-readable size config (`'2GB'`, `'512MB'`)
- **Model Registry & Recommendations** (`core/src/capabilities/`) — Curated model catalog with `registerModel()`, `getModelRegistry()`, and device-aware scoring/ranking via `recommendModels()`. Includes `computeOptimalBatchSize()` for adaptive batch sizing across 21 task categories

#### `@localmode/core` — New Features

- **Semantic Cache** (`core/src/cache/`) — VectorDB-backed response caching via `semanticCacheMiddleware` for `LanguageModel`. Near-duplicate query detection using embedding similarity
- **Language Model Middleware** (`core/src/generation/middleware.ts`) — `wrapLanguageModel()` and `composeLanguageModelMiddleware()` for transforming params, wrapping generate, and wrapping stream operations
- **Structured Output** (`core/src/generation/`) — `generateObject()` and `streamObject()` for JSON schema-validated structured generation with Zod integration
- **Multimodal Content** (`core/src/generation/content.ts`) — `normalizeContent()` and `getTextContent()` for `ContentPart[]` (text + image) handling in generation
- **Scalar Vector Quantization (SQ8)** (`core/src/quantization/scalar.ts`) — 4x storage compression with >95% recall via `calibrate()`, `scalarQuantize()`, and `scalarDequantize()`
- **Product Quantization (PQ)** (`core/src/quantization/pq.ts`) — 8-32x compression via k-means codebooks with `trainPQ()`, `pqQuantize()`, `pqDequantize()`, and `kMeansCluster()`
- **Storage Compression** (`core/src/storage/compression.ts`) — `compressVectors()`, `decompressVectors()`, and `getCompressionStats()` for SQ8/delta-SQ8 storage-level compression (4x disk reduction)
- **Differential Privacy** (`core/src/security/dp-*.ts`) — `dpEmbeddingMiddleware` and `dpClassificationMiddleware` with calibrated Gaussian/Laplacian noise, privacy budget tracking via `createPrivacyBudget()`, and sensitivity analysis
- **Multimodal Embeddings** (`core/src/multimodal/`) — `embedImage()` and `MultimodalEmbeddingModel` interface for cross-modal (image + text) embedding via CLIP
- **Embedding Drift Detection** (`core/src/embeddings/reindex.ts`) — `extractFingerprint()`, `fingerprintsMatch()`, `checkModelCompatibility()`, and `reindexCollection()` for model change detection and automatic re-embedding
- **Threshold Calibration** (`core/src/embeddings/calibrate-threshold.ts`) — `calibrateThreshold()` for empirical confidence thresholds from corpus sampling, plus `getDefaultThreshold()` with `MODEL_THRESHOLD_PRESETS` for curated per-model defaults
- **Adaptive Batching** (`core/src/capabilities/batch-size.ts`) — `computeOptimalBatchSize()` for device-aware batch sizing in `streamEmbedMany()` and `ingest()`
- **Semantic Chunking** (`core/src/rag/chunkers/semantic.ts`) — `semanticChunk()` for topic-boundary detection using embedding cosine similarity with auto-threshold computation
- **Typed VectorDB Metadata** — Generic type parameter on `createVectorDB<T>()` for compile-time metadata type safety with Zod schema validation
- **Audio Classification** (`core/src/audio/classify-audio.ts`) — `classifyAudio()` function for audio content classification
- **Depth Estimation** (`core/src/vision/estimate-depth.ts`) — `estimateDepth()` function for monocular depth estimation

#### `@localmode/transformers` — New Implementations

- **Language Model** (`transformers/src/implementations/language-model.ts`) — 14 curated ONNX text generation models via Transformers.js v4, including 3 vision-capable models (Qwen2.5). Uses npm alias `@huggingface/transformers-v4` for v3/v4 coexistence
- **CLIP Embedding** (`transformers/src/implementations/clip-embedding.ts`) — Multimodal embedding implementation for cross-modal image+text search
- **Audio Classifier** (`transformers/src/implementations/audio-classifier.ts`) — Audio classification via Transformers.js
- **Depth Estimator** (`transformers/src/implementations/depth-estimator.ts`) — Monocular depth estimation via Transformers.js

#### `@localmode/webllm` — Enhancements

- Added `models.ts` with curated model list of 23 models including Phi 3.5 vision
- Enhanced provider, model, and type definitions for improved model management

#### Storage Adapters — Enhancements

- **`@localmode/dexie`** — Updated storage implementation with new types and full test coverage
- **`@localmode/idb`** — Updated storage implementation with new types and test suite
- **`@localmode/localforage`** — Updated storage implementation with new types and test suite

#### Showcase Applications (apps/showcase-nextjs)

30 new self-contained demo applications, each with `_components/`, `_hooks/`, `_lib/`, `_services/`, and `page.tsx`:

- **audiobook-creator** — Text-to-speech audiobook generation with chapter management
- **background-remover** — Image segmentation for background removal/replacement
- **cross-modal-search** — CLIP-based image+text search across photo collections
- **data-extractor** — Structured data extraction from documents
- **data-migrator** — Vector data import/export across formats (Pinecone, ChromaDB, CSV, JSONL)
- **document-redactor** — Automatic PII redaction in documents
- **duplicate-finder** — Semantic duplicate detection in datasets
- **email-classifier** — Email categorization (spam, urgent, etc.)
- **encrypted-vault** — Web Crypto encrypted local storage
- **gguf-explorer** — GGUF model browser and chat interface
- **image-captioner** — AI image captioning
- **invoice-qa** — Document question-answering on invoices
- **langchain-rag** — RAG pipeline using LangChain.js adapters
- **meeting-assistant** — Speech-to-text transcription with summarization
- **model-advisor** — Device-aware model recommendation engine
- **model-evaluator** — Threshold calibration and model performance evaluation
- **object-detector** — Real-time object detection visualization
- **ocr-scanner** — Optical character recognition from images
- **photo-enhancer** — Image-to-image upscaling and enhancement
- **product-search** — Semantic product catalog search
- **qa-bot** — Question-answering chatbot on custom documents
- **research-agent** — Multi-step research agent using ReAct loop
- **semantic-search** — Vector search with import/export support
- **sentiment-analyzer** — Text sentiment classification
- **smart-autocomplete** — Fill-mask token prediction
- **smart-gallery** — AI-powered image gallery with semantic tagging
- **smart-writer** — Text generation, translation, and summarization
- **text-summarizer** — Document summarization
- **translator** — Multi-language text translation
- **voice-notes** — Speech-to-text note-taking

#### Documentation (apps/docs)

- **45 new blog posts** covering topics from browser AI architecture to migration guides, GDPR compliance, and practical recipes
- **30+ new Core API pages** — agents, audio, classification, differential privacy, document loaders, document QA, embedding drift, evaluation, fill-mask, import/export, inference queue, model cache, OCR, pipelines, question answering, structured output, summarization, threshold calibration, translation, typed metadata, vision, WebGPU vector search
- **New provider documentation** — ai-sdk, chrome-ai (with fallbacks, summarization, translation), devtools (with panels), dexie, idb, langchain (chat, embeddings, migration, vector store), localforage, wllama (with GGUF models)
- **New React documentation** — advanced patterns, agents, audio, chat, classification, embeddings, generation, import/export, pipelines, utilities, vision

### Changed

- **llm-chat showcase** — Refactored with agent mode, image upload, vision support, and enhanced model selector
- **pdf-search showcase** — Refactored with GPU-accelerated search and improved document handling
- **Showcase home page** — Updated navbar, device stats component, app constants, and type definitions
- **Showcase layout** — Added DevTools widget integration and ONNX Runtime warning suppression
- **Showcase dependencies** — Updated `package.json` and `next.config.ts` for new providers and WASM support
- **Core docs pages** — Updated capabilities, embeddings, events, generation, language model middleware, middleware, multimodal embeddings, RAG, reranking, security, semantic cache, storage, sync, vector DB, and vector quantization pages
- **Transformers docs** — Updated embeddings, index, and reranking pages
- **Docs configuration** — Updated `source.config.ts`, layout shared config, source routing, and home page
- **`@localmode/pdfjs`** — Enhanced PDF text extraction

### Fixed

- Layout and overflow handling for code examples in docs app homepage

---

## [1.0.2] - 2025-12-31

### Changed

- Bumped all published packages to v1.0.2 (`@localmode/core`, `@localmode/transformers`, `@localmode/webllm`, `@localmode/pdfjs`, `@localmode/chrome-ai`)
- Updated README files to include version badges and documentation links for all packages

---

## [1.0.1] - 2025-12-31

### Changed

- Updated package metadata and README files across all packages

---

## [1.0.0] - 2025-12-30

Initial public release of LocalMode — a local-first, privacy-first, offline-first AI toolkit for the browser.

### Added

#### Packages

- **`@localmode/core`** (v1.0.0) — Zero-dependency core package with:
  - **Embeddings** — `embed()`, `embedMany()`, `semanticSearch()`, `EmbeddingModel` interface, embedding model middleware with `wrapEmbeddingModel()`
  - **Classification** — `classify()`, `classifyMany()`, `extractEntities()`, `rerank()` with `ClassificationModel`, `ZeroShotClassificationModel`, `NERModel`, `RerankerModel` interfaces
  - **Generation** — `generateText()`, `streamText()` with `LanguageModel` interface
  - **Translation** — `translate()` with `TranslationModel` interface
  - **Summarization** — `summarize()` with `SummarizationModel` interface
  - **Fill-Mask** — `fillMask()` with `FillMaskModel` interface
  - **Question Answering** — `answerQuestion()` with `QuestionAnsweringModel` interface
  - **OCR** — `recognizeText()` with `OCRModel` interface
  - **Document QA** — `answerDocumentQuestion()` with `DocumentQAModel` and `TableQAModel` interfaces
  - **Audio** — `transcribe()`, `synthesizeSpeech()` with `SpeechToTextModel` and `TextToSpeechModel` interfaces
  - **Vision** — `classifyImage()`, `captionImage()`, `detectObjects()`, `segmentImage()`, `extractFeatures()`, `imageToImage()` with full vision interface set
  - **VectorDB** — HNSW index with cosine, euclidean, and dot product distance metrics, IndexedDB and Memory storage backends
  - **RAG** — `ingest()`, `chunk()` with recursive, markdown, and code chunkers, BM25 scoring, hybrid search
  - **Storage** — `IndexedDBStorage`, `MemoryStorage`, WAL (Write-Ahead Log), migrations, quota management, cleanup utilities
  - **Security** — `encrypt()`, `decrypt()`, `deriveKey()` via Web Crypto API, `redactPII()`, `piiRedactionMiddleware`, `encryptionMiddleware`
  - **Middleware** — `cachingMiddleware`, `loggingMiddleware`, `retryMiddleware`, `validationMiddleware`, VectorDB middleware with before/after hooks
  - **Capabilities** — `detectCapabilities()`, `isWebGPUSupported()`, `isIndexedDBSupported()`, `isCrossOriginIsolated()` feature detection
  - **Events** — `globalEventBus` for cross-component communication
  - **Sync** — `createBroadcaster()`, `createLockManager()` for cross-tab coordination
  - **Providers** — `setGlobalProvider()`, `createProviderWithFallback()`, `createStorageWithFallback()` for provider management
  - **Testing** — `createMockEmbeddingModel()`, `createMockClassificationModel()`, `createMockStorage()`, `createMockVectorDB()`, `createSeededRandom()`, `createTestVector()` mock utilities
  - **Errors** — Structured error hierarchy (`LocalModeError`, `EmbeddingError`, `StorageError`, `ValidationError`, etc.) with actionable hints

- **`@localmode/transformers`** (v1.0.0) — HuggingFace Transformers.js provider with 21 implementations:
  - embedding, classifier, zero-shot, NER, reranker, translator, summarizer, fill-mask, question-answering, speech-to-text, text-to-speech, image-classifier, captioner, object-detector, segmenter, OCR, document-qa, image-feature, image-to-image, zero-shot-image
  - Model preloading, caching, and progress callbacks

- **`@localmode/webllm`** (v1.0.0) — WebLLM provider for local LLM inference with streaming text generation

- **`@localmode/pdfjs`** (v1.0.0) — PDF text extraction via PDF.js for document loading

- **`@localmode/dexie`** (v1.0.0) — Dexie.js storage adapter (~15KB) implementing the `Storage` interface

- **`@localmode/idb`** (v1.0.0) — idb storage adapter (~3KB) implementing the `Storage` interface

- **`@localmode/localforage`** (v1.0.0) — localForage storage adapter (~10KB) with automatic fallback

#### Applications

- **showcase-nextjs** (v1.0.0) — Next.js 16 showcase application with:
  - **llm-chat** — Local LLM chat interface with model selection and streaming
  - **pdf-search** — PDF document semantic search with RAG pipeline
  - Device capability detection and display
  - Responsive design with Tailwind CSS 4 + daisyUI 5

- **docs** — Documentation site at localmode.dev with getting-started guide and core API reference

