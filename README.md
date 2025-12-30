# LocalMode

**Local-first, privacy-first, offline-first AI for the browser.**

Run ML models entirely in your browser. No servers. No API keys. Your data never leaves your device.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Docs](https://img.shields.io/badge/Docs-LocalMode.dev-red)](https://localmode.dev)
[![Demo](https://img.shields.io/badge/Demo-LocalMode.ai-purple)](https://localmode.ai)

## 🎯 What is LocalMode?

LocalMode is a monorepo of packages for building AI-powered applications that run 100% in the browser. Everything from embeddings and vector search to LLM chat and image processing works offline after the initial model download.

### Why LocalMode?

- **🔒 Privacy** — Your data never leaves your device
- **📴 Offline** — Works without internet after model download
- **⚡ Fast** — No network latency, instant inference
- **💰 Free** — No API costs, unlimited usage
- **🌐 Universal** — Works in any modern browser

---

## 📦 Packages

| Package                                                        | Description                                                                  | Status            |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------- |
| [`@localmode/core`](./packages/core/README.md)                 | Zero-dependency core with VectorDB, embeddings, chunking, and all interfaces | ✅ Stable         |
| [`@localmode/transformers`](./packages/transformers/README.md) | HuggingFace Transformers.js provider for ML models                           | ✅ Stable         |
| [`@localmode/webllm`](./packages/webllm/README.md)             | WebLLM provider for local LLM inference                                      | ✅ Stable         |
| [`@localmode/pdfjs`](./packages/pdfjs/README.md)               | PDF text extraction with PDF.js                                              | ✅ Stable         |
| [`@localmode/dexie`](./packages/dexie/README.md)               | Dexie.js storage adapter                                                     | 🚧 In Development |
| [`@localmode/idb`](./packages/idb/README.md)                   | idb storage adapter                                                          | 🚧 In Development |
| [`@localmode/localforage`](./packages/localforage/README.md)   | localForage storage adapter                                                  | 🚧 In Development |

---

## 🚀 Quick Start

### Semantic Search with Embeddings

```bash
# Preferred: pnpm
pnpm install @localmode/core @localmode/transformers

# Alternative: npm
npm install @localmode/core @localmode/transformers
```

```typescript
import { createVectorDB, embed, embedMany, chunk } from '@localmode/core';
import { transformers } from '@localmode/transformers';

// Create embedding model
const model = transformers.embedding('Xenova/all-MiniLM-L6-v2');

// Create vector database
const db = await createVectorDB({ name: 'docs', dimensions: 384 });

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

```bash
# Preferred: pnpm
pnpm install @localmode/core @localmode/webllm

# Alternative: npm
npm install @localmode/core @localmode/webllm
```

```typescript
import { streamText } from '@localmode/core';
import { webllm } from '@localmode/webllm';

const model = webllm.languageModel('Llama-3.2-1B-Instruct-q4f16_1-MLC');

const result = await streamText({
  model,
  prompt: 'Explain quantum computing simply',
  maxTokens: 500,
});

for await (const chunk of result.stream) {
  process.stdout.write(chunk.text);
}
```

---

## 🛠️ Features

### ✅ Live Features

Production-ready features used in real applications.

| Feature             | Functions                                     | Description                                       |
| ------------------- | --------------------------------------------- | ------------------------------------------------- |
| **Vector Database** | `createVectorDB()`                            | HNSW index, IndexedDB persistence, cross-tab sync |
| **Embeddings**      | `embed()`, `embedMany()`                      | Text embeddings with any model                    |
| **Reranking**       | `rerank()`                                    | Document reranking for improved RAG               |
| **RAG Chunking**    | `chunk()`                                     | Recursive, markdown, code-aware chunking          |
| **Streaming LLM**   | `streamText()`                                | Streaming text generation                         |
| **Storage**         | `IndexedDBStorage`, `MemoryStorage`           | Persistent and in-memory storage                  |
| **Capabilities**    | `isWebGPUSupported()`, `detectCapabilities()` | Browser feature detection                         |

### 🚧 Coming Soon

Features with interfaces defined, under active development.

| Feature                | Functions                                             | Description                    |
| ---------------------- | ----------------------------------------------------- | ------------------------------ |
| **Classification**     | `classify()`, `classifyZeroShot()`                    | Text classification            |
| **NER**                | `extractEntities()`                                   | Named entity recognition       |
| **Audio**              | `transcribe()`, `synthesizeSpeech()`                  | Speech-to-text, text-to-speech |
| **Vision**             | `classifyImage()`, `captionImage()`, `segmentImage()` | Image processing               |
| **Translation**        | `translate()`                                         | Multi-language translation     |
| **Summarization**      | `summarize()`                                         | Text summarization             |
| **Question Answering** | `answerQuestion()`                                    | Extractive QA                  |
| **OCR**                | `extractText()`                                       | Optical character recognition  |
| **Document QA**        | `askDocument()`, `askTable()`                         | Visual document understanding  |

---

## 📱 Demo Applications

See LocalMode in action at [LocalMode.ai](https://localmode.ai) or check the [Next.js Showcase source](./apps/showcase-nextjs/README.md).

### Live Apps

| App                                               | Description           | Features                                    |
| ------------------------------------------------- | --------------------- | ------------------------------------------- |
| **[LLM Chat](https://localmode.ai/llm-chat)**     | Privacy-first AI chat | Streaming, multiple models, offline, WebGPU |
| **[PDF Search](https://localmode.ai/pdf-search)** | Semantic PDF search   | PDF upload, RAG pipeline, source citations  |

### Coming Soon (20+ apps)

- **Voice Notes** — Record, transcribe, search semantically
- **Sentiment Analyzer** — Customer feedback analysis
- **Background Remover** — Image segmentation
- **Smart Gallery** — Auto-categorization and visual search
- **Translator** — 20+ languages, works offline
- [See full list →](./apps/showcase-nextjs/README.md#-coming-soon)

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Your Application                         │
├─────────────────────────────────────────────────────────────┤
│                    @localmode/core                           │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │
│  │  VectorDB   │ │  Embeddings │ │     RAG     │            │
│  │  (HNSW)     │ │  Functions  │ │  Utilities  │            │
│  └─────────────┘ └─────────────┘ └─────────────┘            │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │
│  │   Storage   │ │  Security   │ │ Middleware  │            │
│  │  Adapters   │ │ (Crypto)    │ │   System    │            │
│  └─────────────┘ └─────────────┘ └─────────────┘            │
├─────────────────────────────────────────────────────────────┤
│                     Provider Packages                        │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────┐ │
│  │ @localmode/      │ │ @localmode/      │ │ @localmode/  │ │
│  │ transformers     │ │ webllm           │ │ pdfjs        │ │
│  │ (Transformers.js)│ │ (WebLLM)         │ │ (PDF.js)     │ │
│  └──────────────────┘ └──────────────────┘ └──────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                     Browser APIs                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │
│  │   WebGPU    │ │  IndexedDB  │ │ Web Workers │            │
│  │   (WASM)    │ │             │ │             │            │
│  └─────────────┘ └─────────────┘ └─────────────┘            │
└─────────────────────────────────────────────────────────────┘
```

### Design Principles

1. **Zero-Dependency Core** — `@localmode/core` has no external dependencies
2. **Provider Pattern** — ML frameworks are separate packages that implement core interfaces
3. **Function-First API** — Top-level async functions, not class methods
4. **Options Object Pattern** — Single options object for all functions
5. **Structured Results** — All functions return `{ result, usage, response }`

---

## 🌐 Browser Compatibility

| Browser     | WebGPU | WASM | IndexedDB | Workers |
| ----------- | ------ | ---- | --------- | ------- |
| Chrome 113+ | ✅     | ✅   | ✅        | ✅      |
| Edge 113+   | ✅     | ✅   | ✅        | ✅      |
| Firefox 75+ | 🧪     | ✅   | ✅        | ✅      |
| Safari 18+  | ✅     | ✅   | ✅        | ⚠️      |

- **WebGPU**: 3-5x faster inference (fallback to WASM)
- **IndexedDB**: Persistent model/data storage (fallback to Memory)
- **Workers**: Background processing for non-blocking UI

---

## 📖 Documentation

Full documentation available at [LocalMode.dev](https://localmode.dev)

| Topic                 | Link                                                                   |
| --------------------- | ---------------------------------------------------------------------- |
| Core Package          | [`packages/core/README.md`](./packages/core/README.md)                 |
| Transformers Provider | [`packages/transformers/README.md`](./packages/transformers/README.md) |
| WebLLM Provider       | [`packages/webllm/README.md`](./packages/webllm/README.md)             |
| PDF Extraction        | [`packages/pdfjs/README.md`](./packages/pdfjs/README.md)               |
| Next.js Showcase      | [`apps/showcase-nextjs/README.md`](./apps/showcase-nextjs/README.md)   |

---

## 🔒 Privacy Guarantees

- **No telemetry** — We don't track anything
- **No network requests** — Core package makes zero network calls
- **Data stays local** — All processing happens in your browser
- **Open source** — Audit the code yourself

## 📄 License

[MIT](./LICENSE)

<p align="center">
  <b>Built for Privacy. Designed for Developers. Powered by the Browser.</b>
</p>
