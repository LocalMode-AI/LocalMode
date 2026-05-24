# LocalMode Next.js Showcase

A comprehensive Next.js application showcasing **@localmode packages** with ready AI applications that run entirely in the browser.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../../LICENSE)

> **Note:** These showcase apps are intended for testing and code reference purposes. Some bugs are expected. For production use cases, refer to the [LocalMode documentation](https://localmode.dev).

## 🎯 Overview

This showcase serves as:

- **Live Demo Platform** — Test all @localmode features in your browser
- **Reference Implementation** — Copy-paste ready code following best practices
- **Starter Templates** — Fork individual apps to build your own
- **Architecture Guide** — Real-world Clean Architecture patterns

## 🛠️ Technology Stack

| Technology      | Version | Purpose                                           |
| --------------- | ------- | ------------------------------------------------- |
| Next.js         | 16.x    | React framework with App Router                   |
| React           | 19.x    | UI library with React Compiler (auto-memoization) |
| TypeScript      | 5.x     | Type safety                                       |
| Tailwind CSS    | 4.x     | Utility-first styling                             |
| daisyUI         | 5.x     | Component library                                 |
| Zustand         | 5.x     | State management                                  |
| Zod             | 4.x     | Schema validation                                 |
| react-hook-form | 7.x     | Form handling                                     |
| lucide-react    | latest  | Icon library                                      |
| Serwist         | 9.x     | Service worker / PWA (offline support, installable) |

### @localmode Packages Used

```json
{
  "@localmode/core": "workspace:*",
  "@localmode/react": "workspace:*",
  "@localmode/transformers": "workspace:*",
  "@localmode/webllm": "workspace:*",
  "@localmode/wllama": "workspace:*",
  "@localmode/litert": "workspace:*",
  "@localmode/pdfjs": "workspace:*",
  "@localmode/chrome-ai": "workspace:*",
  "@localmode/mediapipe": "workspace:*",
  "@localmode/devtools": "workspace:*"
}
```

### Additional @localmode Packages

These packages are available in the monorepo but not directly used by the showcase app:

| Package | Description |
|---------|-------------|
| `@localmode/ai-sdk` | Vercel AI SDK provider — use local models with `generateText`, `streamText`, and `embed` |
| `@localmode/langchain` | LangChain.js adapter (LocalModeEmbeddings, ChatLocalMode, LocalModeVectorStore) |
| `@localmode/dexie` | Dexie.js storage adapter (~15KB) |
| `@localmode/idb` | idb storage adapter (~3KB) |
| `@localmode/localforage` | localForage storage adapter (~10KB, auto-fallback) |

## 📱 Progressive Web App

The showcase is an installable, offline-capable PWA. After first load, apps continue to work without a network connection (models are cached in IndexedDB by the @localmode packages; the service worker caches app assets). Users can install it from the browser address bar on Chrome/Edge.

| File | Purpose |
| ---- | ------- |
| `src/app/sw.ts` | Serwist service worker (asset precaching, offline fallback) |
| `src/app/manifest.ts` | Web app manifest (icons, theme color, display mode) |
| `src/app/offline/page.tsx` | Offline fallback page |
| `src/app/_components/sw-registrar.tsx` | Client component that registers the SW on first load |
| `serwist.config.js` | Serwist build configuration |
| `scripts/build-sw.mjs` | Service worker build script |

## 📱 Applications (34 Apps)

All apps are live at [localmode.ai](https://localmode.ai).

### Chat & Agents (3 apps)

| App | Description | Key Features |
| --- | ----------- | ------------ |
| **[LLM Chat](/llm-chat)** | Privacy-first AI chat with streaming | Multiple models, WebGPU |
| **[Research Agent](/research-agent)** | AI agent that researches topics step-by-step | ReAct reasoning, tool calling |
| **[GGUF Explorer](/gguf-explorer)** | Inspect GGUF models, check compatibility, chat via WASM | 160K+ models, browser compat |

### Audio (4 apps)

| App | Description | Key Features |
| --- | ----------- | ------------ |
| **[Voice Notes](/voice-notes)** | Record, transcribe, search semantically | Whisper STT, semantic search |
| **[Meeting Assistant](/meeting-assistant)** | Transcription, summarization, action items | STT + summarization |
| **[Audiobook Creator](/audiobook-creator)** | Text-to-speech audiobook generation | Kokoro TTS, 29 voices, streaming playback, speed control |
| **[Voice Studio](/voice-studio)** | Browse, preview, and compare all 29 Kokoro TTS voices | Voice browser, side-by-side comparison |

### Text & NLP (11 apps)

| App | Description | Key Features |
| --- | ----------- | ------------ |
| **[Sentiment Analyzer](/sentiment-analyzer)** | Customer feedback analysis | Batch processing |
| **[Email Classifier](/email-classifier)** | Zero-shot intent classification | Custom labels |
| **[Translator](/translator)** | Multi-language translation | 20+ language pairs, offline |
| **[Text Summarizer](/text-summarizer)** | Document summarization | Extractive and abstractive |
| **[Q&A Bot](/qa-bot)** | Extractive question answering | Confidence scores |
| **[Smart Autocomplete](/smart-autocomplete)** | Context-aware text completion | Fill-mask models |
| **[Invoice Q&A](/invoice-qa)** | Visual document understanding | Document QA models |
| **[Smart Writer](/smart-writer)** | AI writing assistant with summarization and translation | Chrome AI, auto-fallback |
| **[Data Extractor](/data-extractor)** | Extract structured JSON from text using local LLMs | Schema validation, self-correction |
| **[Model Advisor](/model-advisor)** | Device capability detection and model recommendations | Adaptive batching, no download |
| **[Model Evaluator](/model-evaluator)** | Evaluate models with metrics and confusion matrix | Threshold calibration, JSON export |

### Vision (10 apps)

| App | Description | Key Features |
| --- | ----------- | ------------ |
| **[Background Remover](/background-remover)** | Image segmentation | Transparency export |
| **[Smart Gallery](/smart-gallery)** | Auto-categorization and visual search | Image features |
| **[Product Search](/product-search)** | E-commerce visual search | Image embeddings |
| **[Image Captioner](/image-captioner)** | Accessibility alt-text generation | Florence-2 |
| **[OCR Scanner](/ocr-scanner)** | Text extraction from images | TrOCR, GLM-OCR, LightOnOCR-2 |
| **[Object Detector](/object-detector)** | Real-time object detection | D-FINE, webcam |
| **[Photo Enhancer](/photo-enhancer)** | Image super-resolution and upscaling | Swin2SR, 2x/4x |
| **[Duplicate Finder](/duplicate-finder)** | Visual similarity detection | Image features |
| **[Cross-Modal Search](/cross-modal-search)** | Search photos by text or reference image | CLIP embeddings, text-to-image |
| **[MediaPipe Studio](/mediapipe-studio)** | Real-time hand, pose, face tracking and gestures | Google MediaPipe, on-device |

### RAG & Search (4 apps)

| App | Description | Key Features |
| --- | ----------- | ------------ |
| **[PDF Search](/pdf-search)** | Semantic PDF search with RAG | PDF upload, source citations |
| **[Semantic Search](/semantic-search)** | Personal knowledge base | Hybrid search |
| **[LangChain RAG](/langchain-rag)** | Full LangChain RAG pipeline running locally | Local LLM, source citations |
| **[Data Migrator](/data-migrator)** | Import/export vectors from Pinecone, ChromaDB, CSV, JSONL | Format auto-detection, re-embedding |

### Privacy & Security (2 apps)

| App | Description | Key Features |
| --- | ----------- | ------------ |
| **[Document Redactor](/document-redactor)** | PII detection and auto-redaction | NER models |
| **[Encrypted Vault](/encrypted-vault)** | E2E encrypted notes and documents | Web Crypto API |

## 🏗️ Architecture

Each app in `src/app/(apps)/` is **completely self-contained** with no shared code between apps.

```
src/app/
├── (apps)/                 # Route group for apps
│   └── {app-name}/         # Self-contained app
│       ├── _components/    # Pure UI components
│       │   ├── ui.tsx      # Reusable UI (Button, Input, Spinner)
│       │   └── error-boundary.tsx
│       ├── _hooks/         # React hooks (async operations)
│       ├── _lib/           # Types, utils, constants
│       ├── _services/      # @localmode/* integrations
│       ├── _store/         # Zustand stores (optional — shared UI state only)
│       └── page.tsx        # Entry point
├── (home)/                 # Landing page
│   ├── _components/        # Home page components
│   ├── _lib/               # Types, constants, utils
│   ├── _store/             # UI state
│   └── page.tsx
├── _components/            # App-wide components
│   └── sw-registrar.tsx    # Service worker registration (PWA)
├── offline/                # Offline fallback page (PWA)
│   └── page.tsx
├── globals.css             # Tailwind + daisyUI setup
├── layout.tsx              # Root layout
├── manifest.ts             # Web app manifest (PWA)
└── sw.ts                   # Serwist service worker (PWA)
```

### Clean Architecture Flow

```
page.tsx (Entry)
    │
    ▼
_components/ (Pure UI)
    │
    ▼
_hooks/ (Orchestration, async operations)
    │
    ├──────────────────────┐
    ▼                      ▼
_store/ (Optional)   _services/ (@localmode calls)
    │                      │
    └──────────┬───────────┘
               ▼
         _lib/ (Types, utils, business logic)
```

### Key Principles

1. **Self-Contained Apps** — No imports from outside the app folder
2. **Services for External Calls** — All @localmode usage in `_services/`
3. **Stores Are Optional** — Only for UI state shared across multiple components; most apps use hooks + useState
4. **Async in Hooks** — All async operations managed in hooks
5. **Derived State** — Compute values, don't store duplicates
6. **Skip Memoization** — React Compiler handles `useMemo`/`useCallback`

## 🚀 Quick Start

```bash
# Preferred: Install dependencies with pnpm
pnpm install

# Alternative: Install dependencies with npm
npm install

# Run development server
pnpm dev
# or
npm dev

# Open http://localhost:3000
```

## 📁 Adding a New App

1. Create app directory: `src/app/(apps)/my-app/`
2. Add types: `_lib/types.ts`
3. Add services: `_services/my-app.service.ts`
4. Add hooks: `_hooks/use-my-app.ts`
5. Add UI: `_components/ui.tsx`, `_components/error-boundary.tsx`
6. Create entry: `page.tsx`
7. Register in: `src/app/(home)/_lib/constants.ts`
8. _(Optional)_ Add store: `_store/my-app.store.ts` — only if multiple components share UI state

### Implementation Order

```
1. Types     →  2. Services  →  3. Logic  →  4. Hooks  →  5. UI  →  6. Store (optional)
(_lib/)         (_services/)    (_lib/)      (_hooks/)    (_components/)  (_store/)
```

## 🎨 Styling

### daisyUI Components

All UI uses daisyUI v5 classes:

```tsx
<button className="btn btn-primary btn-sm">Click</button>
<div className="card bg-base-100 shadow-xl">...</div>
<div className="chat chat-start">...</div>
<input className="input input-bordered" />
```

### Custom Theme Colors

| Variable           | Usage            |
| ------------------ | ---------------- |
| `poster-primary`   | Primary actions  |
| `poster-surface`   | Card backgrounds |
| `poster-bg`        | Page background  |
| `poster-text-main` | Primary text     |
| `poster-text-sub`  | Secondary text   |
| `poster-border`    | Borders          |
| `poster-accent-*`  | Accent colors    |

## 📖 Reference App

Study **`llm-chat`** as the canonical example:

| Aspect        | Location                         |
| ------------- | -------------------------------- |
| App structure | `src/app/(apps)/llm-chat/`       |
| Components    | `_components/chat-interface.tsx` |
| Hooks         | `_hooks/use-chat.ts`             |
| Services      | `_services/chat.service.ts`      |
| Stores        | `_store/chat.store.ts`           |
| Types         | `_lib/types.ts`                  |

## 🧪 Development

### Code Quality

- TypeScript strict mode
- Zod validation for all inputs
- daisyUI components throughout
- Self-contained apps (no shared code)
- React Compiler for auto-memoization

### Scripts

```bash
# Preferred: pnpm
pnpm dev          # Development server
pnpm build        # Production build
pnpm lint         # ESLint
pnpm type-check   # TypeScript check

# Alternative: npm
npm run dev       # Development server
npm run build     # Production build
npm run lint      # ESLint
npm run type-check # TypeScript check
```

## Acknowledgments

This showcase is powered by open-source libraries wrapped by @localmode packages:

- [Transformers.js](https://github.com/huggingface/transformers.js) by HuggingFace — ML models in the browser
- [WebLLM](https://github.com/mlc-ai/web-llm) by MLC AI — LLM inference with WebGPU
- [wllama](https://github.com/ngxson/wllama) by ngxson / [llama.cpp](https://github.com/ggml-org/llama.cpp) by Georgi Gerganov — GGUF model inference via WASM
- [LiteRT-LM](https://ai.google.dev/edge/litert) by Google — On-device LLM inference (.litertlm models)
- [MediaPipe](https://ai.google.dev/edge/mediapipe/solutions/guide) by Google — Real-time vision, audio, and text ML tasks
- [PDF.js](https://mozilla.github.io/pdf.js/) by Mozilla — PDF text extraction
- [LangChain.js](https://github.com/langchain-ai/langchainjs) by LangChain — LLM application framework
- [Chrome Built-in AI](https://developer.chrome.com/docs/ai/built-in) by Google — On-device Gemini Nano inference

## 📄 License

[MIT](../../LICENSE)
