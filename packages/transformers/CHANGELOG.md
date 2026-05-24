# @localmode/transformers

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
