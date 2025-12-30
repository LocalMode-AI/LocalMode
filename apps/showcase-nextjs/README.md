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

### @localmode Packages

```json
{
  "@localmode/core": "workspace:*",
  "@localmode/transformers": "workspace:*",
  "@localmode/webllm": "workspace:*",
  "@localmode/pdfjs": "workspace:*",
  "@localmode/dexie": "workspace:*",
  "@localmode/idb": "workspace:*",
  "@localmode/localforage": "workspace:*"
}
```

## 📱 Applications

### ✅ Live Apps

| App                           | Description                                    | Models                            | Features                                    |
| ----------------------------- | ---------------------------------------------- | --------------------------------- | ------------------------------------------- |
| **[LLM Chat](/llm-chat)**     | Privacy-first AI chat with streaming responses | Llama 3.2 1B, Phi-3.5, ...etc.    | Streaming, Multiple Models, Offline, WebGPU |
| **[PDF Search](/pdf-search)** | Ask questions about PDFs with semantic search  | all-MiniLM-L6-v2, ms-marco-MiniLM | PDF Upload, RAG Pipeline, Source Citations  |

### 🔜 Coming Soon

#### Audio (3 apps)

- **Voice Notes** — Record audio, transcribe with Whisper, search semantically
- **Meeting Assistant** — Transcription, summarization, action items
- **Audiobook Creator** — Text-to-speech with natural voices

#### Text & NLP (7 apps)

- **Sentiment Analyzer** — Customer feedback analysis with batch processing
- **Email Classifier** — Zero-shot intent classification with custom labels
- **Translator** — 20+ language pairs, works offline
- **Text Summarizer** — Extractive and abstractive document summarization
- **Q&A Bot** — Extractive question answering with confidence scores
- **Smart Autocomplete** — Context-aware text completion
- **Invoice Q&A** — Visual document understanding

#### Vision (7 apps)

- **Background Remover** — Image segmentation with transparency export
- **Smart Gallery** — Auto-categorization and visual search
- **Product Search** — E-commerce visual search
- **Image Captioner** — Accessibility alt-text generation
- **OCR Scanner** — Text extraction from images and handwriting
- **Object Detector** — Real-time object detection with webcam
- **Duplicate Finder** — Visual similarity detection

#### Privacy & Security (2 apps)

- **Document Redactor** — PII detection and auto-redaction
- **Encrypted Vault** — E2E encrypted notes and documents

#### RAG & Search (1 app)

- **Semantic Search** — Personal knowledge base with hybrid search

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

## 📄 License

[MIT](../../LICENSE)
