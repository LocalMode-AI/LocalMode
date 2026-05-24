# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

