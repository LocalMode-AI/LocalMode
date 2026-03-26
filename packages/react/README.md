# @localmode/react

[![npm](https://img.shields.io/npm/v/@localmode/react)](https://www.npmjs.com/package/@localmode/react)
[![license](https://img.shields.io/npm/l/@localmode/react)](../../LICENSE)

[![Docs](https://img.shields.io/badge/Docs-LocalMode.dev-red)](https://localmode.dev/docs/react)
[![Demo](https://img.shields.io/badge/Demo-LocalMode.ai-purple)](https://localmode.ai)

React hooks for local-first AI. Embed, chat, classify, transcribe, and more — with built-in loading states, error handling, and cancellation.

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
| `useEmbedManyImages` | Multimodal | `embedManyImages()` — batch image embedding |
| `useChat` | Generation | `streamText()` with message state, vision image support |
| `useGenerateText` | Generation | `generateText()` |
| `useGenerateObject` | Generation | `generateObject()` — typed JSON output |
| `useClassify` | Classification | `classify()` |
| `useClassifyZeroShot` | Classification | `classifyZeroShot()` |
| `useExtractEntities` | NER | `extractEntities()` |
| `useTranscribe` | Audio | `transcribe()` |
| `useSynthesizeSpeech` | Audio | `synthesizeSpeech()` |
| `useCaptionImage` | Vision | `captionImage()` |
| `useDetectObjects` | Vision | `detectObjects()` |
| `useClassifyImage` | Vision | `classifyImage()` |
| `useClassifyImageZeroShot` | Vision | `classifyImageZeroShot()` |
| `useSegmentImage` | Vision | `segmentImage()` |
| `useExtractImageFeatures` | Vision | `extractImageFeatures()` |
| `useImageToImage` | Vision | `imageToImage()` |
| `useTranslate` | Text | `translate()` |
| `useSummarize` | Text | `summarize()` |
| `useExtractText` | OCR | `extractText()` |
| `useFillMask` | NLP | `fillMask()` |
| `useAnswerQuestion` | QA | `answerQuestion()` |
| `useAskDocument` | Document QA | `askDocument()` |
| `useAgent` | Agents | `createAgent()` + `runAgent()` — ReAct loop with tools |
| `useImportExport` | Import/Export | `importFrom()`, `exportToCSV()`, `exportToJSONL()` |
| `useEvaluateModel` | Evaluation | `evaluateModel()` — run metrics against a dataset |
| `useSemanticChunk` | RAG | `semanticChunk()` — embedding-aware topic-boundary chunking |
| `useCalibrateThreshold` | Embeddings | `calibrateThreshold()` — empirical similarity threshold |

## Utility Hooks

| Hook | Purpose |
|------|---------|
| `useModelStatus` | Track model readiness |
| `useCapabilities` | Detect browser AI capabilities |
| `useNetworkStatus` | Online/offline status |
| `useStorageQuota` | Storage quota monitoring |
| `useVoiceRecorder` | MediaRecorder lifecycle (start/stop recording) |
| `useInferenceQueue` | Priority-based task scheduling with live stats |
| `useSemanticCache` | Semantic cache lifecycle (create/destroy, stats) |
| `useReindex` | Embedding drift re-embedding with progress and cancellation |
| `useModelRecommendations` | Ranked model recommendations by device capabilities |
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
| `toAppError(error, recoverable?)` | Convert `Error` to `AppError` shape |

## Features

- **35 domain hooks** — One for each AI capability in @localmode/core (including agents, import/export, evaluation, semantic chunking, threshold calibration)
- **10 utility hooks** — Model status, capabilities, network, storage, voice recording, inference queue, semantic cache, reindex, model recommendations, adaptive batch size
- **4 batch/pipeline hooks** — List accumulation, concurrent batch, sequential batch, pipeline
- **9 pipeline step factories** — embedStep, chunkStep, searchStep, rerankStep, storeStep, classifyStep, summarizeStep, generateStep, embedManyStep
- **4 helper utilities** — File reading, validation, download, error conversion
- **Zero dependencies** — only peer deps on `react` and `@localmode/core`
- **Streaming** — `useChat` with real-time message updates and IndexedDB persistence
- **Cancellation** — every hook supports AbortSignal-based cancellation
- **SSR-safe** — no-op during server rendering for Next.js compatibility
- **Provider-agnostic** — works with any @localmode provider

## Documentation

[localmode.dev/docs/react](https://localmode.dev/docs/react)

## License

MIT
