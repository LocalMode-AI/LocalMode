# @localmode/wllama

wllama provider for [LocalMode](https://localmode.dev) -- run any GGUF model in the browser via llama.cpp compiled to WebAssembly.

[![npm](https://img.shields.io/npm/v/@localmode/wllama)](https://www.npmjs.com/package/@localmode/wllama)
[![license](https://img.shields.io/npm/l/@localmode/wllama)](../../LICENSE)

[![Docs](https://img.shields.io/badge/Docs-LocalMode.dev-red)](https://localmode.dev/docs/wllama)
[![Demo](https://img.shields.io/badge/Demo-LocalMode.ai-purple)](https://localmode.ai)

## Features

- Run any of the 160,000+ GGUF models from HuggingFace
- Works in all modern browsers (no WebGPU required, only WASM)
- 18 curated models including 2 vision-language models (Holo2 4B/8B)
- GGUF metadata inspection via HTTP Range requests (~4KB download)
- Browser compatibility checking before downloading multi-GB files
- Auto-detects CORS isolation for multi-threaded inference
- Chrome MV3 extension support (auto-resolves bundled WASM binaries)
- Streaming text generation with raw `outputTokenIds` access
- Full AbortSignal cancellation support

## Installation

```bash
pnpm install @localmode/wllama @localmode/core
```

## Quick Start

```typescript
import { generateText } from '@localmode/core';
import { wllama } from '@localmode/wllama';

const model = wllama.languageModel(
  'bartowski/Llama-3.2-1B-Instruct-GGUF:Llama-3.2-1B-Instruct-Q4_K_M.gguf'
);

const { text } = await generateText({
  model,
  prompt: 'Explain quantum computing in simple terms.',
});

console.log(text);
```

## Streaming

```typescript
import { streamText } from '@localmode/core';
import { wllama } from '@localmode/wllama';

const model = wllama.languageModel(
  'bartowski/Llama-3.2-1B-Instruct-GGUF:Llama-3.2-1B-Instruct-Q4_K_M.gguf'
);

const result = await streamText({ model, prompt: 'Write a haiku.' });

for await (const chunk of result.stream) {
  process.stdout.write(chunk.text);
}
```

## GGUF Metadata Inspection

Inspect any GGUF model before downloading:

```typescript
import { parseGGUFMetadata } from '@localmode/wllama';

const metadata = await parseGGUFMetadata(
  'bartowski/Llama-3.2-1B-Instruct-GGUF:Llama-3.2-1B-Instruct-Q4_K_M.gguf'
);

console.log(metadata.architecture);   // 'llama'
console.log(metadata.quantization);   // 'Q4_K_M'
console.log(metadata.contextLength);  // 131072
console.log(metadata.parameterCount); // ~1.24B
```

## Curated Model Catalog

The package ships 18 curated GGUF models optimized for browser use, including 2 vision-language models. Use catalog keys as shorthand model IDs:

```typescript
import { wllama } from '@localmode/wllama';

// Use a catalog key directly
const model = wllama.languageModel('Llama-3.2-1B-Instruct-Q4_K_M');
```

### Vision-Language Models

| Model | Size | Context | Vision | Description |
| ----- | ---- | ------- | ------ | ----------- |
| `Holo2-4B-Q4_K_M` | 2.8GB | 256K | Yes | Hcompany Holo2 4B UI-grounding VLM, best for browser-agent / GUI navigation |
| `Holo2-8B-Q4_K_M` | 5.1GB | 256K | Yes | Hcompany Holo2 8B premium UI-grounding VLM, highest-quality grounding |

### Text Models (Selected)

| Model | Size | Context | Description |
| ----- | ---- | ------- | ----------- |
| `SmolLM2-135M-Instruct-Q4_K_M` | 70MB | 8K | Tiniest GGUF model, instant loading |
| `Llama-3.2-1B-Instruct-Q4_K_M` | 750MB | 128K | Llama 3.2 1B, great for simple tasks |
| `Qwen2.5-3B-Instruct-Q4_K_M` | 1.94GB | 32K | High quality multilingual generation |
| `Phi-4-mini-instruct-Q4_K_M` | 2.3GB | 4K | Microsoft Phi-4, strong reasoning |
| `Llama-3.1-8B-Instruct-Q4_K_M` | 4.92GB | 128K | Best quality for capable devices |

See `WLLAMA_MODELS` in the source for the full catalog of all 18 models.

### The `vision` Field

Each `WllamaModelEntry` has an optional `vision?: boolean` field that marks multimodal (text + image) models. Vision-language GGUFs typically also require a separate `mmproj` projector file at runtime; the catalog entry advertises the capability but does not encode the projector URL.

## Browser Compatibility Check

Check if a model can run on the current device:

```typescript
import { checkGGUFBrowserCompatFromURL } from '@localmode/wllama';

const result = await checkGGUFBrowserCompatFromURL(
  'bartowski/Llama-3.2-1B-Instruct-GGUF:Llama-3.2-1B-Instruct-Q4_K_M.gguf'
);

if (result.canRun) {
  console.log('Ready to run!', result.estimatedSpeed);
} else {
  console.log('Warnings:', result.warnings);
  console.log('Suggestions:', result.recommendations);
}
```

## CORS Multi-Threading

For 2-4x faster inference, add these HTTP headers to your server:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Without these headers, wllama falls back to single-threaded mode automatically.

## Chrome Extension Support (MV3)

The wllama WASM binaries can be bundled in Chrome Manifest V3 extensions. When `chrome.runtime.getURL` is available, the provider automatically resolves WASM paths via the extension runtime instead of fetching from a CDN (which would be blocked by MV3's "no remotely hosted code" rule).

Bundle the WASM files under `wllama-wasm/` in your extension:

```
your-extension/
  wllama-wasm/
    single-thread/wllama.wasm
    multi-thread/wllama.wasm
```

No additional configuration is needed -- the provider detects the extension context automatically.

## Output Token IDs

Generation results expose an `outputTokenIds: number[]` property containing the raw token IDs produced by llama.cpp. This is useful for cross-modal consumers (e.g., Orpheus TTS, which extracts SNAC audio tokens from the LLM output stream) that need to post-process the token sequence directly.

```typescript
const result = await generateText({ model, prompt: 'Hello!' });
const tokenIds = (result as { outputTokenIds?: number[] }).outputTokenIds;
```

## Documentation

Full documentation at [localmode.dev/docs/wllama](https://localmode.dev/docs/wllama).

## Acknowledgments

This package is built on [wllama](https://github.com/ngxson/wllama) by [ngxson](https://github.com/ngxson) and [llama.cpp](https://github.com/ggml-org/llama.cpp) by [Georgi Gerganov](https://github.com/ggerganov) — GGUF model inference via llama.cpp compiled to WebAssembly. GGUF metadata parsing uses [@huggingface/gguf](https://github.com/huggingface/huggingface.js/tree/main/packages/gguf) by [HuggingFace](https://huggingface.co/).

## License

MIT
