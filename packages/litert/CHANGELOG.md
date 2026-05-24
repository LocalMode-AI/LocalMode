# @localmode/litert

## 2.0.0

### Major Changes

- New package: Google LiteRT-LM provider — wraps `@litert-lm/core@^0.12.1`, the
  first-party JS/WASM bindings for the LiteRT-LM on-device inference engine.
- Implements the `LanguageModel` interface (`doGenerate()` + `doStream()`).
  Runs `.litertlm` models on a WebGPU backend; portable models also run on a
  CPU WASM backend. Text-in / text-out — the LiteRT-LM JS API does not
  currently expose vision or audio input.
- Curated catalog of three models, all verified end-to-end in real Chrome:
  - `gemma-4-E2B` — Gemma 4 E2B (`gemma-4-E2B-it-web.litertlm`, 2.0 GB) — WebGPU only
  - `gemma-4-E4B` — Gemma 4 E4B (`gemma-4-E4B-it-web.litertlm`, 3.0 GB) — WebGPU only
  - `qwen3-0.6B` — Qwen3 0.6B (`Qwen3-0.6B.litertlm`, 614 MB) — WebGPU or CPU
  The Gemma 4 entries use the web-optimized `*-it-web.litertlm` builds Google
  publishes as the models officially supported by the LiteRT-LM JS API. These
  builds are GPU-compiled and cannot run on the CPU backend.
- `requiresWebGPU` catalog flag — Gemma 4 entries are flagged WebGPU-only. The
  provider checks WebGPU availability before downloading such a model and
  throws a clear `ModelLoadError` if WebGPU is unavailable or `backend: 'CPU'`
  is set, instead of failing deep inside the WASM loader.
- Flexible model loading — a curated catalog key, a HuggingFace `repo:file`
  shorthand, or a full URL. Gated Google models (Gemma 3n, Gemma 3 1B,
  FunctionGemma) load via a resolved `modelUrl` after the user accepts the
  Gemma license on HuggingFace.
- Automatic GPU→CPU fallback when a portable model cannot stream-load on the
  GPU backend (skipped for WebGPU-only models).
- Cache management (`isModelCached`, `preloadModel`, `deleteModelCache`,
  `resolveModelUrl`) and a browser-compatibility checker
  (`checkLiteRTBrowserCompat`) are exported.

### Status

- Early preview — `@litert-lm/core` API surface may change.
- Text-only — the LiteRT-LM JS API is text-in / text-out in this preview.
- Gemma 4 E2B/E4B are WebGPU-only; only Qwen3 0.6B runs on the CPU backend.
- `stopSequences` is not supported (LiteRT-LM uses token IDs, not strings).
- Token usage counts are estimated from text length.

### Peer Dependencies

- Requires `@localmode/core@>=2.0.0`
