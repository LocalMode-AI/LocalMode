# @localmode/litert

LiteRT provider for [LocalMode](https://localmode.dev) -- run Google's `.litertlm` models in the browser via WebGPU with a CPU WASM fallback.

[![npm](https://img.shields.io/npm/v/@localmode/litert)](https://www.npmjs.com/package/@localmode/litert)
[![license](https://img.shields.io/npm/l/@localmode/litert)](../../LICENSE)

[![Docs](https://img.shields.io/badge/Docs-LocalMode.dev-red)](https://localmode.dev/docs/litert)
[![Demo](https://img.shields.io/badge/Demo-LocalMode.ai-purple)](https://localmode.ai)

> **Status: early preview.** Wraps Google's [`@litert-lm/core`](https://www.npmjs.com/package/@litert-lm/core) `^0.12.1` -- the first JavaScript release of the LiteRT-LM runtime. The JS API is text-in / text-out. APIs and model availability may change as upstream stabilizes.

## Features

- Curated catalog of three `.litertlm` models, all verified to load and generate end-to-end in real Chrome (WebGPU)
- WebGPU acceleration on Chrome 113+, Edge, and Safari 26+, with an automatic CPU WASM fallback
- Streaming text generation
- Full AbortSignal cancellation support
- Browser-compatibility check before downloading a multi-GB model file

## Installation

```bash
pnpm install @localmode/litert @localmode/core
```

The underlying `@litert-lm/core` package ships two WASM binaries (one WebGPU, one CPU); expect roughly 38 MB unpacked on install.

## Quick Start

```typescript
import { generateText } from '@localmode/core';
import { litert } from '@localmode/litert';

const { text } = await generateText({
  model: litert.languageModel('gemma-4-E2B'),
  prompt: 'What is the capital of France?',
});

console.log(text);
```

## Streaming

```typescript
import { streamText } from '@localmode/core';
import { litert } from '@localmode/litert';

const result = await streamText({
  model: litert.languageModel('gemma-4-E2B'),
  prompt: 'Write a haiku about offline AI.',
});

for await (const chunk of result.stream) {
  process.stdout.write(chunk.text);
}
```

## Model Catalog

`LITERT_MODELS` ships three `.litertlm` models. Gemma 4 E2B and Gemma 4 E4B are
the two models Google officially lists as supported by the LiteRT-LM JS API;
Qwen3 0.6B is a small general model included as a lightweight option. All three
are verified end-to-end in real Chrome.

| ID            | Name        | Size   | Context | License    | Backend            |
| ------------- | ----------- | ------ | ------- | ---------- | ------------------ |
| `gemma-4-E2B` | Gemma 4 E2B | 2.0 GB | 8192    | Gemma      | **WebGPU only**    |
| `gemma-4-E4B` | Gemma 4 E4B | 3.0 GB | 8192    | Gemma      | **WebGPU only**    |
| `qwen3-0.6B`  | Qwen3 0.6B  | 614 MB | 4096    | Apache-2.0 | WebGPU or CPU      |

The Gemma 4 entries use the web-optimized `*-it-web.litertlm` builds -- these are
the files Google publishes specifically for browser WebGPU loading. Their TFLite
sections are GPU-compiled (`gpu_artisan` backend constraint), so **Gemma 4
E2B/E4B require WebGPU and cannot run on the CPU backend**. Qwen3 0.6B is a
portable build that runs on either backend. On a browser without WebGPU, the
provider fails fast for a Gemma 4 model with a clear `ModelLoadError`.

You can inspect the full catalog at runtime:

```typescript
import { LITERT_MODELS, getModelCategory } from '@localmode/litert';

for (const [id, entry] of Object.entries(LITERT_MODELS)) {
  console.log(id, entry.size, getModelCategory(entry.sizeBytes));
}
```

### Loading other `.litertlm` models

Pass a HuggingFace `repo:file` shorthand or a full URL to load any `.litertlm`
file outside the catalog:

```typescript
// HuggingFace shorthand — resolved to the main branch of the given repo
litert.languageModel('litert-community/Qwen3-0.6B:Qwen3-0.6B.litertlm');

// Full URL passthrough
litert.languageModel('https://huggingface.co/.../model.litertlm');
```

Google's gated models (Gemma 3n, Gemma 3 1B, FunctionGemma) require a
HuggingFace login and Gemma-license acceptance, which a browser `fetch()` cannot
perform. Obtain the download URL yourself (e.g. via your backend) and pass it
via `modelUrl`:

```typescript
// modelUrl overrides ID-based URL construction; pass any direct download URL
const model = litert.languageModel('gemma-3n-E2B', {
  modelUrl: 'https://your-backend.example.com/proxy/gemma-3n-E2B.litertlm',
});
```

## Cache Management

Models are cached in the browser after the first download (via the Cache API):

```typescript
import { isModelCached, preloadModel, deleteModelCache } from '@localmode/litert';

if (!(await isModelCached('gemma-4-E2B'))) {
  await preloadModel('gemma-4-E2B', {
    onProgress: (p) => console.log(`${Math.round(p.progress ?? 0)}%`),
  });
}

// Free disk space later
await deleteModelCache('gemma-4-E2B');
```

## Browser Compatibility Check

Check whether the current browser can run LiteRT before downloading a multi-GB model:

```typescript
import { checkLiteRTBrowserCompat } from '@localmode/litert';

const compat = await checkLiteRTBrowserCompat();

if (compat.canRun) {
  console.log('Backend:', compat.backend); // 'GPU' | 'CPU'
  console.log('RAM:', compat.deviceRAMHuman);
} else {
  console.log('Warnings:', compat.warnings);
  console.log('Recommendations:', compat.recommendations);
}
```

## Backend Selection

LiteRT-LM picks its own backend by default -- WebGPU when available. Pass
`backend` to pin one explicitly:

```typescript
litert.languageModel('qwen3-0.6B', { backend: 'GPU' }); // or 'CPU'
```

**Gemma 4 E2B/E4B are WebGPU-only** -- their `.litertlm` builds are GPU-compiled.
The provider checks WebGPU availability before downloading a Gemma 4 model and
throws a clear `ModelLoadError` (rather than failing deep in the WASM loader) if
WebGPU is unavailable or `backend: 'CPU'` is set. Qwen3 0.6B runs on either
backend; if its GPU streaming load is unsupported, the provider retries on CPU
automatically.

## Custom Provider Settings

Use `createLitert()` to create a provider with shared settings that apply to all
models it creates:

```typescript
import { createLitert } from '@localmode/litert';
import { generateText } from '@localmode/core';

const myLitert = createLitert({
  onProgress: (p) => console.log(`Loading: ${p.progress}%`),
  backend: 'GPU',
});

const { text } = await generateText({
  model: myLitert.languageModel('gemma-4-E2B'),
  prompt: 'Hello!',
});
```

## Model Settings

`LiteRTModelSettings` controls per-model defaults passed to `litert.languageModel()` or `createLanguageModel()`:

| Option          | Type                              | Default | Description                                         |
| --------------- | --------------------------------- | ------- | --------------------------------------------------- |
| `onProgress`    | `(p: LiteRTLoadProgress) => void` | —       | Download/load progress callback                     |
| `systemPrompt`  | `string`                          | —       | System prompt prepended to all requests             |
| `temperature`   | `number`                          | `0.7`   | Sampling temperature                                |
| `topP`          | `number`                          | `0.95`  | Top-p (nucleus) sampling                            |
| `maxTokens`     | `number`                          | `512`   | Maximum output tokens                               |
| `contextLength` | `number`                          | `4096`  | Override context window (falls back to catalog)     |
| `modelUrl`      | `string`                          | —       | Direct URL override for the `.litertlm` file        |
| `backend`       | `'GPU' \| 'CPU'`                  | auto    | Pin inference backend; auto-detected when omitted   |

## Unloading a Model

`LiteRTLanguageModel` holds an engine reference in memory once the model loads.
Call `unload()` to free WASM memory when the model is no longer needed:

```typescript
import { LiteRTLanguageModel } from '@localmode/litert';

const model = new LiteRTLanguageModel('qwen3-0.6B');
// ... use model ...
await model.unload();
```

## API Reference

### Exports

| Export                     | Kind      | Description                                                     |
| -------------------------- | --------- | --------------------------------------------------------------- |
| `litert`                   | const     | Default provider instance (no configuration)                    |
| `createLitert`             | function  | Create a provider with shared `LiteRTProviderSettings`          |
| `LiteRTLanguageModel`      | class     | `LanguageModel` implementation; use via provider or directly    |
| `createLanguageModel`      | function  | Functional alias for `new LiteRTLanguageModel(id, settings)`   |
| `isModelCached`            | function  | Check Cache API for a previously downloaded model               |
| `preloadModel`             | function  | Download and cache a model with progress reporting              |
| `deleteModelCache`         | function  | Remove a model from the Cache API                               |
| `resolveModelUrl`          | function  | Resolve a catalog key / HF shorthand / full URL to a fetch URL  |
| `checkLiteRTBrowserCompat` | function  | Inspect WebGPU, WASM, and RAM; returns `LiteRTBrowserCompat`   |
| `fetchModelStream`         | function  | Fetch a `.litertlm` URL as a `ReadableStream` with progress     |
| `isWebGPUDeviceUsable`     | function  | Probe WebGPU device creation (with timeouts for headless envs)  |
| `resetWebGPUUsableCache`   | function  | Clear the cached result of `isWebGPUDeviceUsable`               |
| `LITERT_MODELS`            | const     | Curated model catalog (`Record<LiteRTModelId, LiteRTModelEntry>`) |
| `MODEL_SIZE_THRESHOLDS`    | const     | Byte thresholds for tiny / small / medium / large categories    |
| `getModelCategory`         | function  | Map `sizeBytes` to `'tiny' \| 'small' \| 'medium' \| 'large'` |
| `LiteRTProvider`           | type      | Provider interface (`languageModel()` factory)                  |
| `LiteRTProviderSettings`   | type      | Settings for `createLitert()`                                   |
| `LiteRTModelSettings`      | type      | Per-model settings                                              |
| `LiteRTLoadProgress`       | type      | Progress event shape for download/load callbacks                |
| `LiteRTBrowserCompat`      | type      | Result of `checkLiteRTBrowserCompat()`                          |
| `LiteRTModelId`            | type      | Union of curated catalog keys                                   |
| `LiteRTModelEntry`         | type      | Shape of a catalog entry                                        |

## Choosing a LocalMode LLM Provider

| Provider | When to use |
| --- | --- |
| `@localmode/litert` | First-party Google `.litertlm` runtime for Gemma 4; early preview, text-only |
| `@localmode/webllm` | 32 curated models with mature WebGPU kernels; broadest coverage |
| `@localmode/wllama` | Any of the 160,000+ GGUF models on HuggingFace; runs on WASM without WebGPU |
| `@localmode/transformers` | ONNX models via Transformers.js; widest task coverage beyond text generation |
| `@localmode/chrome-ai` | Zero-download Gemini Nano via Chrome's built-in Prompt API |

## Known Limitations

- **Early preview.** `@litert-lm/core` is pinned at `^0.12.1`, the first published JavaScript release. Expect breaking changes upstream.
- **Text-only (for now).** The Gemma 4 models are multimodal -- their `.litertlm` files ship vision and audio encoders -- but the LiteRT-LM JS API (`@litert-lm/core@0.12.1`) does not yet expose those modalities. Enabling `visionModalityEnabled` / `audioModalityEnabled` throws `Vision/Audio options should not be null`: the JS API has no way to supply the required executor options (verified by direct testing). Multimodal input may arrive in a future `@litert-lm/core` release.
- **Gemma 4 is WebGPU-only.** The `*-it-web.litertlm` Gemma 4 builds are GPU-compiled and cannot run on the CPU backend. Only Qwen3 0.6B runs on CPU. On a non-WebGPU browser, Gemma 4 fails fast with a clear `ModelLoadError`.
- **No `stopSequences`.** The runtime uses token IDs, not user-supplied stop strings; use `maxTokens` or rely on the model's natural EOS.
- **Estimated token usage.** `usage` token counts are estimated from text length -- the runtime does not expose exact tokenizer counts in this release.

### Verified end-to-end (Chrome 145, 2026-05-20)

- **Gemma 4 E2B** (`gemma-4-E2B-it-web.litertlm`, 2.0 GB) -- loads on WebGPU, generates correct output. Fails on the CPU backend (GPU-compiled build).
- **Gemma 4 E4B** (`gemma-4-E4B-it-web.litertlm`, 3.0 GB) -- loads on WebGPU, generates correct output. Same WebGPU-only constraint as E2B.
- **Qwen3 0.6B** (`Qwen3-0.6B.litertlm`, 614 MB) -- loads and generates correct streaming output on **both** the WebGPU and CPU backends.

## Documentation

Full documentation at [localmode.dev/docs/litert](https://localmode.dev/docs/litert).

## Acknowledgments

This package is built on [`@litert-lm/core`](https://www.npmjs.com/package/@litert-lm/core) and the broader [LiteRT-LM](https://ai.google.dev/edge/litert-lm/js) project by Google -- on-device inference for `.litertlm` models via WebGPU and WebAssembly. Catalog models are published by the [`litert-community`](https://huggingface.co/litert-community) organization on HuggingFace.

## License

MIT (this package). The underlying `@litert-lm/core` runtime is licensed under Apache-2.0.
