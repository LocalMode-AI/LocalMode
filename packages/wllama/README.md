# @localmode/wllama

wllama provider for [LocalMode](https://localmode.dev) -- run any GGUF model in the browser via llama.cpp compiled to WebAssembly.

[![npm](https://img.shields.io/npm/v/@localmode/wllama)](https://www.npmjs.com/package/@localmode/wllama)
[![license](https://img.shields.io/npm/l/@localmode/wllama)](../../LICENSE)

[![Docs](https://img.shields.io/badge/Docs-LocalMode.dev-red)](https://localmode.dev/docs/wllama)
[![Demo](https://img.shields.io/badge/Demo-LocalMode.ai-purple)](https://localmode.ai)

## Features

- Run any of the 135,000+ GGUF models from HuggingFace
- Works in all modern browsers (no WebGPU required, only WASM)
- GGUF metadata inspection via HTTP Range requests (~4KB download)
- Browser compatibility checking before downloading multi-GB files
- Auto-detects CORS isolation for multi-threaded inference
- Streaming text generation
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

## Documentation

Full documentation at [localmode.dev/docs/wllama](https://localmode.dev/docs/wllama).

## Acknowledgments

This package is built on [wllama](https://github.com/ngxson/wllama) by [ngxson](https://github.com/ngxson) and [llama.cpp](https://github.com/ggml-org/llama.cpp) by [Georgi Gerganov](https://github.com/ggerganov) — GGUF model inference via llama.cpp compiled to WebAssembly. GGUF metadata parsing uses [@huggingface/gguf](https://github.com/huggingface/huggingface.js/tree/main/packages/gguf) by [HuggingFace](https://huggingface.co/).

## License

MIT
