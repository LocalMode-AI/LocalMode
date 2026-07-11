# LocalMode

**Local-first, privacy-first, offline-first AI for the browser.**

Run ML models entirely in your browser. No servers. No API keys. Your data never leaves your device.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Docs](https://img.shields.io/badge/Docs-LocalMode.dev-red)](https://localmode.dev)
[![UI Components](https://img.shields.io/badge/UI_Components-LocalMode.ai-green)](https://localmode.ai)
[![Blocks & Apps](https://img.shields.io/badge/Blocks_&_Apps-LocalMode.ai-purple)](https://localmode.ai/blocks)

- Docs website: https://localmode.dev
- UI Components: https://localmode.ai
- Blocks & Apps: https://localmode.ai/blocks

## What is LocalMode?

LocalMode is a monorepo of packages for building AI-powered applications that run 100% in the browser. Everything from embeddings and vector search to LLM chat, vision, audio, agents, and structured output works offline after the initial model download.

**15 packages. 36 demo blocks. Zero cloud dependencies.**

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
| [`@localmode/core`](./packages/core/README.md) | [![npm](https://img.shields.io/npm/v/@localmode/core.svg)](https://www.npmjs.com/package/@localmode/core) | Zero-dependency core -- VectorDB (HNSW, typed metadata, WebGPU search, SQ8/PQ quantization), pipelines, inference queue, model cache, agent framework (ReAct + tools with opt-in human-in-the-loop tool approval + memory), evaluation SDK, vector import/export, multimodal content, knowledge base engine (`createKnowledgeBaseEngine` + frozen `KnowledgeBaseEngine` contract), all interfaces |
| [`@localmode/react`](./packages/react/README.md) | [![npm](https://img.shields.io/npm/v/@localmode/react.svg)](https://www.npmjs.com/package/@localmode/react) | 64 React hooks, 10 pipeline step factories, batch/list processing, and browser helpers -- incl. `useEncryptedVault` passphrase-locked encrypted storage, `useAgent` tool-approval surface (`pendingApproval`/`approve`/`deny`), `useRerank` document reranking, `useModelLoad` unified model-download lifecycle, `useChat` usage tracking + `regenerate()` reply variants, `useProviderFallback` per-capability Chrome AI ⇄ Transformers.js resolution, `usePhotoLibrary` shared CLIP photo library, and `useKnowledgeBase` knowledge-base session orchestration |
| [`@localmode/ai-sdk`](./packages/ai-sdk/README.md) | [![npm](https://img.shields.io/npm/v/@localmode/ai-sdk.svg)](https://www.npmjs.com/package/@localmode/ai-sdk) | Vercel AI SDK provider for local models |
| [`@localmode/transformers`](./packages/transformers/README.md) | [![npm](https://img.shields.io/npm/v/@localmode/transformers.svg)](https://www.npmjs.com/package/@localmode/transformers) | HuggingFace Transformers.js provider -- 26 model factories covering embeddings, classification, vision, audio, OCR, multimodal (CLIP), and LLM inference via ONNX (Qwen3.5 vision support) |
| [`@localmode/webllm`](./packages/webllm/README.md) | [![npm](https://img.shields.io/npm/v/@localmode/webllm.svg)](https://www.npmjs.com/package/@localmode/webllm) | WebLLM provider for LLM inference via WebGPU -- 32 curated models including DeepSeek-R1, Qwen3, Llama 3.2, Phi 3.5 Vision |
| [`@localmode/wllama`](./packages/wllama/README.md) | [![npm](https://img.shields.io/npm/v/@localmode/wllama.svg)](https://www.npmjs.com/package/@localmode/wllama) | GGUF model provider via llama.cpp WASM -- 30 curated models (text, vision, embeddings, reranking), true streaming, structured output (JSON mode), reasoning mode, WebGPU acceleration, tool calling, grammar sampling (GBNF), LoRA adapters, model management, GGUF model discovery (`searchGGUFModels`/`listGGUFFiles`), 160K+ HuggingFace models, universal browser support |
| [`@localmode/litert`](./packages/litert/README.md) | [![npm](https://img.shields.io/npm/v/@localmode/litert.svg)](https://www.npmjs.com/package/@localmode/litert) | Google LiteRT-LM provider (`.litertlm` models, WebGPU + CPU WASM fallback). Text-only, early preview. Catalog ships Gemma 4 E2B/E4B and Qwen3 0.6B, all verified end-to-end. Gated Gemma 3n / Gemma 3 1B loadable via custom URL. |
| [`@localmode/mediapipe`](./packages/mediapipe/README.md) | [![npm](https://img.shields.io/npm/v/@localmode/mediapipe.svg)](https://www.npmjs.com/package/@localmode/mediapipe) | Google MediaPipe Tasks provider -- real-time hand/pose/face landmark tracking, gesture recognition, image & audio classification, language detection. WASM + WebGL, all browsers. |
| [`@localmode/chrome-ai`](./packages/chrome-ai/README.md) | [![npm](https://img.shields.io/npm/v/@localmode/chrome-ai.svg)](https://www.npmjs.com/package/@localmode/chrome-ai) | Chrome Built-in AI provider -- your app ships no model files; Chrome supplies Gemini Nano. Automatic fallback |
| [`@localmode/langchain`](./packages/langchain/README.md) | [![npm](https://img.shields.io/npm/v/@localmode/langchain.svg)](https://www.npmjs.com/package/@localmode/langchain) | LangChain.js adapters -- drop-in local embeddings, chat, vector store, and reranker for existing LangChain apps, plus `createLangChainKnowledgeBaseEngine` (the `KnowledgeBaseEngine` contract over LangChain adapters) |
| [`@localmode/devtools`](./packages/devtools/README.md) | [![npm](https://img.shields.io/npm/v/@localmode/devtools.svg)](https://www.npmjs.com/package/@localmode/devtools) | In-app AI observability -- 9 React hooks via the `@localmode/devtools/react` subpath for model cache, VectorDB stats, and inference queue data (the bundled DevTools widget UI was **removed in v3.0.0** in favor of the hooks + the `ui/devtools` registry family and `ui/blocks/devtools-drawer` at localmode.ai) |
| [`@localmode/pdfjs`](./packages/pdfjs/README.md) | [![npm](https://img.shields.io/npm/v/@localmode/pdfjs.svg)](https://www.npmjs.com/package/@localmode/pdfjs) | PDF text extraction with PDF.js |
| [`@localmode/dexie`](./packages/dexie/README.md) | [![npm](https://img.shields.io/npm/v/@localmode/dexie.svg)](https://www.npmjs.com/package/@localmode/dexie) | Dexie.js storage adapter with schema versioning and transactions |
| [`@localmode/idb`](./packages/idb/README.md) | [![npm](https://img.shields.io/npm/v/@localmode/idb.svg)](https://www.npmjs.com/package/@localmode/idb) | Minimal IndexedDB storage adapter using the idb library |
| [`@localmode/localforage`](./packages/localforage/README.md) | [![npm](https://img.shields.io/npm/v/@localmode/localforage.svg)](https://www.npmjs.com/package/@localmode/localforage) | Cross-browser storage adapter with automatic fallback |

---

### `@localmode/ui` — UI registry (not an npm package)

[**LocalMode UI**](https://localmode.ai) is a shadcn-style registry of copy-owned AI UI components: **107 primitives across 10 families**, plus **37 blocks** that wire them to real on-device models. Like shadcn/ui, you install with the shadcn CLI and own the copied code, styled with shadcn/ui CSS variables so it inherits your theme. See the [docs](https://localmode.ai/docs), [installation guide](https://localmode.ai/docs/installation), and [`apps/ui/README.md`](./apps/ui/README.md).

The primitives are presentational and install with **zero `@localmode/*` packages**, so they work with any React AI app — the LocalMode hooks (on-device), the [Vercel AI SDK](https://localmode.ai/docs/use-with-ai-sdk), or [your own data](https://localmode.ai/docs/bring-your-own-data). Local-first by design, cloud-compatible by contract.

```bash
# components.json → { "registries": { "@localmode": "https://localmode.ai/r/{name}.json" } }

npx shadcn@latest add @localmode/ui/conversation/message   # a single component
npx shadcn@latest add @localmode/ui/conversation           # a whole family
npx shadcn@latest add @localmode/ui/all                    # the whole catalog
```

| Family | Count | What it covers |
| ------ | ----- | -------------- |
| [Conversation](https://localmode.ai/docs/conversation/conversation) | 24 | Chat shell, prompt input, reasoning, sources, tools, agent timelines, branches, citations |
| [Local-First](https://localmode.ai/docs/local-first/model-downloader) | 24 | Model download/selection, Hub search, capability gates, storage quota, cache status, VectorDB observability |
| [Results & Insights](https://localmode.ai/docs/results/confidence-score-badge) | 12 | Confidence badges, scored result bars, similarity meters, evaluation dashboards, entity displays |
| [Input Controls](https://localmode.ai/docs/input-controls/char-limit-indicator) | 11 | Char-limit rings, fill-mask inputs, mode pickers, parameter sliders, slash-command palettes |
| [Audio](https://localmode.ai/docs/audio/waveform-activity-bars) | 10 | Voice buttons/orbs, waveform bars, TTS voice pickers, streaming-speech panels, transcript viewers |
| [Media & Vision](https://localmode.ai/docs/media-vision/media-dropzone) | 7 | Image dropzones, bounding-box overlays, before/after viewers, webcam canvas, result galleries |
| [Data & Documents](https://localmode.ai/docs/data-documents/file-dropzone) | 5 | File dropzones, indexed-document cards, format badges, category facets, chunk visualizers |
| [Security & Privacy](https://localmode.ai/docs/security-privacy/password-strength-bar) | 5 | Password-strength bar, differential-privacy controls, passphrase gate, vault item card, lock badge |
| [Artifacts & Canvas](https://localmode.ai/docs/artifacts/artifact) | 4 | Docked canvas, sortable data tables, charts, code diffs — output rendered *beside* the chat |
| [DevTools](https://localmode.ai/docs/devtools) | 4 | Inference-queue monitor, event-log viewer, pipeline-run inspector, model-cache table |

**Blocks** are complete experiences composed from the primitives — the wiring layer, and the only items that depend on `@localmode/*`. Each runs real models on-device and gates its download behind an explicit in-block action. Try them in the [`/blocks` gallery](https://localmode.ai/blocks), then install with `npx shadcn@latest add @localmode/ui/blocks/<category>/<block>`.

| Category | Blocks |
| -------- | ------ |
| [chat](https://localmode.ai/blocks/chat) | The flagship — streaming chat across 76 models and 4 providers, with vision, reasoning, agent mode, semantic caching, and custom GGUF URLs |
| [knowledge](https://localmode.ai/blocks/knowledge) | `semantic-search` · `document-qa` · `rag-chat` · `vector-data-manager` — ingest text/PDF/OCR, rerank, ground answers with citations, import/export vectors |
| [audio](https://localmode.ai/blocks/audio) | `voice-notes` · `live-transcription` · `meeting-assistant` · `voice-explorer` · `audiobook-reader` · `audio-classifier` |
| [vision](https://localmode.ai/blocks/vision) | `object-detector` · `live-tracker` — DETR and BlazeFace detection, plus real-time hand / pose / face-mesh / gesture tracking |
| [text](https://localmode.ai/blocks/text) | `language-detector` — 110-language detection and text-embedder similarity |
| [device](https://localmode.ai/blocks/device) | `device-report` · `model-advisor` · `gguf-explorer` — capability report, ranked recommendations, and a 160K-model GGUF browser (zero download) |
| [agents](https://localmode.ai/blocks/agents) | `research-agent` · `data-extractor` — a ReAct loop with human-in-the-loop tool approval, and schema-validated extraction rendered as artifacts |
| [writing-tools](https://localmode.ai/blocks/writing-tools) | `write` · `translate` · `summarize` · `complete` — the Chrome Built-in AI ⇄ Transformers.js provider-fallback reference |
| [text-insights](https://localmode.ai/blocks/text-insights) | `sentiment-analyzer` · `text-classifier` · `model-evaluator` · `threshold-calibrator` |
| [photo](https://localmode.ai/blocks/photo) | `smart-gallery` · `image-search` · `duplicate-finder` · `photo-categorizer` — one CLIP model for both embeddings and zero-shot categorization |
| [image-studio](https://localmode.ai/blocks/image-studio) | `background-remover` · `image-enhancer` · `image-captioner` |
| [privacy](https://localmode.ai/blocks/privacy) | `pii-redactor` · `encrypted-vault` — on-device NER redaction with a differential-privacy demo, and a passphrase-locked AES-GCM vault |

The 37th item, `ui/blocks/devtools-drawer`, is layout chrome rather than a gallery page: a six-tab observability drawer over `@localmode/devtools`, off by default and loaded only on first open. The 34 demo-app URLs from the previous `localmode.ai` site permanently redirect to the block that absorbed each one.

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

Four providers implement the same `LanguageModel` interface -- choose based on your needs:

```bash
# WebGPU (fastest, 32 curated models)
pnpm install @localmode/core @localmode/webllm

# WASM (universal browser support, 160K+ GGUF models)
pnpm install @localmode/core @localmode/wllama

# ONNX (Transformers.js v4, same package as embeddings/vision/audio)
pnpm install @localmode/core @localmode/transformers

# Google LiteRT-LM (.litertlm models, WebGPU — Gemma 4 E2B/E4B, Qwen3 0.6B)
pnpm install @localmode/core @localmode/litert
```

```typescript
import { streamText } from '@localmode/core';
import { webllm } from '@localmode/webllm';
import { wllama } from '@localmode/wllama';
import { transformers } from '@localmode/transformers';
import { litert } from '@localmode/litert';

// Pick any provider -- all implement the same LanguageModel interface
const model = webllm.languageModel('Llama-3.2-1B-Instruct-q4f16_1-MLC');       // WebGPU
// const model = wllama.languageModel('Llama-3.2-1B-Instruct-Q4_K_M');          // WASM (GGUF)
// const model = transformers.languageModel('onnx-community/Qwen3-0.6B-ONNX');  // ONNX
// const model = litert.languageModel('gemma-4-E2B');                            // LiteRT (WebGPU)

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
import { createAgent, defineTool, jsonSchema } from '@localmode/core';
import { webllm } from '@localmode/webllm';
import { z } from 'zod';

// defineTool() infers the parameter/result types so `execute`'s args are typed
const searchTool = defineTool({
  name: 'search',
  description: 'Search the knowledge base',
  parameters: jsonSchema(z.object({ query: z.string() })),
  execute: async ({ query }) => searchDB(query),
});

const agent = createAgent({
  model: webllm.languageModel('Qwen3-1.7B-q4f16_1-MLC'),
  tools: [searchTool],
  maxSteps: 5,
});

const result = await agent.run({ prompt: 'Find documents about machine learning' });
```

### React Hooks

```typescript
import { useChat, useEmbed, useClassify } from '@localmode/react';
import { transformers } from '@localmode/transformers';
import { webllm } from '@localmode/webllm';

function ChatApp() {
  const { messages, send, isStreaming } = useChat({
    model: webllm.languageModel('Qwen3-1.7B-q4f16_1-MLC'),
  });

  return <ChatUI messages={messages} onSend={send} loading={isStreaming} />;
}
```

### Real-Time Hand & Pose Tracking (MediaPipe)

```typescript
import { detectHands } from '@localmode/core';
import { mediapipe } from '@localmode/mediapipe';

// Single-frame: 21-point hand landmarks
const { hands } = await detectHands({
  model: mediapipe.handLandmarker(),
  image: imageBlob,
});

// Real-time: 30-60fps tracking from a webcam video element
const tracker = mediapipe.createHandTracker({
  video: videoElement,
  onResults: (hands) => drawLandmarks(hands),
});
await tracker.start();
```

---

## Features

### Core AI Functions

| Feature | Functions | Description |
| ------- | --------- | ----------- |
| **Embeddings** | `embed()`, `embedMany()`, `streamEmbedMany()` | Text embeddings with streaming and batching |
| **Multimodal Embeddings** | `embedImage()`, `embedManyImages()`, `streamEmbedManyImages()` | CLIP-based text-image cross-modal search |
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
| **Audio** | `transcribe()`, `synthesizeSpeech()`, `streamSynthesizeSpeech()`, `playStreamedSpeech()`, `classifyAudio()` | Speech-to-text, TTS (Kokoro -- 29 English voices, phonemizer-backed), streaming TTS with real-time playback, audio classification |
| **Live Transcription** | `createLiveTranscriber()`, `createTurnTaker()` | Real-time microphone transcription with VAD (Silero) and turn-based conversation |
| **Vision** | `classifyImage()`, `captionImage()`, `detectObjects()`, `segmentImage()`, `imageToImage()`, `estimateDepth()` | Image processing and analysis |
| **Landmarks & Gestures** | `detectHands()`, `detectPose()`, `detectFace()`, `detectFaceLandmarks()`, `recognizeGesture()` | Hand/pose/face landmark tracking and gesture recognition (MediaPipe) |
| **Language Detection** | `detectLanguage()` | Identify the language of text (110 languages) |

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
| **Audit Log** | `createAuditLog()` | Hash-chained, signed, append-only tamper-evident audit log (IndexedDB-backed) |

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

## Demo Applications — the Blocks Gallery

See LocalMode running real models entirely in your browser at the **[/blocks gallery](https://localmode.ai/blocks)** (`localmode.ai/blocks`). The gallery ships **36 route-served blocks across 12 categories** — full experiences assembled from the registry primitives ([`chat`](https://localmode.ai/blocks/chat) plus the [`knowledge`](https://localmode.ai/blocks/knowledge), [`vision`](https://localmode.ai/blocks/vision), [`audio`](https://localmode.ai/blocks/audio), [`text`](https://localmode.ai/blocks/text), [`device`](https://localmode.ai/blocks/device), [`writing-tools`](https://localmode.ai/blocks/writing-tools), [`agents`](https://localmode.ai/blocks/agents), [`text-insights`](https://localmode.ai/blocks/text-insights), [`photo`](https://localmode.ai/blocks/photo), [`image-studio`](https://localmode.ai/blocks/image-studio), and [`privacy`](https://localmode.ai/blocks/privacy) category pages) plus the global-observability `devtools-drawer` chrome — each installable with `npx shadcn@latest add @localmode/ui/blocks/<name>`.

**Full block descriptions, what each one covers, and install commands are in the `@localmode/ui` UI-registry section above** (the authoritative block catalog).

> Legacy `localmode.ai/<slug>` URLs permanently redirect to the corresponding block.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                            Your Application                              │
├──────────────────────────────────────────────────────────────────────────┤
│                    @localmode/react  (64 React hooks)                    │
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
│                                  26 model factories (ONNX)               │
│  @localmode/webllm               WebGPU LLM inference, 32 models         │
│  @localmode/wllama               GGUF via llama.cpp WASM, 30 curated     │
│                                  + 160K+, streaming, JSON mode, rerank  │
│  @localmode/litert               Google LiteRT-LM, .litertlm models      │
│  @localmode/mediapipe            Google MediaPipe — landmarks, gestures  │
│  @localmode/chrome-ai            Gemini Nano, browser-supplied           │
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

| | WebLLM | Wllama | Transformers.js | LiteRT |
|-|--------|--------|-----------------|--------|
| **Runtime** | WebGPU | WASM (llama.cpp) + optional WebGPU | ONNX Runtime | LiteRT-LM (Google) |
| **Models** | 32 curated (MLC) | 30 curated + 160K+ GGUF from HuggingFace | 16 ONNX (TJS v4) | 3 verified (.litertlm) |
| **Speed** | Fastest (GPU) | Good (CPU), faster with WebGPU | Good (CPU/GPU) | Fast (WebGPU/CPU) |
| **Embeddings** | -- | 3 GGUF embedding models | Yes (many models) | -- |
| **Reranking** | -- | 2 reranker models | Yes (cross-encoder) | -- |
| **Structured Output** | Yes | Yes (JSON mode / grammar) | -- | -- |
| **Reasoning** | -- | Yes (thinking mode) | -- | -- |
| **Vision** | Phi 3.5 Vision | Holo2 4B/8B, Gemma 4 E2B/E4B | Qwen3.5, Gemma 4 | -- |
| **Tool Calling** | Yes | Yes (via providerOptions) | -- | -- |
| **Browser Support** | Chrome/Edge 113+ | All modern browsers | All modern browsers | Chrome/Edge 113+ |
| **Best For** | Maximum performance | Universal compatibility, model variety, reranking | Multi-task (embeddings + LLM in one package) | Google on-device models |

---

## Browser Compatibility

| Browser     | WebGPU   | WASM | IndexedDB | Workers | Chrome AI |
| ----------- | -------- | ---- | --------- | ------- | --------- |
| Chrome 80+  | 113+     | Yes  | Yes       | Yes     | Yes       |
| Edge 80+    | 113+     | Yes  | Yes       | Yes     | Yes       |
| Firefox 75+ | 141+     | Yes  | Yes       | Yes     | No        |
| Safari 14+  | 26+      | Yes  | Yes       | Partial | No        |

- **Chrome AI**: Gemini Nano supplied by the browser -- your app ships no model files (fallback to Transformers.js)
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
| LiteRT Provider | [localmode.dev/docs/litert](https://localmode.dev/docs/litert) | [`packages/litert/README.md`](./packages/litert/README.md) |
| MediaPipe Provider | [localmode.dev/docs/mediapipe](https://localmode.dev/docs/mediapipe) | [`packages/mediapipe/README.md`](./packages/mediapipe/README.md) |
| Chrome AI Provider | [localmode.dev/docs/chrome-ai](https://localmode.dev/docs/chrome-ai) | [`packages/chrome-ai/README.md`](./packages/chrome-ai/README.md) |
| LangChain Adapters | [localmode.dev/docs/langchain](https://localmode.dev/docs/langchain) | [`packages/langchain/README.md`](./packages/langchain/README.md) |
| DevTools | [localmode.dev/docs/devtools](https://localmode.dev/docs/devtools) | [`packages/devtools/README.md`](./packages/devtools/README.md) |
| PDF Extraction | [localmode.dev/docs/pdfjs](https://localmode.dev/docs/pdfjs) | [`packages/pdfjs/README.md`](./packages/pdfjs/README.md) |
| Dexie Storage | [localmode.dev/docs/dexie](https://localmode.dev/docs/dexie) | [`packages/dexie/README.md`](./packages/dexie/README.md) |
| IDB Storage | [localmode.dev/docs/idb](https://localmode.dev/docs/idb) | [`packages/idb/README.md`](./packages/idb/README.md) |
| LocalForage Storage | [localmode.dev/docs/localforage](https://localmode.dev/docs/localforage) | [`packages/localforage/README.md`](./packages/localforage/README.md) |
| UI Registry & Blocks (`@localmode/ui`) | [localmode.ai](https://localmode.ai) | [`apps/ui/README.md`](./apps/ui/README.md) |

---

## Monorepo Structure

```
packages/
  core/            # Zero-dependency core (functions, interfaces, VectorDB, agents, evaluation)
  react/           # React hooks for all core functions (64 hooks + pipeline step factories)
  ai-sdk/          # Vercel AI SDK provider
  transformers/    # HuggingFace Transformers.js provider (26 model factories)
  webllm/          # WebLLM provider (32 curated WebGPU models)
  wllama/          # Wllama provider (GGUF via llama.cpp WASM, 30 curated + 160K+ models, streaming, JSON mode, reranking, reasoning, LoRA)
  litert/          # LiteRT-LM provider (Google's WebGPU/WASM, .litertlm models)
  mediapipe/       # MediaPipe Tasks provider (landmarks, gestures, vision/audio/text)
  chrome-ai/       # Chrome Built-in AI provider (Gemini Nano)
  langchain/       # LangChain.js adapters (embeddings, chat, vector store, reranker)
  devtools/        # DevTools observability (/react hooks; widget UI deprecated)
  pdfjs/           # PDF text extraction
  dexie/           # Dexie.js storage adapter
  idb/             # idb storage adapter
  localforage/     # localForage storage adapter
apps/
  ui/              # @localmode/ui registry + blocks platform — the app-demo layer (localmode.ai; 36-block /blocks gallery across 12 categories + copy-owned UI primitives + Fumadocs)
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
| [LiteRT-LM](https://github.com/google-ai-edge/LiteRT-LM) by Google AI Edge | `@localmode/litert` | Google's on-device LLM inference engine for browser (WebGPU/WASM, `.litertlm` models) |
| [MediaPipe](https://github.com/google-ai-edge/mediapipe) by Google AI Edge | `@localmode/mediapipe` | On-device hand/pose/face landmark tracking, gesture recognition, and vision/audio/text tasks via WASM |
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
