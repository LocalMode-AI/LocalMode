# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.5.0] - 2026-07-11

Makes on-device structured output actually reliable — small models now emit schema-conforming JSON through grammar-constrained decoding and stronger prompts — and refines the `@localmode/ui` platform at localmode.ai: Device Badge folds into the local-first family, "Open in v0" is supported, the component browser is deep-linkable, and the image blocks are WASM-pinned for stability.

**Released:** `@localmode/core` 2.4.2 · `@localmode/react` 2.4.0 · `@localmode/webllm` 2.2.0.

### Fixed

- **Structured output was broken under Zod 4 and unreliable on small models.** `@localmode/core`'s duck-typed Zod→JSON-Schema reader only understood Zod 3 internals, so every Zod 4 scalar collapsed to `{ type: 'object' }`; it now normalizes both layouts (and adds `bigint`). `buildStructuredPrompt()` now emits a concrete filled example and an explicit top-level-key list, so a model returns data instead of echoing the schema.
- **Image blocks wedged on WebGPU.** The background-remover (SegFormer) and image-enhancer (Swin2SR) pin `device: 'wasm'` — the ONNX-Runtime WebGPU session lifecycle wedged on cancel-mid-load and on switching super-resolution modes, while these tiny models run in ~1s on WASM. The object-detector pauses its live face-tracking loop during one-shot DETR so the two don't starve the GPU.
- **Accessibility & hydration** — `before-after-image-viewer` is now a keyboard-navigable ARIA tablist, and `event-log-viewer` moved its `Date.now()` clock into an effect to fix a server/client hydration mismatch.

### Added

- **Schema-constrained JSON generation.** `@localmode/webllm` forwards `providerOptions.webllm.response_format` to MLC for XGrammar-constrained decoding, and `useGenerateObject` (`@localmode/react`) gains a `providerOptions` passthrough — together forcing schema-conforming JSON from small models (wired into the Data Extractor block).
- **"Open in v0" support** — a new `add-default-export` registry-build step appends `export default <Component>` to shipped component payloads (v0 default-imports the primary component), shown only for an empirical hand-verified allowlist of primitives that render real UI in v0.
- **Deep-linkable component browser** — `/docs/components` accepts `?filter=<family>` and reflects the active family into the URL; the docs homepage gained a "100+ components" preview and a "36 interactive blocks" section linking the real `/blocks/<category>/<block>` routes.

### Changed

- **Device Badge moved into the local-first family** — `ui/device-badge` → `ui/local-first/device-badge` (source, install command, and docs route `/docs/local-first/device-badge`, with a 308 from the old path). The registry's lone top-level "seed" is gone; every component is now family-scoped.
- A mounting preview (e.g. a cmdk list) can no longer scroll the component-browser page, and several blocks now render their full surface before the model loads (controls stay disabled until ready).

### Removed

- `ui/local-first/vector-import-flow` no longer depends on `format-detection-badge` — it inlines a minimal fallback and installs independently.

## [2.4.0] - 2026-07-09

Repairs Chrome Built-in AI, which had been unreachable on every modern Chrome, and adds the user-activation download gate Chrome requires before it will fetch an on-device model.

**Released:** `@localmode/core` 2.4.0 · `@localmode/chrome-ai` 2.2.0 · `@localmode/react` 2.3.0.

### Fixed

- **Chrome Built-in AI was unreachable on every modern Chrome.** `@localmode/chrome-ai`'s Summarizer and Translator, and `@localmode/core`'s four `is*APISupported()` capability detectors, all read the legacy `self.ai.*` namespace that Chrome has removed. `isChromeAISupported()` was literally `'ai' in self`, so it returned `false` on exactly the browsers where the APIs exist — and `detectCapabilities().features.chromeAI` was always `false`. All now read the modern top-level `self.Summarizer` / `self.Translator` / `self.LanguageModel` globals, with the legacy namespace as a fallback.
- **Chrome's `SummarizerType` enum is `'tldr'`, not `'tl;dr'`.** Passing `'tl;dr'` made Chrome throw a `TypeError`, which the provider-fallback probe then swallowed and reported as "this browser does not support it" — blaming the browser for a caller bug. The enum value is corrected across `@localmode/chrome-ai` and `@localmode/react`, and the probe now rethrows bad-option errors instead of mislabelling the browser.
- The Prompt API requires **Chrome 148+** for web pages (Chrome 138 shipped it for extensions only). Summarizer and Translator remain Chrome 138+. Documentation and runtime error hints corrected throughout.

### Added

- `useProviderFallback` (`@localmode/react`) exposes `chromeAvailability`, `refreshChromeAvailability`, `requestChromeDownload`, `chromeDownloadProgress`, and `downloadingCapability`, plus standalone `probeChromeAvailability` / `downloadChromeModel`. Chrome only starts its one-time, browser-wide model download from a **user activation**, so the download must be triggered from a click.
- Chrome AI Summarizer and Translator gained `allowDownload` + `onProgress` settings and an `availability()` gate, matching the language model; they now throw typed `SummarizationError` / `TranslationError`.
- New UI registry primitive `ui/local-first/chrome-ai-download-gate` (`ChromeAIDownloadGate` + `ChromeAIReadyBadge`) rendering the download button, progress, and terminal states. Wired into the `writing-tools/{write,translate,summarize}` blocks. The catalog is now 107 components across 10 families (147 registry items).

## [2.3.0] - 2026-07-09

Launches the `@localmode/ui` registry platform at localmode.ai — a copy-owned catalog of 106 AI UI components across 10 families, plus 37 composed blocks across 12 gallery categories that wire those primitives to real on-device models. The `apps/showcase-nextjs` demo app is retired (absorbed into the blocks at parity) and the built-in DevTools widget is removed. Alongside the platform: a `@localmode/core` RAG ingest ⇄ search round-trip fix, agent tool approval, a StorageAdapter conformance suite, cross-session persistence fixes across all three storage adapters, a resilient model-file cache, and provider load fixes for WASM VLMs, long-context wllama, and LiteRT.

**Released:** `@localmode/core` 2.3.0 · `@localmode/react` 2.2.0 · `@localmode/transformers` 4.1.0 · `@localmode/wllama` 3.1.0 · `@localmode/langchain` 2.1.0 · `@localmode/devtools` 3.0.0 (breaking) · `@localmode/litert`, `@localmode/dexie`, `@localmode/idb`, `@localmode/localforage` 2.0.1.

### Added — @localmode/core

- **`ingest()` object call form + `abortSignal`** — `ingest({ db, documents, model?, embedder?, ...options })` joins the positional `ingest(db, documents, options?)` as a TypeScript overload; passing an `EmbeddingModel` as `model` generates chunk embeddings via `embedMany()`. `IngestOptions` gains `abortSignal`, and both forms throw actionable errors on a missing `db` or non-array `documents`. New type: `IngestObjectOptions`.
- **`TEXT_METADATA_FIELD`** — the metadata key (`'_text'`) under which ingestion stores chunk text, now a shared constant consumed by both the write side and `semanticSearch()`'s read side so the two cannot drift.
- **`defineTool()`** — identity helper anchoring `ToolDefinition<TParams, TResult>` generics so `parameters` and `execute(params)` type-check against each other, letting typed tools fit `ToolDefinition[]` without casts.
- **Agent tool approval** — opt-in human-in-the-loop gate for the ReAct loop: flag a tool `requiresApproval` and supply `onToolApproval` (on `AgentConfig`, per-run override on `AgentRunOptions`). Denials skip execution and feed the reason back as the step observation; decisions are recorded on `AgentStep.approval`, and a flagged tool with no callback fails fast. New types: `ToolApprovalRequest`, `ToolApprovalDecision`.
- **`createKnowledgeBaseEngine()`** — a `kind: 'core'` engine implementing the new frozen `KnowledgeBaseEngine` contract: chunk (off/recursive/semantic) → embed → typed-metadata VectorDB, vector `search`, and grounded streaming `ask` with reasoning stripped and PDF page attribution. Models are injected, so core gains a RAG engine with no new dependency.
- **`streamEmbedManyImages()`** — streaming batch image embedding mirroring `streamEmbedMany()`: per-image yields, `onBatch` progress, `batchSize`/`adaptiveBatching`, per-batch AbortSignal checks and retry.
- **`createStorageAdapterConformanceSuite()`** — a framework-agnostic, dependency-free StorageAdapter contract suite (21 cases: full-`Collection` fidelity, document/vector/index ops, close→reopen persistence, SQ8 cross-session fidelity). The factory supplies a `reopen()` handle, so the suite catches adapters that look fine in-session and corrupt on reopen. Adopted by all three external adapters.
- **`createMockRerankerModel()`** — deterministic mock `RerankerModel` (configurable `scores`/`scoreFn`, honors `topK`, abortable `delayMs`, recorded `calls`).
- **`KMeansOptions.random`** — injectable random source for deterministic `kMeansCluster()` runs (default `Math.random`, behavior unchanged).

### Added — @localmode/react

- **8 new hooks (56 → 64)**: `useModelLoad` (provider load lifecycle with normalized 0–1 progress and a warmup-driven status registry), `useRerank`, `useEncryptedVault` (passphrase-locked AES-GCM CRUD over a core `StorageAdapter`, key in memory only), `useProviderFallback` (per-capability Chrome Built-in AI ⇄ Transformers.js resolution), `usePhotoLibrary`, `useKnowledgeBase`, `useObjectUrl`, and `useStreamingTracker` (experimental). All resolve providers by injection or dynamic `import()`, so `packages/react` gained no provider dependency.
- **`useAgent` tool-approval surface** — returns `pendingApproval` plus `approve()`/`deny(reason?)` while the ReAct loop is paused on a gated tool. Ungated runs never surface one.
- **`useChat` additions** — per-turn `usage` + cumulative `totalUsage`, lifecycle `status`, `streamingMessageId`, `setMessages()`, and `regenerate()` with selectable reply variants.
- **`useEmbedManyImages` progress parity** — now streams via `streamEmbedManyImages()`, exposing `progress: { completed, total }` and a `batchSize` option.
- **Additive options and richer returns across existing hooks** — `useSemanticSearch`, `useGenerateText`, `useSynthesizeSpeech`, `useTranscribe`, `useClassifyZeroShot`, `useLiveTranscribe`, `useTurnTaker`, `useStreamSpeech`, `usePipeline`, `useReindex`, `useAuditLog`, `useSemanticCache`, `useVoiceRecorder`, `useCapabilities`, `useStorageQuota`; `useSequentialBatch`/`useBatchOperation` publish results incrementally with per-item errors. Re-exports `getTextContent`/`normalizeContent` from core.

### Added — @localmode/transformers

- **Resilient model-file cache (default on)** — a custom Transformers.js cache over the browser Cache API storage the provider already uses (`transformers-cache`) whose write path can never fail a model load: a failed write serves the fetched response and warns once per URL, and no-`caches` environments keep stock behavior. Kills the intermittent `NetworkError: Cache.add() encountered a network error` failure class. Opt out with `createTransformers({ resilientCache: false })`.

### Added — @localmode/wllama

- **GGUF model discovery** — `searchGGUFModels()` and `listGGUFFiles()` browse the 160,000+ GGUF repos on the anonymous HuggingFace API and list a repo's `.gguf` files with parsed quant labels. Failures surface as a typed `HFApiError` (`rate-limit` / `network` / `not-found`).

### Added — @localmode/langchain

- **`createLangChainKnowledgeBaseEngine()`** — a `kind: 'langchain'` engine implementing the same core `KnowledgeBaseEngine` contract via the real `LocalModeEmbeddings`/`LocalModeVectorStore`/`ChatLocalMode` adapters, result-equivalent to core's engine. Models are injected, so consumers who never toggle LangChain never pull it.

### Added — @localmode/devtools

- **`/react` hooks subpath** — 9 hooks over the bridge snapshots (`useDevToolsBridge`, `useDevToolsStatus`, `useDevToolsQueueStats`, `useDevToolsEvents`, `useDevToolsModelCache`, `useDevToolsPipelineRuns`, `useDevToolsVectorDBs`, `useDevToolsStorage`, `useDevToolsCapabilities`), built on `useSyncExternalStore` with SSR-safe inert values, preserved snapshots after `disableDevTools()`, and late-enable attachment. The main entry stays React-free.

### Added — @localmode/ui

- **`@localmode/ui` registry platform (localmode.ai)** — a single Next.js 16 / React 19 app that is BOTH a shadcn registry endpoint AND a Fumadocs docs site, distributing copy-owned, composable AI UI primitives ("LocalMode Elements"). Not an npm package: components install with the shadcn CLI (`npx shadcn add @localmode/ui/<item>`) and the consumer owns the copied `.tsx`. shadcn/ui CSS-variable theming (Tailwind 4), generated `ui/all` + per-family aggregates, an MCP-readable `/registry.json` catalog, optional token-gating, and a Run-gated `<ComponentPreview>` that downloads no model until clicked.
- **146 registry items** — 106 copy-owned components across 10 families (Conversation 24, Local-First 24, Results & Insights 12, Input Controls 11, Audio 10, Media & Vision 7, Data & Documents 5, Security & Privacy 5, Artifacts & Canvas 4, DevTools 4), 3 internal `ui/lib/*` items (`utils`, `browser-utils`, `use-environment`), and 37 blocks. Primitives are presentational and hook-driven, and install with **zero `@localmode/*` packages**: generic browser helpers come from the copy-owned `ui/lib/browser-utils` item and the navigator-reading hooks from `ui/lib/use-environment`. A consumer-test lane guards the invariant; blocks are the sole carve-out, guarded by an inverse lane.
- **37 composed blocks across 12 route-served gallery categories** — live, full experiences that wire the primitives to real on-device models, served at the public `/blocks` gallery and installable as `registry:block` items. Categories: `chat`, `knowledge` (4), `audio` (6), `vision` (2), `text` (1), `device` (3), `writing-tools` (4), `text-insights` (4), `photo` (4), `image-studio` (3), `privacy` (2), `agents` (2), plus the `devtools-drawer` layout chrome. Blocks are the wiring layer and the ONLY registry items allowed `@localmode/*` dependencies; each gallery block ships as a single self-contained, copy-paste-ready file, and every model load is gated behind an explicit in-block action.
- **Accessibility floor across every block and primitive** — correct roles, accessible names, keyboard operability, WCAG-AA contrast, visible `focus-visible` rings, an ARIA tablist for the Preview/Code tabs, `role="status"` live regions, and `role="alertdialog"` destructive confirms. Block sources are testid-free (E2E selects via role/label/text), and a shared `stripSnippet()` AST transform guarantees every shipped block file has zero `data-testid`, zero QA comments, and a ≤3-line header.
- **Registry dependencies ship as absolute URLs, so "Open in v0" resolves them.** Items are authored with namespaced `registryDependencies` (`@localmode/ui/lib/utils`), which resolve only through a consumer's `components.json` registries map — the shadcn CLI has that map, v0 does not. The final `registry:build` step rewrites every namespaced dependency in the emitted `public/r/**.json` into an absolute `<origin>/r/ui/<item>.json` URL (618 across 153 items); bare shadcn names pass through and the step is idempotent. The origin comes from `NEXT_PUBLIC_REGISTRY_ORIGIN ?? NEXT_PUBLIC_SITE_URL`, so **a deploy must set one at build time**.

### Added — apps/ui

- **Block-page chrome** — a persistent category sidebar (with a mobile disclosure), a breadcrumb, and per-page "Copy page" / "View as Markdown" actions.
- **Markdown export** — docs pages expand previews, type tables, and install tabs into markdown; block pages expose an `/api/blocks-md/<slug>` route with the full block source.
- **PWA (installable + offline)** — a manifest, a Serwist service worker built postbuild (app-shell precache, model/CDN hosts NetworkOnly, `/offline` fallback), an `SWRegistrar`, and generated icons.
- **Cross-origin isolation** — COOP `same-origin` + COEP `credentialless`, unlocking threaded WASM while keeping cross-origin model downloads working.
- **Other chrome** — a `/capabilities` browser-support page, a live NetworkStatus pill on `/blocks`, a console suppressor for known WASM-runtime noise, custom `not-found`/`error` pages, and a new favicon.
- **New env vars** — `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_REGISTRY_ORIGIN`, and optional verification / IndexNow / social vars (inert until set).

### Added — docs

- **New guides** — a Next.js integration guide; "Model Caching & Reliability" (transformers) and "Model Caching & Offline" (LiteRT) sections; `use-with-ai-sdk.mdx` and `bring-your-own-data.mdx`; and launch content for `@localmode/ui`.

### Added — repo tooling

- **ESLint works again** — the repo had no ESLint config and the root `pnpm lint` used the removed `--ext` flag. A flat `eslint.config.mjs` now lints `packages/**` (apps keep their own Next.js configs) with `eslint-plugin-react-hooks` registered. New `pnpm lint:fix`.
- **`pnpm test:types`** — compiles the type-level contracts in `packages/core/tests/**/*.test-d.ts` (Vitest does not run them), guarding `jsonSchema<T>` inference and `ToolDefinition[]` assignability.

### Changed — @localmode/react

- `useModelStatus` de-stubbed — backed by the `useModelLoad` registry and reflecting the real load lifecycle, instead of optimistically reporting `isReady: true` as soon as an instance existed.
- Published load progress is non-decreasing within a load attempt (high-water clamp, reset per `load()`); raw per-file byte counts are unaffected.
- `toAppError()` carries a core `LocalModeError`'s `code` to `AppError.code` and appends its `hint` to the message.
- `useReindex`, `useCalibrateThreshold`, and `useModelRecommendations` expose `error` as `Error | null` (was `{ message: string } | null`).

### Changed — docs

- **Ingest/search examples normalized to the real API** across the core RAG and embeddings guides, getting-started, the adapter quick starts, and blog posts: object-form `ingest()` examples are now valid against the shipped overload, option names are corrected, and `semanticSearch` results read text from `results[].text`.
- **Blocks-world sweep** — the 436 legacy `localmode.ai/<slug>` deep links across 99 content files were rewritten to their absorbing `localmode.ai/blocks/<name>` URLs, and repo guidance updated to describe the blocks world.

### Fixed — @localmode/core

- **`ingest()` → `semanticSearch()` text round-trip** — text extraction never checked the `_text` metadata key `ingest()` writes, so every ingested chunk came back with `text: undefined` and RAG flows building context from `results[].text` injected empty strings (a HIGH-severity real-consumer bug; search itself was never broken). Precedence is now `text`, `content`, `body`, `_text`, `__text`, `pageContent`; `streamSemanticSearch()` inherits the fix.
- **`jsonSchema()` type inference** — `jsonSchema<T>(schema)` now actually infers `T` from the Zod schema instead of collapsing to `unknown`, and `ToolDefinition.execute` uses method syntax so typed tools are assignable to `ToolDefinition[]`.
- **Semantic cache never cached on the streaming path** — `semanticCacheMiddleware()` stored the response only after its `for await` loop, which never completes for consumers that stop at the `done` chunk (every `streamText()`/`useChat` turn), so streaming lookups always missed. The store now fires on `done`; a turn cancelled mid-stream still stores nothing.
- **Agent runs no longer fail on reasoning models** (`Failed to generate valid object after 3 attempts`) — `generateObject()` appends the Qwen3 `/no_think` switch to the user prompt as well as the system prompt, ReAct action generations get an explicit 2048-token budget, and the action parser unwraps a schema-parroted single-element `oneOf`/`anyOf` wrapper.
- `ModelLoadError`'s default message generalized to `Failed to load model: {modelId}` — the class is shared by every model domain, not just embeddings.
- `StorageAdapter.getVector()`/`getAllVectors()` types now match the implementations (`Float32Array | Uint8Array`, the latter for SQ8/PQ payloads).

### Fixed — @localmode/react

- Mid-flight cancellation is now silent for every `useOperation`-based hook, even when the wrapped core function turns an abort into a plain `Error` (e.g. `rerank()`/`classify()` "was cancelled").
- `cancel()` returns a hook to idle immediately — previously the loading state reset only when the promise settled, so a cancelled but non-interruptible in-worker call left the hook stuck loading.
- `useVoiceRecorder` ignored microphone selection — new `deviceId`/`constraints` options are forwarded to `getUserMedia`, and recording now errors when the requested device is unavailable instead of silently falling back.

### Fixed — @localmode/transformers

- **Cross-encoder reranking produced no ranking signal** — `doRerank` scored query and document independently, so the document never influenced the score and single-logit models collapsed to a constant `0`. It now encodes real (query, document) pairs via `AutoTokenizer` `text_pair` + `AutoModelForSequenceClassification`, with sigmoid on single-logit heads.
- **Vision-language models failed to load on WASM** (`ERROR_CODE: 9`) — the hardcoded q4/fp16 multimodal dtype default uses ops onnxruntime-web only implements on WebGPU. The default is now device-aware: WebGPU keeps the q4/fp16 mix, WASM uses fp32 embed/vision with a q4 decoder. An explicit `settings.dtype` still overrides.
- **English-only Whisper checkpoints (`*.en`) failed every transcription** — the force-injected `language: 'en'` / `task: 'transcribe'` defaults now apply only to multilingual checkpoints.

### Fixed — @localmode/wllama

- **Long-context models no longer abort the wasm32 load** — the context length inferred from the catalog or GGUF metadata is capped at 8192 before `n_ctx`; models advertising native windows like 131072 requested a multi-GiB KV cache that cannot fit the wasm32 4GiB heap. An explicit `settings.contextLength` is never capped.
- **Reranking works** — the pinned `@wllama/wllama@3.2.3` ships no rerank API, so every `WllamaRerankerModel` call failed with `createRerank is not a function` after the download. Bumped to `^3.5.1`, and the reranker loads in reranking mode.

### Fixed — @localmode/litert

- `doGenerate()` no longer freezes the tab for the whole generation — it drains `sendMessageStreaming()` (per-token main-thread yields) instead of the synchronous `sendMessage()`.
- CPU-capable models no longer fail to load in WebGPU-less browsers — the provider probes actual device usability and pins the CPU backend when `navigator.gpu` exposes no usable device.

### Fixed — @localmode/dexie, @localmode/idb, @localmode/localforage

- **Full `Collection` persistence — quantization calibration, compression calibration, and drift fingerprints now survive a reopen.** All three adapters cherry-picked `{ id, name, dimensions, createdAt }` on collection write AND read, silently dropping the extended fields core stores, so quantized or compressed vectors round-tripped in-session but decoded as raw bytes after a close→reopen, and drift detection never fired. Collections now round-trip as the full object, and each adapter adopted the conformance suite. Data written with quantization/compression by earlier adapter versions is unrecoverable — clear and re-ingest.
- **SQ8/PQ-compressed vectors now round-trip correctly.** The adapters coerced core's `Uint8Array` payloads to f32 (dexie/idb threw a `RangeError`; localforage returned a `Float32Array` of byte-values). Dexie/idb now persist the typed array itself, localforage adds a `dtype` discriminator, and legacy records keep reading as `Float32Array` (no migration).

### Removed

- **`apps/showcase-nextjs`** — the 34-app Next.js demo showcase, retired and removed from the pnpm workspace. Its user-facing capabilities were absorbed at parity into the `/blocks` gallery, `localmode.ai` now serves the registry + gallery in its place, and all 34 legacy `localmode.ai/<slug>` URLs permanently redirect to their successor blocks. The source remains in git history and can be restored from the last commit that contained it (`git checkout <sha> -- apps/showcase-nextjs`).
- **`@localmode/devtools/widget`** — the built-in DevTools widget UI. The data layer (collectors + bridge) and the `/react` hooks are unchanged; the successor UI is the `ui/devtools` registry family plus the composed `ui/blocks/devtools-drawer`.

### Breaking Changes

- **`@localmode/devtools` 3.0.0** — `import { DevToolsWidget } from '@localmode/devtools/widget'` no longer resolves. The data layer and `/react` hooks are unchanged; migrate to the `ui/devtools` primitives or `ui/blocks/devtools-drawer`.

### Backward Compatibility

- Runtime behavior is unchanged, but two `@localmode/core` **type** signatures moved (hence the 2.3.0 minor, not a major): `StorageAdapter.getVector()`/`getAllVectors()` now return `Float32Array | Uint8Array` (callers assigning straight to `Float32Array` must narrow), and `jsonSchema<T, S>` lost its second type parameter (it never inferred).
- Agent tool approval, the `useAgent` approval surface, `useEncryptedVault`, and the storage-adapter compressed-vector fixes are additive with no migration. `@localmode/ui` is a first release, so it has no prior install commands or routes to preserve — only the retired showcase app's URLs, which redirect.

## [@localmode/wllama@3.0.0] - 2026-05-28

### Added

- **Upgraded to wllama v3** (`@wllama/wllama@^3.2.3`) — migrated from v2's custom API to v3's OAI-compatible API (`createChatCompletion`, `createCompletion`, `createEmbedding`). The public `@localmode/wllama` API remains backward-compatible for existing consumers.
- **Embedding models** — New `WllamaEmbeddingModel` class implementing `EmbeddingModel`. Factory method `wllama.embedding(modelId)`. 3 curated GGUF embedding models: nomic-embed-text-v1.5 (768d, 78MB), mxbai-embed-large-v1 (1024d, 197MB), bge-small-en-v1.5 (384d, 35MB). Dimensions auto-detected from GGUF metadata. New exports: `WllamaEmbeddingModel`, `WllamaEmbeddingSettings`.
- **WebGPU acceleration** — `useWebGPU: boolean | 'auto'` and `nGpuLayers: number` settings. GPU offload with automatic WASM fallback. `gpuAccelerated` property on model instances.
- **Tool calling** — `providerOptions.wllama.tools` and `tool_choice` forwarded to v3's OAI-compatible chat completion. Results include `toolCalls` array. 8 models verified: Qwen 2.5 (0.5B, 1.5B, Coder 1.5B, 3B, Coder 7B), Llama 3.2 (1B, 3B), Phi-4 Mini.
- **Vision / multimodal** — `mmprojUrl` setting loads vision projection GGUF. `supportsVision` auto-detected. Base64 images converted to ArrayBuffer. Holo2 4B/8B catalog entries now include `mmprojUrl`.
- **Jinja chat templates** — Enabled by default. v3's template engine handles chat formatting. Graceful fallback on template errors. Opt-out with `useJinja: false`.
- **Model catalog** expanded from 18 to 30 models (25 language + 3 embedding + 2 reranker). New `WllamaModelEntry` fields: `supportsToolCalling`, `isEmbeddingModel`, `isRerankerModel`, `dimensions`, `mmprojUrl`, `nGpuLayers`.
- **Gemma 4 GGUF models** — `Gemma-4-E2B-IT-Q4_K_M` (3.46GB, 131K context, 5.1B params / 2.3B effective PLE) and `Gemma-4-E4B-IT-Q4_K_M` (5.41GB, 131K context, 8B params / ~4B effective PLE). Vision + tool calling. Uses bartowski for main GGUF, ggml-org Q8_0 for mmproj vision projector files.
- **New catalog models** — Qwen3 (0.6B, 1.7B, 4B), DeepSeek R1 Distill (1.5B, 7B), 2 reranker models (jina-reranker-v2-base-multilingual, bge-reranker-v2-m3).
- **True streaming** — `doStream()` now uses `stream: true` in `createChatCompletion()` for real token-by-token streaming instead of buffered output.
- **Structured output / JSON mode** — `response_format: { type: 'json_object' }` support via `responseFormat` option. Grammar-based JSON constraint via `providerOptions.wllama.grammar` (GBNF).
- **Reranking** — New `WllamaRerankerModel` class implementing `RerankerModel`. Factory method `wllama.reranker(modelId)`. 2 curated reranker models in catalog.
- **Reasoning mode** — `reasoning: boolean`, `reasoningFormat`, and `reasoningBudgetTokens` settings for models with thinking/chain-of-thought capability (e.g., Qwen3, DeepSeek R1).
- **Performance config** — `cacheTypeK`, `cacheTypeV` (KV cache quantization), `flashAttention`, and speculative decoding settings for advanced performance tuning.
- **Grammar sampling** — GBNF grammar support via `providerOptions.wllama.grammar` for constrained output generation.
- **Model management** — `listCachedModels()`, `clearAllModelCache()`, `refreshModel()` for managing downloaded GGUF models in browser storage.
- **LoRA adapters** — Support for loading LoRA adapter files alongside base models.
- **Extended sampling params** — `min_p`, `seed`, and additional sampling parameters via provider options.
- **Audio input (experimental)** — `AudioPart` content support for models with audio capabilities.
- **Showcase app updates** — llm-chat: "Tools" and "Vision" capability badges, embedding models filtered from chat list, WebGPU passthrough, `providerOptions` threading through `useChat` hook. gguf-explorer: "Capabilities" inspect section with badges, new embedding model cards, JSON mode toggle.

### Changed

- Single WASM binary (v3.2.3) replaces dual single-thread/multi-thread binaries. CDN URL: `@wllama/wllama@3.2.3/src/wasm/wllama.wasm`.
- Streaming uses v3's `createChatCompletion({ stream: true })` AsyncIterable instead of the v2 `onNewToken` callback-to-queue bridge.
- Token usage from OAI response `usage` field instead of `tokenize()`.
- Stop sequences as strings via `stop` field instead of token ID lookup.

### Removed

- `outputTokenIds` runtime extension (v3 OAI API does not expose per-token IDs).
- v2 internal APIs: `tokenize()`, `samplingInit()`, `lookupToken()`.

## [@localmode/transformers@4.0.0] - 2026-05-24

### Added

- **Gemma 4 ONNX models** — Added Gemma 4 E2B and E4B to the LLM catalog (16 total, up from 14). New `isGemma4Model()` detection routes Gemma 4 through the VLM loading path with `Gemma4ForConditionalGeneration`.
- **Gemma 4 vision support** — Gemma 4 models are vision-capable, bringing the total to 5 vision-capable ONNX models (up from 3).
- **New blog post** — Comparison article: Gemma 4 LiteRT vs ONNX.
- **`vad()` factory method** — `transformers.vad(modelId)` creates a `VADProvider` for use with `createLiveTranscriber()`. Backed by the Silero ONNX model.
- **Generative OCR** — `transformers.ocr()` now auto-detects and routes GLM-OCR and LightOnOCR-2 models to a vision-language OCR path using `AutoModelForImageTextToText`. Two new catalog entries: `GLM_OCR` and `LIGHTONOCR_2_1B`.
- **Kokoro TTS integration** — When a Kokoro model ID is requested via `transformers.textToSpeech()`, synthesis now routes to a dedicated phonemizer-backed path using `StyleTextToSpeech2Model` from transformers v4 + the `phonemizer` npm package (eSpeak-NG WASM). Dramatically better pronunciation compared to the generic pipeline.
- **29 named English voices** — American English (21) and British English (8). Exposed via `TextToSpeechModel.voices` field and `DoSynthesizeOptions.voice` parameter.
- **Voice catalog export** — `KOKORO_VOICES` constant with metadata (id, name, language, languageLabel, gender), `KOKORO_DEFAULT_VOICE`, `KOKORO_LANG_MAP`, and `KokoroVoice` type — all exported from `@localmode/transformers`.
- **Speed control** — `speed` parameter (0.5–2.0) now forwarded to Kokoro synthesis.
- **Provider options** — `providerOptions.kokoro.dtype` for quantization control (q8/fp16/fp32/q4/q4f16, default q8).
- **New dependency** — `phonemizer` (^1.2.0) added (eSpeak-NG WASM for text→phoneme conversion). Note: `kokoro-js` was NOT used due to v3/v4 version conflict — Kokoro synthesis reimplemented directly using transformers v4.
- **New showcase app** — `voice-studio` — browse all 29 English voices, streaming synthesis with speed control, side-by-side voice comparison.

### Breaking Changes

- **Unified Transformers.js dependency** — Migrated from `@huggingface/transformers@^3.8.1` to `@huggingface/transformers@^4.2.0`. The npm alias `@huggingface/transformers-v4` has been removed entirely. All 26 implementation files now import from a single `@huggingface/transformers` package.

### Changed

- **Audiobook Creator upgraded** — Switched from MMS-TTS (`Xenova/mms-tts-eng`, 30MB) to Kokoro TTS (86MB). Added voice selector dropdown (29 English voices), speed slider (0.5–2.0x), streaming playback via `useStreamSpeech`.
- Kokoro model registry entry updated: 29 English voices, phonemizer-backed, speed control.
- All pipeline-based implementations now pass explicit `dtype: 'fp32'` instead of `undefined` when quantization is disabled, eliminating "dtype not specified" log noise.
- Removed `embedding-v4.ts` experimental benchmark file (no longer needed with unified v4).
- Cleaned up `utils.ts` conditional v3/v4 import branching.
- Removed "experimental" / "preview" labels from language model types, provider, and model catalog.

### Backward Compatibility

- Non-Kokoro TTS models (SpeechT5, MMS-TTS) continue using the generic pipeline unchanged.
- All existing `synthesizeSpeech()` and `streamSynthesizeSpeech()` calls work as before.
- The public API is unchanged for the v3→v4 migration. If you imported `TransformersV4EmbeddingModel` or `createV4EmbeddingModel`, use `TransformersEmbeddingModel` / `createEmbeddingModel` instead. Re-test model outputs — embedding cosine similarity is ≥0.9999 and classification labels/scores are identical in validation testing.

### Fixed

- **ImageTextToText tokenizer crash** — `loadImageTextToText` (GLM-OCR, LightOnOCR-2) now loads an `AutoTokenizer` alongside the processor, fixing a `TypeError` when calling `generateText()` or `streamText()` with a text-only prompt (no images).
- **Kokoro TTS unrecoverable load failure** — If the Kokoro model fails to download (transient network error), the module-level promise is now cleared so subsequent calls can retry instead of permanently returning the cached rejection.

## [@localmode/core@2.2.0] - 2026-05-24

### Added

- **Audit Log** (`core/src/security/`) — Append-only, hash-chained, cryptographically signed, and optionally encrypted audit log for local-first compliance use cases. New exports: `createAuditLog`, `verifyChain`, `exportAuditLog`, `deriveAuditKey`, `generateEphemeralAuditKey`, and `AuditLogError`. Supports key derivation (PBKDF2) via `deriveAuditKey` and ephemeral session keys via `generateEphemeralAuditKey`. Chain integrity verified with `verifyChain`; full log export via `exportAuditLog`. All operations are offline and use the Web Crypto API — no external dependencies. React hook `useAuditLog` added to `@localmode/react`.
- **Live Transcription** (`core/src/audio/`) — Streaming speech-to-text with voice-activity detection (VAD) and a turn-taking orchestrator for real-time conversational AI. New factory exports: `createLiveTranscriber`, `createTurnTaker`. Built-in VAD providers: `EnergyVADProvider` (threshold-based, zero-latency) and `SileroVADProvider` (neural VAD via Silero ONNX model). AudioWorklet helpers: `registerEnergyVADWorklet`, `createScriptProcessorVADNode` (fallback for browsers without AudioWorklet). Capability detection: `isLiveTranscribeSupported`, `isAudioWorkletSupported`, `isMediaCaptureSupported`. Error: `MediaNotSupportedError` (thrown when `getUserMedia` or AudioContext is unavailable). React hooks `useLiveTranscribe` and `useTurnTaker` added to `@localmode/react`.
- **Silero VAD implementation** in `@localmode/transformers` (`silero-vad.ts`) — `TransformersSileroVAD`, `createSileroVAD` factory, and `SileroVADSettings` type. Provides a neural VAD provider backed by the Silero ONNX model via `@huggingface/transformers` for high-accuracy speech boundary detection.
- **Streaming Speech** (`core/src/audio/`) — `streamSynthesizeSpeech`, `playStreamedSpeech`, and `splitIntoClauses` (with `DEFAULT_ABBREVIATIONS`) for clause-by-clause streaming TTS playback. React hook `useStreamSpeech` in `@localmode/react`.
- **Generative OCR `prompt` parameter** — `ExtractTextOptions` and `DoOCROptions` now accept an optional `prompt` for table/formula recognition with generative OCR models.
- **Capability detection** — New `isAudioWorkletSupported()`, `isMediaCaptureSupported()`, and `isLiveTranscribeSupported()` functions. New `LiveTranscribeCapability` type added to `CapabilityReport`.
- **`MediaNotSupportedError`** — New error class thrown when `getUserMedia` or AudioContext is unavailable.
- **`useExtractText` prompt support** — React hook now accepts a `prompt` option for generative OCR models.
- **`AudioPart` content type** — Added to `ContentPart` discriminated union in `packages/core/src/generation/types.ts` — `{ type: 'audio', data: string (base64), mimeType: string }`. Backward-compatible additive change; existing `TextPart | ImagePart` consumers continue to work unchanged via the `type` discriminator.

## [@localmode/mediapipe@2.0.0] - 2026-05-24

### Added

- **New provider package**: `@localmode/mediapipe` wrapping Google's MediaPipe Tasks — `@mediapipe/tasks-vision`, `@mediapipe/tasks-audio`, and `@mediapipe/tasks-text` — as a single unified provider. WASM + WebGL runtime, works in all target browsers (no WebGPU required).
- **New core interfaces** for landmark and gesture tasks: `HandLandmarkModel`, `PoseLandmarkModel`, `FaceDetectionModel`, `FaceLandmarkModel`, `GestureRecognitionModel` in `packages/core/src/vision/`, and `LanguageDetectionModel` in `packages/core/src/translation/` — all interface-only, zero new core dependencies.
- **New core functions**: `detectHands()`, `detectPose()`, `detectFace()`, `detectFaceLandmarks()`, `recognizeGesture()` (vision) and `detectLanguage()` (text).
- **New core constants**: `HAND_CONNECTIONS`, `POSE_CONNECTIONS`, `FACE_CONNECTIONS` (landmark topology for drawing overlays), `GESTURE_CATEGORIES` (8 standard gestures), `SUPPORTED_LANGUAGES` (ISO 639-1 code → name map).
- **MediaPipe model implementations** for new interfaces (hand/pose/face landmarks, face detection, gesture recognition) and existing core interfaces — `ImageClassificationModel`, `ObjectDetectionModel`, `SegmentationModel`, `ImageFeatureModel` (vision), `AudioClassificationModel` (YAMNet, 521 categories), `ClassificationModel` and `EmbeddingModel` (text), `LanguageDetectionModel` (110 languages).
- **Provider-specific streaming API** — `createHandTracker()`, `createPoseTracker()`, `createFaceTracker()`, `createGestureTracker()` run MediaPipe vision tasks in VIDEO mode over a `<video>` element at 30-60fps with a results callback and `start`/`stop`/`close` lifecycle.
- **Curated model catalog** (`MEDIAPIPE_MODELS`) — 13 verified entries from Google's CDN, ranging from 230KB (face detector) to 18.6MB (image classifier).
- **6 new React hooks** in `@localmode/react`: `useDetectHands`, `useDetectPose`, `useDetectFace`, `useDetectFaceLandmarks`, `useRecognizeGesture`, `useDetectLanguage`.
- **New showcase app** — `mediapipe-studio` — a 7-tab studio demonstrating webcam hand/pose/face/gesture tracking, audio classification, and language/text tasks.
- **Lazy task loading + concurrent-load deduplication** following the established provider pattern; each task domain (vision/audio/text) loads its WASM runtime independently from the jsDelivr CDN.

### Status

- `@mediapipe/tasks-*` is pinned to `^0.10.22`.
- **Audio embeddings are not available** — the `@mediapipe/tasks-audio` JS package ships only `AudioClassifier`, not an `AudioEmbedder` class. Audio coverage is limited to classification.
- `@mediapipe/tasks-genai` (LLM inference) is deliberately not wrapped — it duplicates `@localmode/litert`.
- MediaPipe text classification requires a custom-trained model (MediaPipe Model Maker) — `textClassifier()` requires an explicit model path.
- Audio and vision WASM runtimes can conflict if run concurrently in the same thread (MediaPipe GitHub #4737) — use Web Worker isolation for concurrent audio+vision usage.

## [@localmode/litert@2.0.0] - 2026-05-24

### Added

- **New provider package**: `@localmode/litert` wrapping Google's `@litert-lm/core@^0.12.1` — first-party JS/WASM browser bindings for the LiteRT-LM inference engine.
- **`LanguageModel` implementation** with `doGenerate()` and `doStream()`. Runs `.litertlm` models on a WebGPU backend; portable models also run on a CPU WASM backend. Text-in / text-out — the LiteRT-LM JS API does not currently expose vision or audio input.
- **Curated catalog of three models**, all verified end-to-end in real Chrome (Chrome 145, 2026-05-20):
  - `gemma-4-E2B` — Gemma 4 E2B (`gemma-4-E2B-it-web.litertlm`, 2.0 GB, 8K context) — **WebGPU only**
  - `gemma-4-E4B` — Gemma 4 E4B (`gemma-4-E4B-it-web.litertlm`, 3.0 GB, 8K context) — **WebGPU only**
  - `qwen3-0.6B` — Qwen3 0.6B (`Qwen3-0.6B.litertlm`, 614 MB, 4K context) — runs on WebGPU **or** CPU
  The Gemma 4 entries use the web-optimized `*-it-web.litertlm` builds — the files Google publishes as the models officially supported by the LiteRT-LM JS API. These builds are GPU-compiled (their TFLite sections carry a `gpu_artisan` backend constraint) and cannot run on the CPU backend.
- **`requiresWebGPU` catalog flag + WebGPU pre-check** — Gemma 4 entries are flagged `requiresWebGPU: true`. The provider checks WebGPU availability before downloading such a model and throws a clear `ModelLoadError` if WebGPU is unavailable or `backend: 'CPU'` is set, instead of failing deep inside the WASM loader.
- **Flexible model loading** — load any `.litertlm` file via a curated catalog key, a HuggingFace `repo:file` shorthand, or a full URL. Gated Google models (Gemma 3n, Gemma 3 1B, FunctionGemma) load via a resolved `modelUrl` after accepting the Gemma license on HuggingFace.
- **Automatic GPU→CPU fallback** — if `@litert-lm/core` cannot stream-load a portable `.litertlm` file on the GPU backend ("Streaming … is not supported yet"), the provider retries once on the CPU backend. (Skipped for WebGPU-only models, where a CPU retry cannot help.)
- **Cache management** — `isModelCached()`, `preloadModel()`, `deleteModelCache()`, `resolveModelUrl()`.
- **Browser compatibility checker** — `checkLiteRTBrowserCompat()` reports WebGPU support, device RAM, and the recommended backend.
- **Lazy Engine loading + load deduplication** following the `@localmode/wllama` pattern; `unload()` releases WASM memory via `engine.delete()`.
- **Showcase integration** — the `llm-chat` showcase app gains `litert` as a 4th backend alongside `webgpu`, `wasm`, and `onnx` (new "LiteRT" filter tab in the model sidebar).

### Status

- `@litert-lm/core` is at v0.12.1 (early JS release). API surface may change. Pinned to `^0.12.1`.
- Text-only — the LiteRT-LM JS API is text-in / text-out in this preview.
- Gemma 4 E2B/E4B are WebGPU-only (GPU-compiled `-web.litertlm` builds); only Qwen3 0.6B runs on the CPU backend.
- `stopSequences` is not supported (LiteRT-LM uses token IDs, not strings).
- Token usage counts are estimated from text length.

## [@localmode/chrome-ai@2.1.0] - 2026-05-24

### Added

- **`LanguageModel` implementation** — `ChromeAILanguageModel` with `doGenerate()` and `doStream()` via Chrome's Prompt API (`window.LanguageModel` / Gemini Nano). Supports `generateText()`, `streamText()`, and `generateObject()` from `@localmode/core`. Zero-download inference — model ships with Chrome.
- **`isPromptAPISupported()`** utility — checks Prompt API availability before model creation.
- **`warmUp()` / `isReady()` lifecycle** — pre-initialize the language model for faster first inference.
- **`destroy()` method** — release model resources explicitly.
- **New exported types**: `AILanguageModel`, `AILanguageModelAvailability`, `AILanguageModelCreateOptions`, `AILanguageModelFactory`, `AILanguageModelPromptOptions`, `ChromeAILanguageModelSettings`.

### Fixed

- **Dead-code `finishReason` ternary** — Removed the no-op `stopped ? 'stop' : 'stop'` in both `doGenerate` and `doStream`. Chrome's Prompt API does not expose token-limit truncation, so `finishReason` is always `'stop'`. The dead ternary previously made the code appear as if it intended to report `'length'` but never could.

## [@localmode/webllm@2.1.0] - 2026-05-24

### Added

- **Qwen 3.5 models** — Added `Qwen3.5-4B-q4f16_1-MLC` (2.39 GB, 32K context) and `Qwen3.5-9B-q4f16_1-MLC` (5.06 GB, 32K context), bringing catalog to 32 curated models.
- **IndexedDB cache backend** — New `useIndexedDBCache` and `cacheBackend` settings for storing large model downloads in IndexedDB instead of Cache API (useful for Chrome extensions with MV3 restrictions).
- **Custom app config** — New `appConfig` setting to pass a custom WebLLM `AppConfig` for advanced model configuration.
- **Engine reload fallback** — Automatically retries via `engine.reload()` when initial load progress doesn't reach completion.

### Fixed

- **Unrecoverable load failure** — If `CreateMLCEngine` rejects (transient WebGPU context loss, network error), the cached `loadPromise` is now cleared so subsequent calls can retry instead of permanently returning the stale rejected promise.
- **AudioPart treated as image** — `convertContentAsync` now explicitly checks `part.type === 'image'` before routing to the image preprocessor. `AudioPart` content (and other future content types) is silently skipped instead of being corrupted into a malformed `image_url`.

### Changed

- Bumped `@mlc-ai/web-llm` from `^0.2.82` to `^0.2.83`.

## [@localmode/wllama@2.1.0] - 2026-05-24

### Added

- **Holo2 vision-language models** — Added `Holo2-4B-Q4_K_M` (2.8 GB, 256K context) and `Holo2-8B-Q4_K_M` (5.1 GB, 256K context) from the Qwen3-VL family with `vision: true`, bringing catalog to 18 curated models.
- **`vision` field on `WllamaModelEntry`** — Marks models that support multimodal (image + text) input.
- **Chrome MV3 extension support** — WASM binary resolution via `chrome.runtime.getURL()` for bundled extensions instead of CDN-only loading.
- **Raw token ID output** — `outputTokenIds` exposed on generation results for cross-modal consumers (e.g., Orpheus TTS SNAC audio tokens).

## [@localmode/devtools@2.0.1] - 2026-05-24

### Fixed

- **Responsive panel width** — Panel width adapts to viewport (`min(600px, calc(100vw - 32px))`) instead of fixed 600px.
- **Scrollable tab bar** — Tabs now scroll horizontally on narrow viewports.
- **TypeScript fix** — Corrected `eventBuffer` type annotation in events collector.


## [Showcase & Docs] - 2026-05-24

### Added

- **PWA support** — Service Worker via Serwist for offline caching, web app manifest for installability, offline fallback page, and app icons (192x192, 512x512).
- **OCR Scanner upgrade** — Now supports 3 models (TrOCR Small, GLM-OCR, LightOnOCR-2) with a model selector and OCR mode picker (text, table, formula).
- **MediaPipe Studio** showcase app — 7-tab studio demonstrating webcam hand/pose/face/gesture tracking, audio classification, and language/text tasks. (Already mentioned in @localmode/mediapipe@2.0.0 entry.)
- **Voice Studio** showcase app — Browse all 29 English Kokoro voices, streaming synthesis with speed control, side-by-side voice comparison. (Already mentioned in Kokoro TTS entry.)
- **84 new blog posts** organized into 6 subcategories: comparisons (13), browser compatibility (10), model guides (19), task tutorials (18), use cases (14), plus additional root-level posts.
- **New documentation pages** — Core: audit-log, live-transcribe, streaming-speech. Chrome AI: language-model. LiteRT: 3 pages. MediaPipe: 8 pages.

### Changed

- **28 showcase apps** received minor fixes, dependency updates, and UI consistency improvements.

## [2.0.0] - 2026-03-25

Major release expanding LocalMode from an embeddings-and-search toolkit into a comprehensive local-first AI platform. Adds 6 new packages, 8 new core domains, 30 new showcase applications, and full documentation coverage.

### Added

#### New Packages

- **`@localmode/react`** — Complete React integration with 34+ hooks (`useEmbed`, `useGenerateText`, `useClassify`, `useChat`, `useAgent`, `usePipeline`, `useSemanticCache`, `useCalibrateThreshold`, and more), operation utilities (`useOperation`, `useOperationList`, `useSequentialBatch`, `useStreaming`), and helpers (`toAppError`, `readFileAsDataUrl`, `validateFile`, `downloadBlob`)
- **`@localmode/wllama`** — GGUF model provider via llama.cpp WASM with access to 160K+ HuggingFace models, GGUF metadata parser, and universal browser support (no WebGPU required)
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
  - **Providers** — `setGlobalProvider()` for global provider configuration
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

