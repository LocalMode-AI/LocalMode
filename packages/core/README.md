# @localmode/core

Local-first AI utilities for the browser. Zero dependencies. Privacy-first.

[![npm](https://img.shields.io/npm/v/@localmode/core)](https://npmjs.com/package/@localmode/core)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@localmode/core)](https://bundlephobia.com/package/@localmode/core)
[![license](https://img.shields.io/npm/l/@localmode/core)](../../LICENSE)

[![Docs](https://img.shields.io/badge/Docs-LocalMode.dev-red)](https://localmode.dev)
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
| [`@localmode/pdfjs`](https://npmjs.com/package/@localmode/pdfjs)               | PDF text extraction                  |

---

## Overview

`@localmode/core` is a **zero-dependency** package containing all functions, interfaces, types, and utilities for building local-first AI applications. Provider packages (like `@localmode/transformers` and `@localmode/webllm`) implement these interfaces with specific ML frameworks.

## Features

### ✅ Live Features

These features are production-ready and actively used in applications.

#### Vector Database

- HNSW index for fast approximate nearest neighbor search
- IndexedDB persistence with memory fallback
- Cross-tab synchronization via Web Locks and BroadcastChannel
- Metadata filtering with extensible operators

#### Embeddings

- `embed()` - Generate embeddings for single values
- `embedMany()` - Batch embedding with progress tracking
- `semanticSearch()` - Search with embeddings
- Middleware support for caching, logging, validation

#### Reranking

- `rerank()` - Document reranking for improved RAG accuracy

#### RAG Utilities

- Text chunking (recursive, markdown, code-aware)
- `chunk()` - Split documents into optimal chunks
- Configurable separators and overlap

#### Text Generation (Streaming)

- `streamText()` - Streaming text generation with async iteration
- AbortSignal support for cancellation
- Works with WebLLM for local LLM inference

#### Storage

- `IndexedDBStorage` - Persistent browser storage
- `MemoryStorage` - In-memory fallback
- Automatic quota management and cleanup

#### Capabilities Detection

- `isWebGPUSupported()` - Check WebGPU availability
- `detectCapabilities()` - Full device capability report
- Automatic fallback recommendations

---

### 🚧 Coming Soon

These features have interfaces defined and are under active development.

#### Classification & NLP

- `classify()`, `classifyMany()` - Text classification
- `classifyZeroShot()` - Zero-shot classification with custom labels
- `extractEntities()`, `extractEntitiesMany()` - Named Entity Recognition

#### Audio

- `transcribe()` - Speech-to-text with Whisper models
- `synthesizeSpeech()` - Text-to-speech synthesis
- Word and segment-level timestamps
- Multi-language support

#### Vision

- `classifyImage()` - Image classification
- `classifyImageZeroShot()` - Zero-shot image classification
- `captionImage()` - Image captioning with BLIP models
- `segmentImage()` - Image segmentation / background removal
- `detectObjects()` - Object detection with bounding boxes
- `extractImageFeatures()` - Image feature extraction for similarity
- `imageToImage()` - Image transformation / super resolution

#### Text Generation (Complete)

- `generateText()` - Complete text generation with LLMs

#### Translation

- `translate()` - Text translation between languages

#### Summarization

- `summarize()` - Text summarization with configurable length

#### Fill-Mask

- `fillMask()` - Masked token prediction (BERT-style)

#### Question Answering

- `answerQuestion()` - Extractive question answering from context

#### OCR

- `extractText()` - Optical character recognition from images

#### Document QA

- `askDocument()` - Question answering on document images
- `askTable()` - Question answering on tabular data

#### Advanced RAG

- BM25 keyword search
- Hybrid search combining vector and keyword results
- Document loaders (Text, JSON, CSV, HTML)

---

## Quick Start

### Semantic Search with PDF Documents

```typescript
import { createVectorDB, embed, embedMany, chunk, rerank } from '@localmode/core';
import { transformers } from '@localmode/transformers';

// Create embedding model
const embeddingModel = transformers.embedding('Xenova/all-MiniLM-L6-v2');

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
  // BM25 (Coming Soon)
  createBM25,
  // Hybrid Search (Coming Soon)
  hybridFuse,
  reciprocalRankFusion,
  // Ingestion
  ingest,
} from '@localmode/core';
```

### Text Generation

```typescript
import {
  streamText, // ✅ Live
  generateText, // 🚧 Coming Soon
} from '@localmode/core';
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
} from '@localmode/core';
```

### Classification (Coming Soon)

```typescript
import { classify, classifyMany, classifyZeroShot } from '@localmode/core';
```

### NER (Coming Soon)

```typescript
import { extractEntities, extractEntitiesMany } from '@localmode/core';
```

### Audio (Coming Soon)

```typescript
import { transcribe, synthesizeSpeech } from '@localmode/core';
```

### Vision (Coming Soon)

```typescript
import {
  classifyImage,
  classifyImageZeroShot,
  captionImage,
  segmentImage,
  detectObjects,
  extractImageFeatures,
  imageToImage,
} from '@localmode/core';
```

### Translation (Coming Soon)

```typescript
import { translate } from '@localmode/core';
```

### Summarization (Coming Soon)

```typescript
import { summarize } from '@localmode/core';
```

### Fill-Mask (Coming Soon)

```typescript
import { fillMask } from '@localmode/core';
```

### Question Answering (Coming Soon)

```typescript
import { answerQuestion } from '@localmode/core';
```

### OCR (Coming Soon)

```typescript
import { extractText } from '@localmode/core';
```

### Document QA (Coming Soon)

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
const embedder = transformers.embedding('Xenova/all-MiniLM-L6-v2');

// @localmode/webllm - WebLLM for local LLMs
import { webllm } from '@localmode/webllm';
const llm = webllm.languageModel('Llama-3.2-1B-Instruct-q4f16_1-MLC');
```

### Function-First API

All operations are exposed as top-level async functions:

```typescript
// ✅ Correct: Top-level functions
const { embedding } = await embed({ model, value: 'Hello' });

// ❌ Wrong: Class methods
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
