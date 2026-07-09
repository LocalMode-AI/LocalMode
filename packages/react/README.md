# @localmode/react

[![npm](https://img.shields.io/npm/v/@localmode/react)](https://www.npmjs.com/package/@localmode/react)
[![license](https://img.shields.io/npm/l/@localmode/react)](../../LICENSE)

[![Docs](https://img.shields.io/badge/Docs-LocalMode.dev-red)](https://localmode.dev/docs/react)
[![UI Components](https://img.shields.io/badge/UI_Components-LocalMode.ai-green)](https://localmode.ai)
[![Blocks & Apps](https://img.shields.io/badge/Blocks_&_Apps-LocalMode.ai-purple)](https://localmode.ai/blocks)

64 React hooks for local-first AI. Embed, chat, classify, transcribe, and more — with built-in loading states, error handling, and cancellation.

## Installation

```bash
pnpm install @localmode/react @localmode/core
```

## Quick Start

```tsx
import { useChat } from '@localmode/react';
import { webllm } from '@localmode/webllm';

const model = webllm.languageModel('Llama-3.2-1B-Instruct-q4f16_1-MLC');

function Chat() {
  const { messages, isStreaming, send, cancel } = useChat({ model });

  return (
    <div>
      {messages.map((m) => (
        <div key={m.id}><b>{m.role}:</b> {m.content}</div>
      ))}
      <button onClick={() => send('What is LocalMode?')}>Send</button>
      {isStreaming && <button onClick={cancel}>Stop</button>}
    </div>
  );
}
```

## Domain Hooks

| Hook | Domain | Wraps |
|------|--------|-------|
| `useEmbed` | Embeddings | `embed()` |
| `useEmbedMany` | Embeddings | `embedMany()` |
| `useSemanticSearch` | Embeddings | `semanticSearch()` |
| `useEmbedImage` | Multimodal | `embedImage()` — CLIP cross-modal |
| `useEmbedManyImages` | Multimodal | `streamEmbedManyImages()` — batch image embedding with progress |
| `useChat` | Generation | `streamText()` with message state, vision images, usage tracking (`usage`/`totalUsage`), lifecycle `status`, and `regenerate()` reply variants |
| `useGenerateText` | Generation | `generateText()` |
| `useGenerateObject` | Generation | `generateObject()` — typed JSON output |
| `useClassify` | Classification | `classify()` |
| `useClassifyZeroShot` | Classification | `classifyZeroShot()` |
| `useExtractEntities` | NER | `extractEntities()` |
| `useRerank` | Classification | `rerank()` — reorder documents by relevance to a query, with hook-level/per-call `topK` |
| `useTranscribe` | Audio | `transcribe()` |
| `useSynthesizeSpeech` | Audio | `synthesizeSpeech()` |
| `useStreamSpeech` | Audio | `streamSynthesizeSpeech()` — clause-by-clause streaming TTS |
| `useCaptionImage` | Vision | `captionImage()` |
| `useDetectObjects` | Vision | `detectObjects()` |
| `useClassifyImage` | Vision | `classifyImage()` |
| `useClassifyImageZeroShot` | Vision | `classifyImageZeroShot()` |
| `useSegmentImage` | Vision | `segmentImage()` |
| `useExtractImageFeatures` | Vision | `extractImageFeatures()` |
| `useImageToImage` | Vision | `imageToImage()` |
| `useDetectHands` | Vision | `detectHands()` |
| `useDetectPose` | Vision | `detectPose()` |
| `useDetectFace` | Vision | `detectFace()` |
| `useDetectFaceLandmarks` | Vision | `detectFaceLandmarks()` |
| `useRecognizeGesture` | Vision | `recognizeGesture()` |
| `useDetectLanguage` | Text | `detectLanguage()` |
| `useTranslate` | Text | `translate()` |
| `useSummarize` | Text | `summarize()` |
| `useExtractText` | OCR | `extractText()` |
| `useFillMask` | NLP | `fillMask()` |
| `useAnswerQuestion` | QA | `answerQuestion()` |
| `useAskDocument` | Document QA | `askDocument()` |
| `useAgent` | Agents | `createAgent()` + `runAgent()` — ReAct loop with tools; human-in-the-loop approval for `requiresApproval` tools via `pendingApproval` + `approve()`/`deny(reason?)` |
| `useImportExport` | Import/Export | `importFrom()`, `exportToCSV()`, `exportToJSONL()` |
| `useEvaluateModel` | Evaluation | `evaluateModel()` — run metrics against a dataset |
| `useSemanticChunk` | RAG | `semanticChunk()` — embedding-aware topic-boundary chunking |
| `useCalibrateThreshold` | Embeddings | `calibrateThreshold()` — empirical similarity threshold |
| `useAuditLog` | Security | `createAuditLog()` — tamper-evident hash-chained log |
| `useEncryptedVault` | Security | `deriveEncryptionKey()` + AES-GCM envelopes over a pluggable `StorageAdapter` — passphrase-locked encrypted CRUD vault |
| `useLiveTranscribe` | Audio | `createLiveTranscriber()` — streaming mic STT with VAD |
| `useTurnTaker` | Audio | `createTurnTaker()` — full voice loop orchestrator |
| `useStreamingTracker` | Vision | provider streaming trackers (e.g. `mediapipe.createHandTracker()`) — real-time video tracking with latest results + fps (experimental) |
| `useProviderFallback` | Generation | per-capability Chrome Built-in AI ⇄ Transformers.js resolution (`resolveSummarizer`/`resolveTranslator`/`resolveEditEngine`/`resolveFillMask`) — providers loaded via dynamic `import()` (no hard provider dep), session-cached, with truthful `resolution` provenance for a badge. Chrome AI is selected only when `availability() === 'available'`; `chromeAvailability`/`refreshChromeAvailability`/`requestChromeDownload`/`chromeDownloadProgress`/`downloadingCapability` drive a download gate, since Chrome needs a user activation (a click) to fetch its one-time, browser-wide model |
| `usePhotoLibrary` | Multimodal | shared in-memory CLIP-family photo library — one injected model powers both multimodal embeddings and zero-shot categorization; progressive/adaptive/cancellable ingest, text+image search over one vector space, union-find dedup, confirmed model-switch re-index |
| `useKnowledgeBase` | RAG | knowledge-base session orchestration over the core `KnowledgeBaseEngine` contract — raw-document store, `useModelLoad` lifecycle, chunking config, and re-ingest on engine-kind toggle OR embedding-model switch via an injected `createEngine(kind)` factory (langchain path optional/dynamic at the block layer) |

## Utility Hooks

| Hook | Purpose |
|------|---------|
| `useModelLoad` | Provider model load lifecycle — singleton model creation, normalized cross-provider download progress (0–1), warmup-driven status |
| `useModelStatus` | Real model readiness (isReady/isLoading/progress/error) from the `useModelLoad` registry |
| `useCapabilities` | Detect browser AI capabilities (typed `DeviceCapabilities`, with `refresh()`) |
| `useNetworkStatus` | Online/offline status |
| `useStorageQuota` | Storage quota monitoring (full `StorageQuota` incl. `isPersisted`/`availableBytes`) |
| `useVoiceRecorder` | MediaRecorder lifecycle with mic selection (`deviceId`/`constraints`), live `stream`, and `getVolume()` |
| `useInferenceQueue` | Priority-based task scheduling with live stats |
| `useSemanticCache` | Semantic cache lifecycle (create/destroy, stats) |
| `useReindex` | Embedding drift re-embedding with progress and cancellation |
| `useModelRecommendations` | Ranked model recommendations by device capabilities |
| `useModelLoader` | Chunked model download with LRU eviction and cross-tab coordination |
| `useAdaptiveBatchSize` | Device-aware optimal batch size for embeddings/inference |

## Batch & List Processing

| Hook | Purpose |
|------|---------|
| `useBatchOperation` | Concurrent batch with progress |
| `useOperationList` | Accumulate results into a list with item removal |
| `useSequentialBatch` | Sequential processing with progress |
| `usePipeline` | Multi-step workflows with progress |

## Helper Utilities

| Utility | Purpose |
|---------|---------|
| `readFileAsDataUrl(file)` | Read a File as a data URL string |
| `validateFile({ file, accept, maxSize })` | Validate file type/size, returns `AppError \| null` |
| `downloadBlob(content, filename, mimeType?)` | Trigger file download from in-memory content |
| `toAppError(error, recoverable?)` | Convert `Error` to `AppError` shape (carries over LocalModeError `code`, appends `hint` to the message) |
| `useObjectUrl(blob)` | Hook: object URL for a `Blob` with automatic revocation on change/unmount |

## Encrypted Vault

`useEncryptedVault` provides a passphrase-locked, encrypted item store persisted through any core `StorageAdapter` (default: a dedicated `IndexedDBStorage`). `status` is `'uninitialized' | 'locked' | 'unlocked'`; a single `unlock(passphrase)` initializes the vault on first use and verifies the passphrase afterwards (wrong passphrase → typed `VaultPassphraseError`, detected via an encrypted verifier — works even on an empty vault). While unlocked, `createItem`/`readItem`/`updateItem`/`deleteItem`/`refresh` round-trip AES-GCM envelopes; while locked they resolve `null`/`false` with a `VaultLockedError` and never touch storage.

```tsx
import { useEncryptedVault } from '@localmode/react';

function Notes() {
  const { status, items, error, unlock, lock, createItem, deleteItem } =
    useEncryptedVault<{ note: string }>({ name: 'notes' });

  if (status !== 'unlocked') {
    return (
      <button onClick={() => unlock(prompt('Passphrase') ?? '')}>
        {status === 'uninitialized' ? 'Create vault' : 'Unlock'}
      </button>
    );
  }
  return (
    <div>
      {items.map((i) => (
        <div key={i.id}>
          {i.data.note} <button onClick={() => deleteItem(i.id)}>x</button>
        </div>
      ))}
      <button onClick={() => createItem({ note: 'hello' })}>Add</button>
      <button onClick={lock}>Lock</button>
      {error?.name === 'VaultPassphraseError' && <p>Wrong passphrase</p>}
    </div>
  );
}
```

**Security notes:** the key is derived once per unlock via core `deriveEncryptionKey` (PBKDF2, configurable `iterations`) and the non-extractable `CryptoKey` is held **in memory only** — the passphrase is never retained, and nothing derived from it is persisted except a random salt and the AES-GCM verifier ciphertext. `lock()` and unmount clear the key and all decrypted state. At rest, everything except item ids and timestamps is ciphertext (fresh 12-byte IV per write, versioned envelopes).

## Features

- **47 domain hooks** — One for each AI capability in @localmode/core (including reranking, agents, import/export, evaluation, semantic chunking, threshold calibration, MediaPipe landmarks/gestures, real-time video tracking, language detection, audit log, encrypted vault, live transcription, streaming speech, provider fallback, shared photo library, knowledge-base orchestration)
- **12 utility hooks** — Model load lifecycle, model status, capabilities, network, storage, voice recording, inference queue, semantic cache, reindex, model recommendations, model loader, adaptive batch size
- **4 batch/pipeline hooks** — List accumulation, concurrent batch, sequential batch, pipeline (batch hooks publish results incrementally as items complete)
- **10 pipeline step factories** — embedStep, chunkStep, semanticChunkStep, searchStep, rerankStep, storeStep, classifyStep, summarizeStep, generateStep, embedManyStep
- **5 helper utilities** — File reading, validation, download, error conversion, object URLs (`useObjectUrl`)
- **Zero dependencies** — only peer deps on `react` and `@localmode/core`
- **Streaming** — `useChat` with real-time message updates, IndexedDB persistence, per-turn + cumulative usage, lifecycle `status`, and `regenerate()` reply variants
- **Cancellation** — every inference hook supports AbortSignal-based cancellation (provider model loads in `useModelLoad` are not abortable)
- **SSR-safe** — no-op during server rendering for Next.js compatibility
- **Provider-agnostic** — works with any @localmode provider

## Documentation

[localmode.dev/docs/react](https://localmode.dev/docs/react)

## License

MIT
