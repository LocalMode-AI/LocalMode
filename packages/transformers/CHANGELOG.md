# @localmode/transformers

## 4.1.1

### Patch Changes

- docs: replace the README "Demo" badge with "UI Components" (localmode.ai) and add a "Blocks & Apps" badge linking to the localmode.ai/blocks gallery

## 4.1.0

### Added

- **Resilient model-file cache (default on).** Installs a custom Transformers.js cache (`env.useCustomCache` + `env.customCache`) over the same browser Cache API storage the provider already uses (`transformers-cache`, honoring `env.cacheKey`, so previously cached models keep hitting) whose write path can never fail a model load: a failed write serves the fetched network response, warns once per URL per session, and retries next load — killing the intermittent `NetworkError: Cache.add() encountered a network error` failure class. Installed idempotently; no-ops when `caches` is undefined (Node/SSR keeps the stock `FileCache`) and never overwrites a user-supplied `env.customCache`. Opt out with `createTransformers({ resilientCache: false })`. New exports: `createResilientModelCache`, `installResilientModelCache`, `setResilientModelCacheEnabled`, and the `TransformersProviderSettings.resilientCache` setting (default `true`).

### Changed

- `ModelLoadProgress.status` JSDoc now documents that `'progress_total'` is never emitted — Transformers.js only reports `initiate`/`download`/`progress`/`done`/`ready`; the value stays in the union for backward type compatibility only.

### Fixed

- Cross-encoder reranking produced no ranking signal. `doRerank` fed `pipe([query, doc])` to the text-classification pipeline, which scores the two texts independently — the document never influenced the score, and single-logit models (e.g. `Xenova/ms-marco-MiniLM-L-6-v2`) collapsed to a constant `0`. Reranking now encodes real (query, document) pairs via `AutoTokenizer` (`text_pair`) + `AutoModelForSequenceClassification`, applying sigmoid to single-logit heads and softmax to multi-class heads, and observes `abortSignal` between batches.
- Vision-language and generative-OCR models (Qwen3.5/Qwen-VL/Gemma 4, GLM-OCR, LightOnOCR-2) failed to load on the WASM device with `Could not find an implementation for GatherBlockQuantized` — the hardcoded q4/fp16 default dtype uses ops onnxruntime-web only implements on the WebGPU EP. The default is now device-aware: WebGPU keeps the q4/fp16 mix; WASM uses fp32 `embed_tokens` + `vision_encoder` with the q4 decoder. An explicit `settings.dtype` still overrides.
- English-only Whisper checkpoints (e.g. `whisper-tiny.en`) no longer fail every transcription with "Cannot specify `task` or `language` for an English-only model." The `language: 'en'` / `task: 'transcribe'` defaults now apply only to multilingual checkpoints; English-only models drop redundant values and pass anything else through.

## 4.0.0

### Breaking Changes

- Migrated from `@huggingface/transformers@^3.8.1` to `@huggingface/transformers@^4.2.0`
- Removed the `@huggingface/transformers-v4` npm alias
- Removed `TransformersV4EmbeddingModel` and `createV4EmbeddingModel` exports

### Changes

- All implementations now use unified `@huggingface/transformers` import
- Explicit `dtype: 'fp32'` default across all pipeline-based implementations
- Removed "Experimental" labels from language model and vision features
- Deleted `embedding-v4.ts` benchmark file
- Cleaned up `utils.ts` conditional v3/v4 import branching
- Kokoro model registry entry updated: 29 English voices, phonemizer-backed, speed control

### New Features

- **Kokoro TTS** — `TransformersTextToSpeechModel` now routes Kokoro model IDs to a dedicated `kokoro-tts.ts` implementation using `StyleTextToSpeech2Model` and the `phonemizer` package (eSpeak-NG WASM) for text-to-phoneme conversion. Exports `KOKORO_VOICES` (29 English voices), `KOKORO_DEFAULT_VOICE`, `KOKORO_LANG_MAP`, and the `KokoroVoice` type. Supports `speed` parameter (0.5–2.0) and `providerOptions.kokoro.dtype` for quantization control (q8/fp16/fp32/q4/q4f16). New `phonemizer` runtime dependency.
- **Silero VAD** — New `TransformersSileroVAD` class and `createSileroVAD` factory implement the core `VADProvider` interface using the `onnx-community/silero-vad` model via `AutoModel`. Also exports `SileroVADSettings` type and adds `VAD_MODELS` to the model catalog.
- **Generative OCR** — New `TransformersGenerativeOCRModel` class and `createGenerativeOCRModel` factory implement `OCRModel` using `AutoModelForImageTextToText` for document-level OCR (GLM-OCR, LightOnOCR-2). Also exports `isGenerativeOCRModel`, `isGlmOcrModel`, and `isLightOnOCRModel` helpers. `OCR_MODELS` catalog updated with `GLM_OCR` and `LIGHTONOCR_2_1B` entries.
- **Gemma 4 ONNX models** — Added Gemma 4 E2B and E4B to the LLM catalog (16 total). Vision-capable, bringing total to 5 vision-capable ONNX models.
- **`vad()` factory method** — `transformers.vad(modelId)` creates a `VADProvider` for use with `createLiveTranscriber()`.

### Fixed

- `loadImageTextToText` (GLM-OCR, LightOnOCR-2) now loads an `AutoTokenizer` alongside the processor, fixing a `TypeError` with text-only prompts
- Kokoro TTS `kokoroLoadPromise` is now cleared on load failure, allowing retry after transient network errors

## 2.0.0

### Major Changes

- Language model implementation with 14 curated ONNX text generation models via Transformers.js v4 (including 3 vision-capable models)
- CLIP multimodal embedding implementation for cross-modal image+text search
- Audio classifier implementation
- Depth estimator implementation
- npm alias `@huggingface/transformers-v4` for v3/v4 coexistence

### Patch Changes

- Updated dependencies
  - @localmode/core@2.0.0

## 1.0.2

### Patch Changes

- bump to v1.0.2
- Updated dependencies
  - @localmode/core@1.0.2

## 1.0.1

### Patch Changes

- d311bd7: update package metadata and readme files
- Updated dependencies [d311bd7]
  - @localmode/core@1.0.1
