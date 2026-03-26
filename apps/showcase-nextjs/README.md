# LocalMode Next.js Showcase

A comprehensive Next.js application showcasing **@localmode packages** with ready AI applications that run entirely in the browser.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../../LICENSE)

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

### @localmode Packages Used

```json
{
  "@localmode/core": "workspace:*",
  "@localmode/transformers": "workspace:*",
  "@localmode/webllm": "workspace:*",
  "@localmode/pdfjs": "workspace:*"
}
```

### Additional @localmode Packages

These packages are available in the monorepo but not directly used by the showcase app:

| Package | Description |
|---------|-------------|
| `@localmode/ai-sdk` | Vercel AI SDK provider — use local models with `generateText`, `streamText`, and `embed` |
| `@localmode/dexie` | Dexie.js storage adapter (~15KB) |
| `@localmode/idb` | idb storage adapter (~3KB) |
| `@localmode/localforage` | localForage storage adapter (~10KB, auto-fallback) |

## 📱 Applications (23 Apps)

All apps are live at [localmode.ai](https://localmode.ai).

### Audio (3 apps)

| App | Description | Key Features |
| --- | ----------- | ------------ |
| **[Voice Notes](/voice-notes)** | Record, transcribe, search semantically | Whisper STT, semantic search |
| **[Meeting Assistant](/meeting-assistant)** | Transcription, summarization, action items | STT + summarization |
| **[Audiobook Creator](/audiobook-creator)** | Text-to-speech with natural voices | Kokoro TTS |

### Text & NLP (8 apps)

| App | Description | Key Features |
| --- | ----------- | ------------ |
| **[LLM Chat](/llm-chat)** | Privacy-first AI chat with streaming | Multiple models, WebGPU |
| **[Sentiment Analyzer](/sentiment-analyzer)** | Customer feedback analysis | Batch processing |
| **[Email Classifier](/email-classifier)** | Zero-shot intent classification | Custom labels |
| **[Translator](/translator)** | Multi-language translation | 20+ language pairs, offline |
| **[Text Summarizer](/text-summarizer)** | Document summarization | Extractive and abstractive |
| **[Q&A Bot](/qa-bot)** | Extractive question answering | Confidence scores |
| **[Smart Autocomplete](/smart-autocomplete)** | Context-aware text completion | Fill-mask models |
| **[Invoice Q&A](/invoice-qa)** | Visual document understanding | Document QA models |

### Vision (7 apps)

| App | Description | Key Features |
| --- | ----------- | ------------ |
| **[Background Remover](/background-remover)** | Image segmentation | Transparency export |
| **[Smart Gallery](/smart-gallery)** | Auto-categorization and visual search | Image features |
| **[Product Search](/product-search)** | E-commerce visual search | Image embeddings |
| **[Image Captioner](/image-captioner)** | Accessibility alt-text generation | Florence-2 |
| **[OCR Scanner](/ocr-scanner)** | Text extraction from images | TrOCR |
| **[Object Detector](/object-detector)** | Real-time object detection | D-FINE, webcam |
| **[Duplicate Finder](/duplicate-finder)** | Visual similarity detection | Image features |

### RAG & Search (2 apps)

| App | Description | Key Features |
| --- | ----------- | ------------ |
| **[PDF Search](/pdf-search)** | Semantic PDF search with RAG | PDF upload, source citations |
| **[Semantic Search](/semantic-search)** | Personal knowledge base | Hybrid search |

### Privacy & Security (3 apps)

| App | Description | Key Features |
| --- | ----------- | ------------ |
| **[Document Redactor](/document-redactor)** | PII detection and auto-redaction | NER models |
| **[Encrypted Vault](/encrypted-vault)** | E2E encrypted notes and documents | Web Crypto API |
| **[Photo Enhancer](/photo-enhancer)** | Image super-resolution | Swin2SR upscaling |

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
│       ├── _store/         # Zustand stores
│       └── page.tsx        # Entry point
├── (home)/                 # Landing page
│   ├── _components/        # Home page components
│   ├── _lib/               # Types, constants, utils
│   ├── _store/             # UI state
│   └── page.tsx
├── globals.css             # Tailwind + daisyUI setup
└── layout.tsx              # Root layout
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
_store/ (State)      _services/ (@localmode calls)
    │                      │
    └──────────┬───────────┘
               ▼
         _lib/ (Types, utils, business logic)
```

### Key Principles

1. **Self-Contained Apps** — No imports from outside the app folder
2. **Services for External Calls** — All @localmode usage in `_services/`
3. **Pure Stores** — No async in stores, only state + setters
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
4. Add store: `_store/my-app.store.ts`
5. Add hooks: `_hooks/use-my-app.ts`
6. Add UI: `_components/ui.tsx`, `_components/error-boundary.tsx`
7. Create entry: `page.tsx`
8. Register in: `src/app/(home)/_lib/constants.ts`

### Implementation Order

```
1. Types     →  2. Services  →  3. Logic  →  4. Store  →  5. Hooks  →  6. UI
(_lib/)         (_services/)    (_lib/)      (_store/)    (_hooks/)    (_components/)
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
- [PDF.js](https://mozilla.github.io/pdf.js/) by Mozilla — PDF text extraction
- [LangChain.js](https://github.com/langchain-ai/langchainjs) by LangChain — LLM application framework
- [Chrome Built-in AI](https://developer.chrome.com/docs/ai/built-in) by Google — On-device Gemini Nano inference

## 📄 License

[MIT](../../LICENSE)
