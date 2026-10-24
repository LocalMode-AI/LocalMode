# @localmode/litert

## 2.0.4

### Patch Changes

- feat: `thoughtChannel: 'drop' | 'inline'` on `languageModel()` settings (default `'drop'`, the behavior so far). `@litert-lm/core` 0.18 and later stream the reasoning of some models on a message's `channels.thought`; `'inline'` also yields that text, wrapped in one `<think>` ... `</think>` block (closed when the content starts or the stream ends), the form in which earlier releases delivered the same reasoning inside the content.
- fix: the streamed content parts are typed for `@litert-lm/core` 0.18, whose `Message.content` is a union of text, image and audio parts; only text parts are yielded, as before.

## 2.0.3

### Patch Changes

- fix: the catalog URLs are pinned to a repository revision instead of `resolve/main`. `litert-community/Qwen3-0.6B` replaced `Qwen3-0.6B.litertlm` on 2026-10-12 and 2026-10-13 with builds made for litert-lm 0.18.0, whose chat template renders an empty user turn on `@litert-lm/core` 0.12.1 and answers on the thought channel; `qwen3-0.6B` is pinned to a3c5d805 (the 614,236,160-byte file the catalog always declared), `gemma-4-E2B` to 73d35ec3 and `gemma-4-E4B` to 4f479a5f. `LiteRTModelEntry.sha256` (new, optional) records each file's LFS sha256. Each browser downloads the pinned file once (the Cache API key is the URL).
- feat: `LiteRTLanguageModel.loadInfo` (type `LiteRTLoadInfo`): `requestedBackend`, `backend` after the automatic CPU retry, `gpuFallback`, `modelUrl` and `modelBytes` (the bytes the engine read); `null` before the first generation and after `unload()`.

## 2.0.2

### Patch Changes

- docs: replace the README "Demo" badge with "UI Components" (localmode.ai) and add a "Blocks & Apps" badge linking to the localmode.ai/blocks gallery

## 2.0.1

### Fixed

- `doGenerate()` no longer freezes the browser tab for the whole generation. LiteRT-LM's non-streaming `sendMessage()` runs the entire prefill+decode in one synchronous WASM call, which locks the main thread for tens of seconds without cross-origin isolation (no React commits, no input handling). `doGenerate()` now drains `sendMessageStreaming()` and accumulates the chunks — identical results, per-token main-thread yields.
- CPU-capable models no longer fail to load in WebGPU-less browsers. LiteRT-LM's default backend selects GPU whenever `navigator.gpu` merely exists, so adapterless/headless browsers ("No available adapters") failed even CPU-capable models like `qwen3-0.6B`. The provider now probes actual device usability and pins the CPU backend when WebGPU cannot deliver a device.

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
