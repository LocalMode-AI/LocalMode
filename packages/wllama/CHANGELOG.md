# @localmode/wllama

## 3.0.0

### Major Changes

- **Upgraded to wllama v3** (`@wllama/wllama@^3.2.3`) — complete rewrite from v2's custom API to v3's OAI-compatible API (`createChatCompletion`, `createCompletion`, `createEmbedding`). The public `@localmode/wllama` API remains backward-compatible.

### Added

- **True streaming** — `doStream()` uses `createChatCompletion({ stream: true })` for real token-by-token streaming. Each token is yielded as it arrives from the WASM backend. Falls back to non-streaming `doGenerate()` for prompt-only input.
- **Structured output / JSON mode** — `response_format` supported via `providerOptions.wllama.response_format`. Three modes: `{ type: "text" }` (default), `{ type: "json_object" }` (free-form JSON), and `{ type: "json_schema", json_schema: { name, schema, strict } }` (schema-constrained output). Exported as `WllamaResponseFormat` type.
- **Reranking** — New `WllamaRerankerModel` class implementing `RerankerModel` from `@localmode/core`. Uses wllama v3's `createRerank()` API for cross-encoder relevance scoring. Factory method `wllama.reranker(modelId)` on the provider. New exports: `WllamaRerankerModel`, `createRerankerModel`, `WllamaRerankerSettings`.
- **Embedding models** — New `WllamaEmbeddingModel` class implementing `EmbeddingModel` from `@localmode/core`. Factory method `wllama.embedding(modelId)` on the provider. 3 curated GGUF embedding models: `nomic-embed-text-v1.5-Q4_K_M` (768d, 78MB), `mxbai-embed-large-v1-Q4_K_M` (1024d, 197MB), `bge-small-en-v1.5-Q8_0` (384d, 35MB). Dimensions auto-detected from GGUF metadata.
- **Reasoning mode** — `reasoning`, `reasoningFormat` (`'none' | 'deepseek-legacy' | 'deepseek'`), and `reasoningBudgetTokens` settings on `WllamaModelSettings` for DeepSeek-R1 style chain-of-thought thinking. Streaming surfaces `reasoning_content` chunks.
- **Performance config** — KV cache quantization via `cacheTypeK` / `cacheTypeV` (supports `f32`, `f16`, `q8_0`, `q5_1`, `q5_0`, `q4_1`, `q4_0`) for reduced memory on long contexts. `flashAttention` for faster inference. Speculative decoding via `specDraftModel`, `specDraftNgl`, `specDraftNMin`, `specDraftNMax`, `specDraftPMin` for 2-3x speedup with a draft model.
- **Grammar sampling** — GBNF grammar constraint via `providerOptions.wllama.grammar` for structured text output beyond JSON mode.
- **WebGPU acceleration** — `useWebGPU: boolean | 'auto'` and `nGpuLayers: number` settings on both `WllamaModelSettings` and `WllamaEmbeddingSettings`. Offloads transformer layers to GPU when WebGPU is available; falls back to WASM silently. `gpuAccelerated` readonly property on `WllamaLanguageModel`.
- **Tool calling** — Forward `tools` and `tool_choice` via `providerOptions.wllama` to v3's OAI-compatible `createChatCompletion()`. Tool call results returned as `toolCalls` array on the generation result.
- **Vision / multimodal input** — `mmprojUrl` setting loads a vision projection GGUF alongside the main model. `supportsVision` readonly property auto-detected from settings or catalog. Base64 `ImagePart` content converted to `ArrayBuffer` for v3's vision API; non-vision models silently drop image parts.
- **Jinja chat templates** — Enabled by default (`useJinja: true`). v3's Jinja engine handles chat formatting via `createChatCompletion()`. Opt-out with `useJinja: false`.
- **Model management** — `listCachedModels()` returns all cached GGUF models with name and size. `clearAllModelCache()` wipes the entire OPFS cache directory. `refreshModel()` re-downloads a model (deletes cache then preloads).
- **LoRA adapters** — `loraAdapters` setting accepts an array of `{ path, scale? }` for loading fine-tuned adapters alongside the base model. `loraInitWithoutApply` for manual LoRA control.
- **Extended sampling parameters** — `min_p`, `seed`, `penalty_freq`, `penalty_present`, `typ_p`, dynamic temperature (`dynatemp_range`, `dynatemp_exponent`), `logit_bias`, `samplers_sequence`, `n_probs` — all passable via `providerOptions.wllama`.
- **Audio input (experimental)** — `AudioPart` content parts are now handled (base64 to ArrayBuffer conversion), same pipeline as image parts.
- **Single WASM binary** — v3 unified single-thread and multi-thread into one binary. Constructor takes `{ default: url }` instead of dual paths. CDN URL: `@wllama/wllama@3.2.3/src/wasm/wllama.wasm`.
- **Gemma 4 GGUF models** — `Gemma-4-E2B-IT-Q4_K_M` (3.46GB, 131K context, 5.1B params / 2.3B effective PLE) and `Gemma-4-E4B-IT-Q4_K_M` (5.41GB, 131K context, 8B params / ~4B effective PLE). Vision + tool calling. Uses bartowski for main GGUF, ggml-org Q8_0 for mmproj vision projector files.
- **Qwen3** — `Qwen3-0.6B-Q4_K_M` (530MB, 40K context), `Qwen3-1.7B-Q4_K_M` (1.2GB, 40K context), `Qwen3-4B-Q4_K_M` (2.7GB, 40K context). Hybrid thinking, multilingual, tool calling.
- **DeepSeek R1 Distill** — `DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M` (1.1GB, 128K context), `DeepSeek-R1-Distill-Qwen-7B-Q4_K_M` (4.7GB, 128K context). Reasoning/thinking models with `supportsReasoning: true`.
- **Reranker models** — `jina-reranker-v2-base-multilingual-Q4_K_M` (163MB, multilingual), `bge-reranker-v2-m3-Q4_K_M` (218MB, long context). Cross-encoder reranking for search.
- New exports: `WllamaEmbeddingModel`, `WllamaEmbeddingSettings`, `WllamaRerankerModel`, `createRerankerModel`, `WllamaRerankerSettings`, `WllamaResponseFormat`, `listCachedModels`, `clearAllModelCache`, `refreshModel`
- New `WllamaModelEntry` fields: `supportsToolCalling`, `isEmbeddingModel`, `dimensions`, `mmprojUrl`, `nGpuLayers`, `isRerankerModel`, `supportsReasoning`
- Model catalog expanded from 18 to 30 models (25 language + 3 embedding + 2 reranker)

### Changed

- `doGenerate()` uses `createChatCompletion()` for message-based input (with Jinja templates) and `createCompletion()` for prompt-only input
- `doStream()` rewritten to use `createChatCompletion({ stream: true })` with real `AsyncIterable` token streaming
- `buildOAIMessages()` extracted as shared helper used by both `doGenerate()` and `doStream()`
- `buildSamplingParams()` extended with all new sampling parameters
- Token usage extracted from OAI response `usage` field instead of manual `tokenize()` counting
- Finish reason mapped from OAI `finish_reason` (`stop`, `length`, `tool_calls`)
- Chrome extension WASM path simplified to single `wllama-wasm/wllama.wasm`

### Removed

- `outputTokenIds` runtime extension — v3's OAI API does not expose per-token IDs
- Internal methods: `resolveStopTokens()`, `buildSamplingConfig()` (replaced by per-request OAI params)
- v2 API usage: `tokenize()`, `samplingInit()`, `lookupToken()` — all removed in `@wllama/wllama@3`

## 2.1.0

### Minor Changes

- Added Holo2 vision-language models — `Holo2-4B-Q4_K_M` (2.8 GB, 256K context) and `Holo2-8B-Q4_K_M` (5.1 GB, 256K context) from the Qwen3-VL family with `vision: true`, bringing catalog to 18 curated models
- Added `vision` field on `WllamaModelEntry` to mark models that support multimodal (image + text) input
- Chrome MV3 extension support: WASM binaries resolve via `chrome.runtime.getURL()` when running inside a bundled extension, avoiding CDN fetch restrictions
- Generation results expose `outputTokenIds: number[]` for cross-modal consumers (e.g., Orpheus TTS audio token extraction)

## 2.0.0

### Major Changes

- New package: GGUF model provider via llama.cpp compiled to WASM
- Access to 160K+ HuggingFace GGUF models with universal browser support (no WebGPU required)
- GGUF metadata parser for model introspection
- 16 curated default models with browser compatibility layer

### Patch Changes

- Updated dependencies
  - @localmode/core@2.0.0
