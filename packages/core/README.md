# @localmode/core

Local-first AI utilities for the browser. Zero dependencies. Privacy-first.

[![npm](https://img.shields.io/npm/v/@localmode/core)](https://npmjs.com/package/@localmode/core)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@localmode/core)](https://bundlephobia.com/package/@localmode/core)
[![license](https://img.shields.io/npm/l/@localmode/core)](../../LICENSE)

[![Docs](https://img.shields.io/badge/Docs-LocalMode.dev-red)](https://localmode.dev/docs/core)
[![Demo](https://img.shields.io/badge/Demo-LocalMode.ai-purple)](https://localmode.ai)


## Installation

```bash
# Preferred: pnpm
pnpm install @localmode/core

# Alternative: npm
npm install @localmode/core
```

## Related Packages

| Package                                                                        | Description                          |
| ------------------------------------------------------------------------------ | ------------------------------------ |
| [`@localmode/transformers`](https://npmjs.com/package/@localmode/transformers) | HuggingFace Transformers.js provider |
| [`@localmode/webllm`](https://npmjs.com/package/@localmode/webllm)             | WebLLM provider for local LLMs       |
| [`@localmode/wllama`](https://npmjs.com/package/@localmode/wllama)             | GGUF model provider via llama.cpp WASM |
| [`@localmode/react`](https://npmjs.com/package/@localmode/react)               | React hooks for all core functions   |
| [`@localmode/chrome-ai`](https://npmjs.com/package/@localmode/chrome-ai)       | Chrome Built-in AI provider          |
| [`@localmode/langchain`](https://npmjs.com/package/@localmode/langchain)       | LangChain.js adapters                |
| [`@localmode/devtools`](https://npmjs.com/package/@localmode/devtools)         | In-app DevTools widget               |
| [`@localmode/pdfjs`](https://npmjs.com/package/@localmode/pdfjs)               | PDF text extraction                  |
| [`@localmode/dexie`](https://npmjs.com/package/@localmode/dexie)               | Dexie.js storage adapter             |
| [`@localmode/idb`](https://npmjs.com/package/@localmode/idb)                   | Minimal idb storage adapter          |
| [`@localmode/localforage`](https://npmjs.com/package/@localmode/localforage)   | Cross-browser storage adapter        |

---

## Overview

`@localmode/core` is a **zero-dependency** package containing all functions, interfaces, types, and utilities for building local-first AI applications. Provider packages (like `@localmode/transformers` and `@localmode/webllm`) implement these interfaces with specific ML frameworks.

## Features

### Vector Database

- HNSW index for fast approximate nearest neighbor search
- IndexedDB persistence with memory fallback
- Cross-tab synchronization via Web Locks and BroadcastChannel
- Metadata filtering with extensible operators
- Scalar quantization (SQ8) for 4x storage reduction with >95% recall
- Product quantization (PQ) for 8-32x storage reduction (85-92% recall)
- **Storage compression** (`compression: { type: 'sq8' }`) for 4x IndexedDB disk reduction without any search recall impact
- **Typed metadata** with generic `createVectorDB<TMetadata>()` for compile-time filter safety
- Optional Zod schema validation on `add()`/`addMany()`
- `TypedFilterQuery<TMetadata>` for autocomplete on filter keys and operators

### Pipelines — [Docs](https://localmode.dev/docs/core/pipelines)

- `createPipeline()` - Composable multi-step workflow builder
- Type-safe step chaining with progress tracking
- Pre-built step factories: `embedStep`, `chunkStep`, `searchStep`, `rerankStep`, `storeStep`, `classifyStep`, `summarizeStep`, `generateStep`
- AbortSignal propagation between steps
- `PipelineError` with step context (name, index, cause)

### Inference Queue — [Docs](https://localmode.dev/docs/core/inference-queue)

- `createInferenceQueue()` - Priority-based task scheduling
- Configurable concurrency and priority levels (`interactive` > `background` > `prefetch`)
- Stats events for monitoring (pending, active, completed, avgLatencyMs)
- AbortSignal support for queued tasks
- `clear()` and `destroy()` lifecycle methods

### Embeddings — [Docs](https://localmode.dev/docs/core/embeddings)

- `embed()` - Generate embeddings for single values
- `embedMany()` - Batch embedding with progress tracking
- `semanticSearch()` - Search with embeddings
- Middleware support for caching, logging, validation

### Embedding Drift Detection — [Docs](https://localmode.dev/docs/core/embedding-drift)

- `ModelFingerprint` type tracks which model produced a collection's vectors
- Automatic drift detection on `VectorDB.initialize()` with `modelDriftDetected` event
- `checkModelCompatibility()` - Read-only compatibility check
- `reindexCollection()` - Batch re-embedding with resumability, progress, cancellation
- Inference queue integration at `'background'` priority
- Cross-tab locking via Web Locks API

### Similarity Threshold Calibration — [Docs](https://localmode.dev/docs/core/threshold-calibration)

- `calibrateThreshold()` - Empirical threshold from corpus embedding distribution
- `MODEL_THRESHOLD_PRESETS` - Known-good defaults for popular embedding models
- `getDefaultThreshold()` - Instant preset lookup
- Distribution statistics (mean, median, stdDev, min, max) for observability
- Configurable percentile, distance function, maxSamples, AbortSignal

#### Multimodal Embeddings

- `embedImage()` - Embed images into the same vector space as text
- `embedManyImages()` - Batch image embedding
- `MultimodalEmbeddingModel` interface for CLIP/SigLIP providers
- Cross-modal similarity search (text-to-image, image-to-text)

### Reranking — [Docs](https://localmode.dev/docs/core/reranking)

- `rerank()` - Document reranking for improved RAG accuracy

### RAG Utilities — [Docs](https://localmode.dev/docs/core/rag)

- Text chunking (recursive, markdown, code-aware, semantic)
- `chunk()` - Split documents into optimal chunks
- `semanticChunk()` - Embedding-aware chunking at topic boundaries
- `createBM25()` - BM25 keyword search
- `hybridFuse()`, `reciprocalRankFusion()` - Hybrid search combining vector and keyword results
- Document loaders (Text, JSON, CSV, HTML)

### WebGPU-Accelerated Vector Search — [Docs](https://localmode.dev/docs/core/webgpu-vector-search)

- `createGPUDistanceComputer()` - GPU-accelerated batch distance computation via WGSL shaders
- `GPUDistanceManager` - WebGPU device lifecycle, buffer pooling, pipeline caching
- Cosine, euclidean, and dot product distance on GPU
- `enableGPU` option on `createVectorDB()` for transparent GPU acceleration
- Graceful CPU fallback when WebGPU is unavailable
- Configurable batch threshold (default 64) — GPU for large batches, CPU for small

### Agent Framework — [Docs](https://localmode.dev/docs/core/agents)

- `createAgent()` - Create reusable agents with tools, instructions, and optional memory
- `runAgent()` - One-shot agent execution with ReAct loop
- `createToolRegistry()` - Type-safe tool registration with Zod schemas
- `createAgentMemory()` - VectorDB-backed conversation memory with semantic retrieval
- Max-step guards, loop detection, duration limits
- Works with any `LanguageModel` provider (WebLLM, wllama, etc.)

### Vector Import/Export — [Docs](https://localmode.dev/docs/core/import-export)

- `importFrom()` - Import vectors from Pinecone, ChromaDB, CSV, or JSONL
- `parseExternalFormat()` - Parse and preview external formats without importing
- `exportToCSV()`, `exportToJSONL()` - Export vector collections
- `convertFormat()` - Standalone format-to-format conversion
- Auto-detect format from content, re-embedding for text-only imports
- Batch processing with progress callbacks and AbortSignal

### Text Generation — [Docs](https://localmode.dev/docs/core/generation)

- `streamText()` - Streaming text generation with async iteration
- `generateText()` - Complete text generation with LLMs
- `generateObject()` - Generate typed, validated JSON objects with schema
- `streamObject()` - Stream partial JSON objects with final validation
- `jsonSchema()` - Convert Zod schemas for structured output
- **Vision/Multimodal** — `ContentPart` union type (`TextPart | ImagePart`) for sending images to vision-capable models
- `normalizeContent()`, `getTextContent()` - Multimodal content utilities
- `supportsVision` flag on `LanguageModel` interface for feature detection
- AbortSignal support for cancellation
- Works with WebLLM (Phi 3.5 Vision), Transformers (Qwen3.5), and wllama for local LLM inference

### Classification & NLP — [Docs](https://localmode.dev/docs/core/classification)

- `classify()`, `classifyMany()` - Text classification
- `classifyZeroShot()` - Zero-shot classification with custom labels
- `extractEntities()`, `extractEntitiesMany()` - Named Entity Recognition

### Audio — [Docs](https://localmode.dev/docs/core/audio)

- `transcribe()` - Speech-to-text with Whisper models
- `synthesizeSpeech()` - Text-to-speech synthesis
- `classifyAudio()` - Audio classification
- `classifyAudioZeroShot()` - Zero-shot audio classification
- Word and segment-level timestamps, multi-language support

### Vision — [Docs](https://localmode.dev/docs/core/vision)

- `classifyImage()` - Image classification
- `classifyImageZeroShot()` - Zero-shot image classification
- `captionImage()` - Image captioning with BLIP/Florence models
- `segmentImage()` - Image segmentation / background removal
- `detectObjects()` - Object detection with bounding boxes
- `extractImageFeatures()` - Image feature extraction for similarity
- `upscaleImage()` / `imageToImage()` - Image super resolution
- `estimateDepth()` - Monocular depth estimation

#### Text Generation (Complete)

- `generateText()` - Complete text generation with LLMs
- `wrapLanguageModel()` - Language model middleware for caching, logging, guardrails
- `composeLanguageModelMiddleware()` - Compose multiple middleware

#### Semantic Cache

- `createSemanticCache()` - Cache LLM responses using embedding similarity
- `semanticCacheMiddleware()` - Transparent caching middleware for generateText/streamText

### Translation — [Docs](https://localmode.dev/docs/core/translation)

- `translate()` - Text translation between languages

### Summarization — [Docs](https://localmode.dev/docs/core/summarization)

- `summarize()` - Text summarization with configurable length

### Fill-Mask — [Docs](https://localmode.dev/docs/core/fill-mask)

- `fillMask()` - Masked token prediction (BERT-style)

### Question Answering — [Docs](https://localmode.dev/docs/core/question-answering)

- `answerQuestion()` - Extractive question answering from context

### OCR — [Docs](https://localmode.dev/docs/core/ocr)

- `extractText()` - Optical character recognition from images

### Document QA — [Docs](https://localmode.dev/docs/core/document-qa)

- `askDocument()` - Question answering on document images
- `askTable()` - Question answering on tabular data

### Storage — [Docs](https://localmode.dev/docs/core/storage)

- `IndexedDBStorage` - Persistent browser storage
- `MemoryStorage` - In-memory fallback
- Automatic quota management and cleanup

### Evaluation SDK — [Docs](https://localmode.dev/docs/core/evaluation)

- `accuracy()`, `precision()`, `recall()`, `f1Score()` - Classification metrics
- `bleuScore()`, `rougeScore()` - Text generation metrics
- `mrr()`, `ndcg()` - Retrieval metrics
- `evalCosineDistance()` - Vector quality metric
- `confusionMatrix()` - Structured confusion matrix with helper methods
- `evaluateModel()` - Orchestrator: run model against dataset, apply metric, get report
- Custom metrics via `MetricFunction` type

### Capabilities Detection — [Docs](https://localmode.dev/docs/core/capabilities)

- `isWebGPUSupported()` - Check WebGPU availability
- `detectCapabilities()` - Full device capability report
- Automatic fallback recommendations
- `computeOptimalBatchSize()` - Adaptive batch sizing from device hardware (CPU cores, memory, GPU)
- `recommendModels()` - Ranked model recommendations for any task based on device capabilities
- `registerModel()` / `getModelRegistry()` - Curated model catalog with runtime extensibility

---

## Quick Start

### Semantic Search with PDF Documents

```typescript
import { createVectorDB, embed, embedMany, chunk, rerank } from '@localmode/core';
import { transformers } from '@localmode/transformers';

// Create embedding model
const embeddingModel = transformers.embedding('Xenova/bge-small-en-v1.5');

// Create vector database
const db = await createVectorDB({
  name: 'documents',
  dimensions: 384,
});

// Chunk and embed document
const chunks = chunk(documentText, {
  strategy: 'recursive',
  size: 512,
  overlap: 50,
});

const { embeddings } = await embedMany({
  model: embeddingModel,
  values: chunks.map((c) => c.text),
});

// Store in database
await db.addMany(
  chunks.map((c, i) => ({
    id: `chunk-${i}`,
    vector: embeddings[i],
    metadata: { text: c.text },
  }))
);

// Search
const { embedding: queryVector } = await embed({
  model: embeddingModel,
  value: 'What is machine learning?',
});

const results = await db.search(queryVector, { k: 10 });

// Optional: Rerank for better accuracy
const rerankerModel = transformers.reranker('Xenova/ms-marco-MiniLM-L-6-v2');
const reranked = await rerank({
  model: rerankerModel,
  query: 'What is machine learning?',
  documents: results.map((r) => r.metadata.text),
  topK: 5,
});
```

### Vector Quantization (4x Storage Reduction)

```typescript
import { createVectorDB } from '@localmode/core';

// Enable scalar quantization — same API, 4x less storage
const db = await createVectorDB({
  name: 'quantized-docs',
  dimensions: 384,
  quantization: { type: 'scalar' },
});

// Usage is identical — quantization is transparent
await db.add({ id: 'doc1', vector: embedding, metadata: { text: 'Hello' } });
const results = await db.search(queryVector, { k: 10 });

// Recalibrate if vector distribution changes significantly
await db.recalibrate({ onProgress: (done, total) => console.log(`${done}/${total}`) });
```

### LLM Chat with Streaming

```typescript
import { streamText } from '@localmode/core';
import { webllm } from '@localmode/webllm';

const model = webllm.languageModel('Llama-3.2-1B-Instruct-q4f16_1-MLC');

const result = await streamText({
  model,
  prompt: 'Explain quantum computing in simple terms',
  maxTokens: 500,
});

for await (const chunk of result.stream) {
  process.stdout.write(chunk.text);
}
```

---

## Core Exports

### Vector Database

```typescript
import {
  createVectorDB,
  createVectorDBWithWorker,
  HNSWIndex,
  cosineSimilarity,
  euclideanDistance,
  dotProduct,
} from '@localmode/core';
```

### Embeddings

```typescript
import {
  embed,
  embedMany,
  streamEmbedMany,
  semanticSearch,
  wrapEmbeddingModel,
} from '@localmode/core';
```

### Reranking

```typescript
import { rerank } from '@localmode/core';
```

### RAG Utilities

```typescript
import {
  // Chunking
  chunk,
  recursiveChunk,
  markdownChunk,
  codeChunk,
  // BM25
  createBM25,
  // Hybrid Search
  hybridFuse,
  reciprocalRankFusion,
  // Ingestion
  ingest,
} from '@localmode/core';
```

### Text Generation

```typescript
import { streamText, generateText } from '@localmode/core';
```

### Storage

```typescript
import {
  IndexedDBStorage,
  MemoryStorage,
  createStorage,
  getStorageQuota,
  requestPersistence,
  cleanup,
} from '@localmode/core';
```

### Capabilities

```typescript
import {
  detectCapabilities,
  isWebGPUSupported,
  isIndexedDBSupported,
  checkModelSupport,
  getRecommendedFallbacks,
  recommendModels,
  registerModel,
  getModelRegistry,
  DEFAULT_MODEL_REGISTRY,
} from '@localmode/core';
```

### Classification

```typescript
import { classify, classifyMany, classifyZeroShot } from '@localmode/core';
```

### NER

```typescript
import { extractEntities, extractEntitiesMany } from '@localmode/core';
```

### Audio

```typescript
import { transcribe, synthesizeSpeech, classifyAudio, classifyAudioZeroShot } from '@localmode/core';
```

### Vision

```typescript
import {
  classifyImage,
  classifyImageZeroShot,
  captionImage,
  segmentImage,
  detectObjects,
  extractImageFeatures,
  upscaleImage, // primary
  imageToImage, // alias for upscaleImage
  estimateDepth,
} from '@localmode/core';
```

### Translation

```typescript
import { translate } from '@localmode/core';
```

### Summarization

```typescript
import { summarize } from '@localmode/core';
```

### Fill-Mask

```typescript
import { fillMask } from '@localmode/core';
```

### Question Answering

```typescript
import { answerQuestion } from '@localmode/core';
```

### OCR

```typescript
import { extractText } from '@localmode/core';
```

### Document QA

```typescript
import { askDocument, askTable } from '@localmode/core';
```

### Middleware

```typescript
import {
  wrapEmbeddingModel,
  wrapVectorDB,
  cachingMiddleware,
  loggingMiddleware,
  retryMiddleware,
  rateLimitMiddleware,
  validationMiddleware,
  piiRedactionMiddleware,
  encryptionMiddleware,
} from '@localmode/core';
```

### Security

```typescript
import { encrypt, decrypt, deriveKey, isCryptoSupported, redactPII } from '@localmode/core';
```

### Differential Privacy

```typescript
import {
  // Embedding middleware — adds calibrated noise to embeddings
  dpEmbeddingMiddleware,
  // Classification middleware — randomized response for labels
  dpClassificationMiddleware,
  randomizedResponse,
  // Privacy budget tracking
  createPrivacyBudget,
  // Noise mechanisms
  gaussianNoise,
  laplacianNoise,
  // Sensitivity calibration
  calibrateSensitivity,
} from '@localmode/core';
```

### Cross-Tab Sync

```typescript
import { createBroadcaster, createLockManager, isWebLocksSupported } from '@localmode/core';
```

### Network

```typescript
import {
  getNetworkStatus,
  onNetworkChange,
  isOnline,
  isOffline,
  waitForOnline,
} from '@localmode/core';
```

### Events

```typescript
import { createEventEmitter, globalEventBus } from '@localmode/core';
```

### Errors

```typescript
import {
  LocalModeError,
  EmbeddingError,
  ModelNotFoundError,
  StorageError,
  QuotaExceededError,
  ValidationError,
  formatErrorForUser,
} from '@localmode/core';
```

### Testing Utilities

```typescript
import {
  createMockEmbeddingModel,
  createMockStorage,
  createMockVectorDB,
  createTestVector,
  createSeededRandom,
} from '@localmode/core';
```

---

## Architecture

### Zero-Dependency Core

`@localmode/core` has **zero external dependencies**. All functionality is implemented using native browser APIs:

- **Vector Search**: Custom HNSW implementation
- **Storage**: IndexedDB + Memory fallback
- **Encryption**: Web Crypto API
- **Sync**: Web Locks + BroadcastChannel

### Provider Pattern

Provider packages implement core interfaces:

```typescript
// @localmode/transformers - HuggingFace Transformers.js
import { transformers } from '@localmode/transformers';
const embedder = transformers.embedding('Xenova/bge-small-en-v1.5');

// @localmode/webllm - WebLLM for local LLMs
import { webllm } from '@localmode/webllm';
const llm = webllm.languageModel('Llama-3.2-1B-Instruct-q4f16_1-MLC');
```

### Function-First API

All operations are exposed as top-level async functions:

```typescript
// Correct: Top-level functions
const { embedding } = await embed({ model, value: 'Hello' });

// Wrong: Class methods
const embedder = new Embedder(model);
await embedder.embed('Hello');
```

### Options Object Pattern

All functions accept a single options object:

```typescript
const result = await embed({
  model: embeddingModel,
  value: 'Hello world',
  abortSignal: controller.signal, // Optional
});
```

### Structured Results

All functions return structured result objects:

```typescript
interface EmbedResult {
  embedding: Float32Array;
  usage: { tokens: number };
  response: { modelId: string; timestamp: Date };
}
```

---

## User Extensibility

Implement any core interface to create custom providers:

### Custom Storage

```typescript
import type { Storage } from '@localmode/core';

class MyRedisStorage implements Storage {
  async get(key: string) {
    /* ... */
  }
  async set(key: string, value: StoredDocument) {
    /* ... */
  }
  async delete(key: string) {
    /* ... */
  }
  async keys() {
    /* ... */
  }
  async clear() {
    /* ... */
  }
  async close() {
    /* ... */
  }
}

const db = await createVectorDB({
  storage: new MyRedisStorage(),
});
```

### Custom Embedding Model

```typescript
import type { EmbeddingModel } from '@localmode/core';

class MyAPIEmbedder implements EmbeddingModel {
  readonly modelId = 'custom:my-embedder';
  readonly provider = 'custom';
  readonly dimensions = 768;
  readonly maxEmbeddingsPerCall = 100;
  readonly supportsParallelCalls = true;

  async doEmbed(options: DoEmbedOptions) {
    // Your implementation
    return {
      embeddings: [new Float32Array(768)],
      usage: { tokens: 10 },
    };
  }
}

const { embedding } = await embed({
  model: new MyAPIEmbedder(),
  value: 'Hello',
});
```

---

## Browser Compatibility

| Browser     | WebGPU  | WASM | IndexedDB | Workers |
| ----------- | ------- | ---- | --------- | ------- |
| Chrome 80+  | 113+    | ✅   | ✅        | ✅      |
| Edge 80+    | 113+    | ✅   | ✅        | ✅      |
| Firefox 75+ | Nightly | ✅   | ✅        | ✅      |
| Safari 14+  | 18+     | ✅   | ✅        | ⚠️      |

### Platform Notes

- **Safari/iOS**: Private browsing blocks IndexedDB → use `MemoryStorage`
- **Firefox**: WebGPU Nightly only → use WASM backend
- **SharedArrayBuffer**: Requires cross-origin isolation

---

## Privacy Guarantees

- **No telemetry** - We don't track anything
- **No network requests** - Core package makes zero network calls
- **Data stays local** - All processing happens in your browser
- **Open source** - Audit the code yourself

---

## License

[MIT](../../LICENSE)
