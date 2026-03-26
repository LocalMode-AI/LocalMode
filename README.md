# LocalMode

**Local-first, privacy-first, offline-first AI for the browser.**

Run ML models entirely in your browser. No servers. No API keys. Your data never leaves your device.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Docs](https://img.shields.io/badge/Docs-LocalMode.dev-red)](https://localmode.dev)
[![Demo](https://img.shields.io/badge/Demo-LocalMode.ai-purple)](https://localmode.ai)

## What is LocalMode?

LocalMode is a monorepo of packages for building AI-powered applications that run 100% in the browser. Everything from embeddings and vector search to LLM chat, vision, audio, agents, and structured output works offline after the initial model download.

**13 packages. 32 demo apps. Zero cloud dependencies.**

### Why LocalMode?

- **Privacy** -- Your data never leaves your device. No telemetry, no tracking, no network requests from core.
- **Offline** -- Works without internet after model download. Automatic fallbacks for every capability.
- **Fast** -- No network latency. WebGPU acceleration where available. Instant inference.
- **Free** -- No API costs, no rate limits, unlimited usage.
- **Universal** -- Works in Chrome, Edge, Firefox, and Safari. Adapts to device capabilities.
- **Interoperable** -- Vercel AI SDK patterns. LangChain.js adapters. Import from Pinecone/ChromaDB.

---

## Packages

| Package | Version | Description |
| ------- | ------- | ----------- |
| [`@localmode/core`](./packages/core/README.md) | [![npm](https://img.shields.io/npm/v/@localmode/core.svg)](https://www.npmjs.com/package/@localmode/core) | Zero-dependency core -- VectorDB (HNSW, typed metadata, WebGPU search, SQ8/PQ quantization), pipelines, inference queue, model cache, agent framework (ReAct + tools + memory), evaluation SDK, vector import/export, multimodal content, all interfaces |
| [`@localmode/react`](./packages/react/README.md) | [![npm](https://img.shields.io/npm/v/@localmode/react.svg)](https://www.npmjs.com/package/@localmode/react) | 46 React hooks, 10 pipeline step factories, batch/list processing, and browser helpers |
| [`@localmode/ai-sdk`](./packages/ai-sdk/README.md) | [![npm](https://img.shields.io/npm/v/@localmode/ai-sdk.svg)](https://www.npmjs.com/package/@localmode/ai-sdk) | Vercel AI SDK provider for local models |
| [`@localmode/transformers`](./packages/transformers/README.md) | [![npm](https://img.shields.io/npm/v/@localmode/transformers.svg)](https://www.npmjs.com/package/@localmode/transformers) | HuggingFace Transformers.js provider -- 25 model factories covering embeddings, classification, vision, audio, OCR, multimodal (CLIP), and LLM inference via ONNX (Qwen3.5 vision support) |
| [`@localmode/webllm`](./packages/webllm/README.md) | [![npm](https://img.shields.io/npm/v/@localmode/webllm.svg)](https://www.npmjs.com/package/@localmode/webllm) | WebLLM provider for LLM inference via WebGPU -- 30 curated models including DeepSeek-R1, Qwen3, Llama 3.2, Phi 3.5 Vision |
| [`@localmode/wllama`](./packages/wllama/README.md) | [![npm](https://img.shields.io/npm/v/@localmode/wllama.svg)](https://www.npmjs.com/package/@localmode/wllama) | GGUF model provider via llama.cpp WASM -- curated catalog + 135K+ HuggingFace models, GGUF metadata inspection, universal browser support |
| [`@localmode/chrome-ai`](./packages/chrome-ai/README.md) | [![npm](https://img.shields.io/npm/v/@localmode/chrome-ai.svg)](https://www.npmjs.com/package/@localmode/chrome-ai) | Chrome Built-in AI provider -- zero-download inference via Gemini Nano with automatic fallback |
| [`@localmode/langchain`](./packages/langchain/README.md) | [![npm](https://img.shields.io/npm/v/@localmode/langchain.svg)](https://www.npmjs.com/package/@localmode/langchain) | LangChain.js adapters -- drop-in local embeddings, chat, vector store, and reranker for existing LangChain apps |
| [`@localmode/devtools`](./packages/devtools/README.md) | [![npm](https://img.shields.io/npm/v/@localmode/devtools.svg)](https://www.npmjs.com/package/@localmode/devtools) | In-app DevTools widget for model cache, VectorDB stats, and inference queue observability |
| [`@localmode/pdfjs`](./packages/pdfjs/README.md) | [![npm](https://img.shields.io/npm/v/@localmode/pdfjs.svg)](https://www.npmjs.com/package/@localmode/pdfjs) | PDF text extraction with PDF.js |
| [`@localmode/dexie`](./packages/dexie/README.md) | [![npm](https://img.shields.io/npm/v/@localmode/dexie.svg)](https://www.npmjs.com/package/@localmode/dexie) | Dexie.js storage adapter with schema versioning and transactions |
| [`@localmode/idb`](./packages/idb/README.md) | [![npm](https://img.shields.io/npm/v/@localmode/idb.svg)](https://www.npmjs.com/package/@localmode/idb) | Minimal IndexedDB storage adapter using the idb library |
| [`@localmode/localforage`](./packages/localforage/README.md) | [![npm](https://img.shields.io/npm/v/@localmode/localforage.svg)](https://www.npmjs.com/package/@localmode/localforage) | Cross-browser storage adapter with automatic fallback |

---

## Quick Start

### Semantic Search with Embeddings

```bash
pnpm install @localmode/core @localmode/transformers
```

```typescript
import { createVectorDB, embed, embedMany, chunk } from '@localmode/core';
import { transformers } from '@localmode/transformers';

// Create embedding model
const model = transformers.embedding('Xenova/bge-small-en-v1.5');

// Create vector database with typed metadata
const db = await createVectorDB<{ text: string }>({
  name: 'docs',
  dimensions: 384,
});

// Chunk and embed documents
const chunks = chunk(documentText, { size: 512, overlap: 50 });
const { embeddings } = await embedMany({
  model,
  values: chunks.map((c) => c.text),
});

// Store vectors
await db.addMany(
  chunks.map((c, i) => ({
    id: `chunk-${i}`,
    vector: embeddings[i],
    metadata: { text: c.text },
  }))
);

// Search
const { embedding: query } = await embed({ model, value: 'What is AI?' });
const results = await db.search(query, { k: 5 });
```

### LLM Chat with Streaming

Three providers implement the same `LanguageModel` interface -- choose based on your needs:

```bash
# WebGPU (fastest, 30 curated models)
pnpm install @localmode/core @localmode/webllm

# WASM (universal browser support, 135K+ GGUF models)
pnpm install @localmode/core @localmode/wllama

# ONNX (Transformers.js v4, same package as embeddings/vision/audio)
pnpm install @localmode/core @localmode/transformers
```

```typescript
import { streamText } from '@localmode/core';
import { webllm } from '@localmode/webllm';
import { wllama } from '@localmode/wllama';
import { transformers } from '@localmode/transformers';

// Pick any provider -- all implement the same LanguageModel interface
const model = webllm.languageModel('Llama-3.2-1B-Instruct-q4f16_1-MLC');       // WebGPU
// const model = wllama.languageModel('Llama-3.2-1B-Instruct-Q4_K_M');          // WASM (GGUF)
// const model = transformers.languageModel('onnx-community/Qwen3-0.6B-ONNX');  // ONNX

const result = await streamText({
  model,
  prompt: 'Explain quantum computing simply',
  maxTokens: 500,
});

for await (const chunk of result.stream) {
  process.stdout.write(chunk.text);
}
```

### Structured Output

```typescript
import { generateObject, jsonSchema } from '@localmode/core';
import { webllm } from '@localmode/webllm';
import { z } from 'zod';

const { object } = await generateObject({
  model: webllm.languageModel('Qwen3-1.7B-q4f16_1-MLC'),
  schema: jsonSchema(
    z.object({
      name: z.string(),
      age: z.number(),
      interests: z.array(z.string()),
    })
  ),
  prompt: 'Generate a profile for a software engineer named Alex',
});
```

### AI Agent with Tools

```typescript
import { createAgent, runAgent } from '@localmode/core';
import { webllm } from '@localmode/webllm';

const agent = createAgent({
  model: webllm.languageModel('Qwen3-1.7B-q4f16_1-MLC'),
  tools: {
    search: {
      description: 'Search the knowledge base',
      parameters: jsonSchema(z.object({ query: z.string() })),
      execute: async ({ query }) => searchDB(query),
    },
  },
  maxSteps: 5,
});

const result = await runAgent({ agent, prompt: 'Find documents about machine learning' });
```

### React Hooks

```typescript
import { useChat, useEmbed, useClassify } from '@localmode/react';
import { transformers } from '@localmode/transformers';
import { webllm } from '@localmode/webllm';

function ChatApp() {
  const { messages, sendMessage, isStreaming } = useChat({
    model: webllm.languageModel('Qwen3-1.7B-q4f16_1-MLC'),
  });

  return <ChatUI messages={messages} onSend={sendMessage} loading={isStreaming} />;
}
```

---

## Features

### Core AI Functions

| Feature | Functions | Description |
| ------- | --------- | ----------- |
| **Embeddings** | `embed()`, `embedMany()`, `streamEmbedMany()` | Text embeddings with streaming and batching |
| **Multimodal Embeddings** | `embedImage()`, `embedManyImages()` | CLIP-based text-image cross-modal search |
| **Streaming LLM** | `streamText()`, `generateText()` | Streaming and complete text generation |
| **Structured Output** | `generateObject()`, `streamObject()` | Typed JSON generation with Zod schema validation |
| **Classification** | `classify()`, `classifyZeroShot()`, `classifyMany()` | Sentiment, intent, topic classification |
| **NER** | `extractEntities()` | Named entity recognition |
| **Reranking** | `rerank()` | Document reranking for improved RAG |
| **Translation** | `translate()` | Multi-language translation (20+ languages) |
| **Summarization** | `summarize()` | Text summarization |
| **Question Answering** | `answerQuestion()` | Extractive QA with confidence scores |
| **Fill-Mask** | `fillMask()` | Masked token prediction (BERT-style) |
| **OCR** | `extractText()` | Optical character recognition |
| **Document QA** | `askDocument()`, `askTable()` | Visual document and table understanding |
| **Audio** | `transcribe()`, `synthesizeSpeech()`, `classifyAudio()` | Speech-to-text, TTS, audio classification |
| **Vision** | `classifyImage()`, `captionImage()`, `detectObjects()`, `segmentImage()`, `imageToImage()`, `estimateDepth()` | Image processing and analysis |

### Vector Database

| Feature | Functions | Description |
| ------- | --------- | ----------- |
| **Vector Database** | `createVectorDB()` | HNSW index, IndexedDB persistence, cross-tab sync, typed metadata |
| **Semantic Search** | `semanticSearch()`, `streamSemanticSearch()` | Query-time embed + search in one call |
| **Vector Quantization** | `createVectorDB({ quantization })` | SQ8 (4x) and Product Quantization (8-32x compression) |
| **Storage Compression** | `createVectorDB({ compression })` | SQ8 vector compression for 4x IndexedDB disk reduction |
| **WebGPU Vector Search** | `createGPUDistanceComputer()` | WGSL compute shaders for batch distance computation |
| **Hybrid Search** | `createHybridSearch()`, `reciprocalRankFusion()` | BM25 keyword + vector semantic search fusion |

### RAG & Pipelines

| Feature | Functions | Description |
| ------- | --------- | ----------- |
| **Chunking** | `chunk()`, `semanticChunk()`, `codeChunk()`, `markdownChunk()` | Recursive, semantic, code-aware, and markdown chunking |
| **Ingestion** | `ingest()`, `createIngestPipeline()` | End-to-end document ingestion with progress tracking |
| **Pipelines** | `createPipeline()` | Composable multi-step workflows with 10 built-in step types |
| **Inference Queue** | `createInferenceQueue()` | Priority-based task scheduling with concurrency control |
| **Semantic Cache** | `createSemanticCache()` | Cache LLM responses using embedding similarity |
| **Import/Export** | `importFrom()`, `exportToCSV()`, `exportToJSONL()` | Migrate vectors from Pinecone, ChromaDB, CSV, JSONL |

### Agents & Evaluation

| Feature | Functions | Description |
| ------- | --------- | ----------- |
| **Agent Framework** | `createAgent()`, `runAgent()` | ReAct loop with tool registry and VectorDB-backed memory |
| **Evaluation SDK** | `evaluateModel()`, `accuracy()`, `bleuScore()`, `ndcg()` | Classification, generation, and retrieval metrics with confusion matrix |
| **Threshold Calibration** | `calibrateThreshold()`, `getDefaultThreshold()` | Empirical similarity thresholds from corpus data |
| **Model Registry** | `recommendModels()`, `registerModel()` | Curated model catalog with device-aware recommendations |
| **Adaptive Batching** | `computeOptimalBatchSize()` | Device-aware batch sizing for optimal throughput |

### Security & Privacy

| Feature | Functions | Description |
| ------- | --------- | ----------- |
| **Encryption** | `encrypt()`, `decrypt()`, `deriveKey()` | Web Crypto API encryption, PBKDF2 key derivation |
| **PII Redaction** | `redactPII()`, `piiRedactionMiddleware()` | Named entity based PII detection and redaction |
| **Differential Privacy** | `dpEmbeddingMiddleware()`, `createPrivacyBudget()` | DP noise injection for embeddings and classification |
| **Drift Detection** | `checkModelCompatibility()`, `reindexCollection()` | Detect model changes, auto-reindex collections |

### Infrastructure

| Feature | Functions | Description |
| ------- | --------- | ----------- |
| **Model Cache** | `createModelLoader()` | Chunked downloads, LRU eviction, cross-tab coordination, offline resume |
| **Storage** | `IndexedDBStorage`, `MemoryStorage` | Built-in persistent and in-memory storage |
| **Middleware** | `wrapEmbeddingModel()`, `wrapLanguageModel()`, `wrapVectorDB()` | Caching, logging, retry, validation, encryption, DP |
| **Capabilities** | `isWebGPUSupported()`, `detectCapabilities()` | Browser feature detection with automatic fallbacks |
| **Cross-Tab Sync** | `createBroadcaster()`, `createLockManager()` | BroadcastChannel sync with Web Locks coordination |
| **Network Status** | `getNetworkStatus()`, `waitForOnline()` | Offline-first with network awareness |

---

## Demo Applications

See LocalMode in action at [localmode.ai](https://localmode.ai) -- 32 apps showcasing every feature.

| Category | Apps |
| -------- | ---- |
| **Chat & Agents** | [LLM Chat](https://localmode.ai/llm-chat), [Research Agent](https://localmode.ai/research-agent), [GGUF Explorer](https://localmode.ai/gguf-explorer) |
| **Audio** | [Voice Notes](https://localmode.ai/voice-notes), [Meeting Assistant](https://localmode.ai/meeting-assistant), [Audiobook Creator](https://localmode.ai/audiobook-creator) |
| **Text & NLP** | [Smart Writer](https://localmode.ai/smart-writer), [Data Extractor](https://localmode.ai/data-extractor), [Sentiment Analyzer](https://localmode.ai/sentiment-analyzer), [Email Classifier](https://localmode.ai/email-classifier), [Translator](https://localmode.ai/translator), [Text Summarizer](https://localmode.ai/text-summarizer), [Q&A Bot](https://localmode.ai/qa-bot), [Smart Autocomplete](https://localmode.ai/smart-autocomplete), [Invoice Q&A](https://localmode.ai/invoice-qa) |
| **Vision** | [Background Remover](https://localmode.ai/background-remover), [Smart Gallery](https://localmode.ai/smart-gallery), [Product Search](https://localmode.ai/product-search), [Cross-Modal Search](https://localmode.ai/cross-modal-search), [Image Captioner](https://localmode.ai/image-captioner), [OCR Scanner](https://localmode.ai/ocr-scanner), [Object Detector](https://localmode.ai/object-detector), [Duplicate Finder](https://localmode.ai/duplicate-finder), [Photo Enhancer](https://localmode.ai/photo-enhancer) |
| **RAG & Search** | [PDF Search](https://localmode.ai/pdf-search), [Semantic Search](https://localmode.ai/semantic-search), [LangChain RAG](https://localmode.ai/langchain-rag), [Data Migrator](https://localmode.ai/data-migrator) |
| **Privacy** | [Document Redactor](https://localmode.ai/document-redactor), [Encrypted Vault](https://localmode.ai/encrypted-vault) |
| **Developer Tools** | [Model Advisor](https://localmode.ai/model-advisor), [Model Evaluator](https://localmode.ai/model-evaluator) |

[View source code](./apps/showcase-nextjs/README.md)

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                            Your Application                              │
├──────────────────────────────────────────────────────────────────────────┤
│                    @localmode/react  (46 React hooks)                    │
├────────────────────────┬────────────────────────┬────────────────────────┤
│  @localmode/langchain  │  @localmode/ai-sdk     │  @localmode/devtools   │
├────────────────────────┴────────────────────────┴────────────────────────┤
│                            @localmode/core                               │
│                                                                          │
│  VectorDB (HNSW + WebGPU)          Embeddings + Multimodal               │
│  Agents & Pipelines                Evaluation + Metrics                  │
│  Generation + Structured Output    Security (DP, PII, Crypto)            │
│  Middleware System                 Import / Export                       │
├──────────────────────────────────────────────────────────────────────────┤
│                          Provider Packages                               │
│                                                                          │
│  @localmode/transformers         HuggingFace Transformers.js,            │
│                                  25 model factories (ONNX)               │
│  @localmode/webllm               WebGPU LLM inference, 30 models         │
│  @localmode/wllama               GGUF via llama.cpp WASM, 135K+          │
│  @localmode/chrome-ai            Gemini Nano, zero-download              │
├──────────────────────────────────────────────────────────────────────────┤
│                            Browser APIs                                  │
│                                                                          │
│      WebGPU / WASM   ·  IndexedDB   ·  Web Workers   ·  Web Crypto       │
└──────────────────────────────────────────────────────────────────────────┘
```

### Design Principles

1. **Zero-Dependency Core** -- `@localmode/core` has no external dependencies
2. **Provider Pattern** -- ML frameworks are separate packages implementing core interfaces
3. **Function-First API** -- Top-level async functions, not class methods
4. **Options Object Pattern** -- Single options object for all functions
5. **Structured Results** -- All functions return `{ result, usage, response }`
6. **AbortSignal Everywhere** -- Every async operation supports cancellation
7. **Middleware Composability** -- Wrap embedding models, language models, and VectorDBs

---

## LLM Provider Comparison

| | WebLLM | Wllama | Transformers.js |
|-|--------|--------|-----------------|
| **Runtime** | WebGPU | WASM (llama.cpp) | ONNX Runtime |
| **Models** | 30 curated (MLC) | 135K+ GGUF from HuggingFace | 14 ONNX (TJS v4) |
| **Speed** | Fastest (GPU) | Good (CPU) | Good (CPU/GPU) |
| **Vision** | Phi 3.5 Vision | -- | Qwen3.5 Vision |
| **Browser Support** | Chrome/Edge 113+ | All modern browsers | All modern browsers |
| **Best For** | Maximum performance | Universal compatibility, model variety | Multi-task (embeddings + LLM in one package) |

---

## Browser Compatibility

| Browser     | WebGPU | WASM | IndexedDB | Workers | Chrome AI |
| ----------- | ------ | ---- | --------- | ------- | --------- |
| Chrome 138+ | Yes    | Yes  | Yes       | Yes     | Yes       |
| Edge 138+   | Yes    | Yes  | Yes       | Yes     | Yes       |
| Firefox 75+ | Nightly | Yes | Yes       | Yes     | No        |
| Safari 18+  | Yes    | Yes  | Yes       | Partial | No        |

- **Chrome AI**: Zero-download inference via Gemini Nano (fallback to Transformers.js)
- **WebGPU**: 3-5x faster inference (fallback to WASM)
- **IndexedDB**: Persistent model/data storage (fallback to Memory)
- **Workers**: Background processing for non-blocking UI

---

## Documentation

Full documentation available at [localmode.dev](https://localmode.dev)

| Topic | Docs | README |
| ----- | ---- | ------ |
| Getting Started | [localmode.dev/docs/getting-started](https://localmode.dev/docs/getting-started) | |
| Core Package | [localmode.dev/docs/core](https://localmode.dev/docs/core) | [`packages/core/README.md`](./packages/core/README.md) |
| React Hooks | [localmode.dev/docs/react](https://localmode.dev/docs/react) | [`packages/react/README.md`](./packages/react/README.md) |
| AI SDK Provider | [localmode.dev/docs/ai-sdk](https://localmode.dev/docs/ai-sdk) | [`packages/ai-sdk/README.md`](./packages/ai-sdk/README.md) |
| Transformers Provider | [localmode.dev/docs/transformers](https://localmode.dev/docs/transformers) | [`packages/transformers/README.md`](./packages/transformers/README.md) |
| WebLLM Provider | [localmode.dev/docs/webllm](https://localmode.dev/docs/webllm) | [`packages/webllm/README.md`](./packages/webllm/README.md) |
| Wllama Provider | [localmode.dev/docs/wllama](https://localmode.dev/docs/wllama) | [`packages/wllama/README.md`](./packages/wllama/README.md) |
| Chrome AI Provider | [localmode.dev/docs/chrome-ai](https://localmode.dev/docs/chrome-ai) | [`packages/chrome-ai/README.md`](./packages/chrome-ai/README.md) |
| LangChain Adapters | [localmode.dev/docs/langchain](https://localmode.dev/docs/langchain) | [`packages/langchain/README.md`](./packages/langchain/README.md) |
| DevTools Widget | [localmode.dev/docs/devtools](https://localmode.dev/docs/devtools) | [`packages/devtools/README.md`](./packages/devtools/README.md) |
| PDF Extraction | [localmode.dev/docs/pdfjs](https://localmode.dev/docs/pdfjs) | [`packages/pdfjs/README.md`](./packages/pdfjs/README.md) |
| Dexie Storage | [localmode.dev/docs/dexie](https://localmode.dev/docs/dexie) | [`packages/dexie/README.md`](./packages/dexie/README.md) |
| IDB Storage | [localmode.dev/docs/idb](https://localmode.dev/docs/idb) | [`packages/idb/README.md`](./packages/idb/README.md) |
| LocalForage Storage | [localmode.dev/docs/localforage](https://localmode.dev/docs/localforage) | [`packages/localforage/README.md`](./packages/localforage/README.md) |
| Next.js Showcase | | [`apps/showcase-nextjs/README.md`](./apps/showcase-nextjs/README.md) |

---

## Monorepo Structure

```
packages/
  core/            # Zero-dependency core (functions, interfaces, VectorDB, agents, evaluation)
  react/           # React hooks for all core functions (46 hooks + pipeline step factories)
  ai-sdk/          # Vercel AI SDK provider
  transformers/    # HuggingFace Transformers.js provider (25 model factories)
  webllm/          # WebLLM provider (30 curated WebGPU models)
  wllama/          # Wllama provider (GGUF via llama.cpp WASM, 135K+ models)
  chrome-ai/       # Chrome Built-in AI provider (Gemini Nano)
  langchain/       # LangChain.js adapters (embeddings, chat, vector store, reranker)
  devtools/        # In-app DevTools widget for observability
  pdfjs/           # PDF text extraction
  dexie/           # Dexie.js storage adapter
  idb/             # idb storage adapter
  localforage/     # localForage storage adapter
apps/
  showcase-nextjs/ # Next.js 16 showcase with 32 self-contained demo apps (localmode.ai)
  docs/            # Documentation site (localmode.dev)
```

---

## Privacy Guarantees

- **No telemetry** -- We don't track anything
- **No network requests** -- Core package makes zero network calls
- **Data stays local** -- All processing happens in your browser
- **Differential privacy** -- Optional DP noise injection for embeddings and classification
- **Encryption** -- Built-in AES-GCM encryption via Web Crypto API
- **PII redaction** -- Automatic detection and redaction of sensitive data
- **Open source** -- Audit the code yourself

---

## Acknowledgments

LocalMode is built on top of incredible open-source projects:

| Library | Used by | Description |
|---------|---------|-------------|
| [Transformers.js](https://github.com/huggingface/transformers.js) by HuggingFace | `@localmode/transformers` | State-of-the-art ML models in the browser via ONNX Runtime |
| [WebLLM](https://github.com/mlc-ai/web-llm) by MLC AI | `@localmode/webllm` | High-performance LLM inference with WebGPU |
| [wllama](https://github.com/ngxson/wllama) by ngxson / [llama.cpp](https://github.com/ggml-org/llama.cpp) by Georgi Gerganov | `@localmode/wllama` | GGUF model inference via llama.cpp compiled to WASM |
| [LangChain.js](https://github.com/langchain-ai/langchainjs) by LangChain | `@localmode/langchain` | Framework for building LLM-powered applications |
| [Vercel AI SDK](https://github.com/vercel/ai) by Vercel | `@localmode/ai-sdk` | Universal AI SDK for TypeScript |
| [PDF.js](https://github.com/mozilla/pdf.js) by Mozilla | `@localmode/pdfjs` | PDF rendering and text extraction |
| [Dexie.js](https://github.com/dexie/Dexie.js) by David Fahlander | `@localmode/dexie` | IndexedDB wrapper with schema versioning and transactions |
| [idb](https://github.com/jakearchibald/idb) by Jake Archibald | `@localmode/idb` | Tiny Promise-based IndexedDB wrapper |
| [localForage](https://github.com/localForage/localForage) by Mozilla | `@localmode/localforage` | Cross-browser storage with automatic fallback |
| [Chrome Built-in AI](https://developer.chrome.com/docs/ai/built-in) by Google | `@localmode/chrome-ai` | On-device AI APIs powered by Gemini Nano |

## Reporting Issues

Found a bug or unexpected behavior? [Open an issue](https://github.com/LocalMode-AI/LocalMode/issues) and include:

- A clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Browser name and version
- Relevant error messages or console output
- A minimal code snippet or reproduction if possible

## Contributing

Contributions are welcome! Fork the repo, create a branch, and open a pull request. Please follow the existing code style and patterns.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for a list of notable changes.

## License

[MIT](./LICENSE)

<p align="center">
  <b>Built for Privacy. Designed for Developers. Powered by the Browser.</b>
</p>
