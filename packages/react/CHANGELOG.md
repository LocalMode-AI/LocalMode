# @localmode/react

## 2.3.0

### Minor Changes

- `useProviderFallback` now returns `chromeAvailability`, `refreshChromeAvailability`, `requestChromeDownload`, `chromeDownloadProgress`, and `downloadingCapability`. Chrome only starts its one-time, browser-wide model download from a **user activation**, so `requestChromeDownload` must be called from a click handler. A completed download invalidates that capability's cached resolution, so the next resolve promotes the caller from the Transformers.js fallback to Chrome AI.
- Added standalone `probeChromeAvailability` and `downloadChromeModel` exports, plus the `ChromeAIAvailability`, `ChromeCapability`, `ChromeCapabilityParams`, and `ChromeDownloadProgress` types.
- `detectSummarizerProvider` and `detectTranslatorProvider` now take optional capability params and select Chrome AI only when `availability() === 'available'`, matching `detectPromptProvider`. Previously they trusted API presence, which resolved to a model that then threw. Translator availability is probed per language pair.
- **Every `availability()` probe is raced against a 3s deadline** (`CHROME_AVAILABILITY_TIMEOUT_MS`). `Translator.availability()` has been observed never to settle on some Chrome builds; awaiting it on a resolver's critical path left the UI stuck on "Preparing…" indefinitely. A probe that outruns its deadline reports `'unavailable'` and the caller falls back to Transformers.js.
- `probeChromeAvailability` deliberately rethrows a bad-option `TypeError` instead of reporting `'unsupported'` — reporting a caller bug as an unsupported browser hid the `'tl;dr'` defect for as long as it existed.
- `ChromeSummaryStyle` is now `'tldr' | 'key-points' | 'teaser' | 'headline'`. The removed `'tl;dr'` member always threw at runtime, so no working consumer relied on it.
- docs: replace the README "Demo" badge with "UI Components" (localmode.ai) and add a "Blocks & Apps" badge linking to the localmode.ai/blocks gallery

## 2.2.0

### Added

- 8 new hooks (56 → 64), all provider-agnostic by injection or dynamic `import()` — no provider dependency added:
  - `useModelLoad` — provider model-load lifecycle: singleton model creation, normalized 0–1 cross-provider download progress, and a warmup-driven status machine backed by a shared registry.
  - `useEncryptedVault` — passphrase-locked AES-GCM CRUD over a pluggable core `StorageAdapter`; the derived `CryptoKey` is held in memory only. Exposes `status`, `unlock(passphrase)`, `createItem`/`readItem`/`updateItem`/`deleteItem`/`refresh`, and typed `VaultPassphraseError`/`VaultLockedError`.
  - `useProviderFallback` — per-capability Chrome Built-in AI ⇄ Transformers.js resolution, session-cached, with truthful `resolution` provenance for a badge.
  - `usePhotoLibrary` — in-memory CLIP-family photo library where one injected model powers both multimodal embeddings and zero-shot categorization (adaptive ingest, text+image search over one vector space, union-find dedup). Also exports the pure algorithms `rankByEmbedding`/`computeSimilarCounts`/`groupDuplicates`/`duplicateIds`/`selectAllDuplicateIds`.
  - `useKnowledgeBase` — session orchestration over the core `KnowledgeBaseEngine` contract via an injected `createEngine(kind)` factory (raw-document store, chunking config, re-ingest on engine or model switch).
  - `useRerank` — document reranking via core `rerank()`, with hook-level and per-call `topK`. `useObjectUrl` — object URL for a `Blob` with automatic revocation. `useStreamingTracker` (experimental) — lifecycle for real-time video trackers with latest results + fps.
- `useAgent` human-in-the-loop tool approval: returns `pendingApproval` + `approve()`/`deny(reason?)` while the ReAct loop is paused on a `requiresApproval` tool; `deny(reason?)` feeds a denial observation back to the model. Ungated runs never surface a pending approval.
- Re-export `getTextContent` / `normalizeContent` from `@localmode/core`.

### Changed

- `useChat`: per-turn `usage` + cumulative `totalUsage`, lifecycle `status` (`ChatStatus`), `streamingMessageId`, `setMessages()`, and `regenerate()` with reply `variants`/`variantIndex`/`setVariantIndex()`.
- `useEmbedManyImages` now streams via core `streamEmbedManyImages()` with `progress: { completed, total }` and a `batchSize` option — previously a single non-streaming call with no progress.
- `useSequentialBatch` publishes `results` incrementally with index-aligned `itemErrors`; `useBatchOperation` results publish progressively.
- Additive options/returns on existing hooks: `useSemanticSearch` (`filter`/`threshold`, `usage`), `useGenerateText` (`systemPrompt`/`topP`/`stopSequences`, `messages`), `useSynthesizeSpeech` (`voice`/`speed`/`pitch`), `useTranscribe` (`language`/`task`/`returnTimestamps`), `useClassifyZeroShot` (`multiLabel`/`hypothesisTemplate`), `useLiveTranscribe` (`utterances`/`clearUtterances`/`onBargeIn`/`lastBargeIn`), `useTurnTaker` (`turns`/`clearTurns`/`lastBargeIn`), `useStreamSpeech` (`reset`), `usePipeline` (`durationMs`/`stepsCompleted`), `useReindex` (`result`), `useAuditLog` (`lastVerification`), `useSemanticCache` (`clear()`), `useVoiceRecorder` (live `stream`, `getVolume()`), `useCapabilities` (typed `DeviceCapabilities`, `refresh()`), and `useStorageQuota` (full `StorageQuota`).
- `useReindex`/`useCalibrateThreshold`/`useModelRecommendations` now expose `error` as `Error | null` (was `{ message: string } | null`), consistent with every other hook.
- `toAppError()` carries over `LocalModeError.code` and appends `hint` to the message.

### Fixed

- Mid-flight cancellation is now silent for every `useOperation`-based hook even when the wrapped core function turns an abort into a plain `Error` (e.g. `rerank()`/`classify()` "was cancelled") — such cancellations previously surfaced in `error`.
- `cancel()` returns every `useOperation`-based hook to idle immediately. Previously the loading state reset only when the promise settled — and never when a cancelled operation _resolved_, so a non-interruptible in-worker call left the hook stuck loading. Also fixes a supersede race where a superseded call's late abort flipped its in-flight replacement back to idle.
- `useModelLoad`/`useModelStatus` progress is now non-decreasing within a load attempt (high-water clamp, reset per `load()`) — raw Σloaded/Σtotal could dip when a provider discovered additional files mid-download.
- `useModelStatus` de-stubbed: it previously reported `isReady: true` optimistically without observing any load, and now reflects the real lifecycle via the `useModelLoad` registry.
- `useVoiceRecorder` forwards `deviceId`/`constraints` to `getUserMedia` — a selected microphone was previously ignored, and recording now errors when the requested device is unavailable instead of silently falling back.

### Backward Compatibility

- Fully additive release — no exports removed and no breaking changes. New hook fields and options are optional, and `useAgent` tool approval engages only for tools flagged `requiresApproval`, so existing call sites keep working unchanged.

## 2.1.1

### Patch Changes

- `useChat`: `send(text, { providerOptions })` — per-call provider options are forwarded to `streamText()`, so a chat surface can pass provider-specific settings (e.g. `@localmode/wllama` tools, grammar, or `response_format`) on an individual message.

## 2.1.0

### Minor Changes

- 11 new hooks: `useDetectHands`, `useDetectPose`, `useDetectFace`, `useDetectFaceLandmarks`, `useRecognizeGesture`, `useDetectLanguage`, `useAuditLog`, `useLiveTranscribe`, `useTurnTaker`, `useStreamSpeech`, `useExtractText`
- `useExtractText` prompt support for generative OCR
- 10 pipeline step factories with new `semanticChunkStep` (`embedStep`, `embedManyStep`, `chunkStep`, `semanticChunkStep`, `searchStep`, `rerankStep`, `storeStep`, `classifyStep`, `summarizeStep`, `generateStep`)

## 2.0.0

### Major Changes

- New package: 34+ React hooks for all core domains (`useEmbed`, `useGenerateText`, `useClassify`, `useChat`, `useAgent`, `usePipeline`, `useSemanticCache`, `useCalibrateThreshold`, and more)
- Operation utilities: `useOperation`, `useOperationList`, `useSequentialBatch`, `useStreaming`
- Helpers: `toAppError`, `readFileAsDataUrl`, `validateFile`, `downloadBlob`
- Utility hooks: `useModelLoader`, `useModelRecommendations`, `useInferenceQueue`, `useCapabilities`, `useNetworkStatus`, `useStorageQuota`, `useVoiceRecorder`

### Patch Changes

- Updated dependencies
  - @localmode/core@2.0.0
