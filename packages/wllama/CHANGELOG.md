# @localmode/wllama

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
