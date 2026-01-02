# @localmode/webllm

WebLLM provider for local-first LLM inference. Uses 4-bit quantized models for efficient browser-based text generation.

[![npm](https://img.shields.io/npm/v/@localmode/webllm)](https://www.npmjs.com/package/@localmode/webllm)
[![license](https://img.shields.io/npm/l/@localmode/webllm)](../../LICENSE)

[![Docs](https://img.shields.io/badge/Docs-LocalMode.dev-red)](https://localmode.dev)
[![Demo](https://img.shields.io/badge/Demo-LocalMode.ai-purple)](https://localmode.ai)

## Installation

```bash
pnpm install @localmode/webllm @localmode/core
```

## Quick Start

```typescript
import { generateText, streamText } from '@localmode/core';
import { webllm } from '@localmode/webllm';

// Generate text
const { text, usage } = await generateText({
  model: webllm.languageModel('Llama-3.2-1B-Instruct-q4f16'),
  prompt: 'Explain quantum computing in simple terms.',
});

console.log(text);
console.log(`Generated in ${usage.durationMs}ms`);
```

## Streaming

```typescript
import { streamText } from '@localmode/core';
import { webllm } from '@localmode/webllm';

const stream = await streamText({
  model: webllm.languageModel('Llama-3.2-1B-Instruct-q4f16'),
  prompt: 'Write a haiku about programming.',
});

for await (const { text } of stream) {
  process.stdout.write(text);
}
```

## Model Preloading

```typescript
import { preloadModel, isModelCached } from '@localmode/webllm';

// Check if model is already cached
if (!(await isModelCached('Llama-3.2-1B-Instruct-q4f16'))) {
  // Preload with progress
  await preloadModel('Llama-3.2-1B-Instruct-q4f16', {
    onProgress: (p) => console.log(`Loading: ${p.progress?.toFixed(1)}%`),
  });
}
```

## Available Models

| Model                         | Size  | Context | Best For           |
| ----------------------------- | ----- | ------- | ------------------ |
| `Llama-3.2-1B-Instruct-q4f16` | 700MB | 4K      | Simple tasks, fast |
| `Llama-3.2-3B-Instruct-q4f16` | 1.8GB | 4K      | General purpose    |
| `Phi-3.5-mini-instruct-q4f16` | 2.4GB | 4K      | Reasoning          |
| `Qwen2.5-1.5B-Instruct-q4f16` | 1GB   | 4K      | Multilingual       |
| `SmolLM2-1.7B-Instruct-q4f16` | 1.1GB | 2K      | Compact, fast      |

## Custom Configuration

```typescript
import { createWebLLM } from '@localmode/webllm';

const myWebLLM = createWebLLM({
  onProgress: (p) => updateLoadingBar(p.progress),
});

const model = myWebLLM.languageModel('Llama-3.2-1B-Instruct-q4f16', {
  systemPrompt: 'You are a helpful coding assistant.',
  temperature: 0.5,
  maxTokens: 1024,
});
```

## Requirements

- WebGPU support (Chrome 113+, Edge 113+)
- Sufficient GPU memory for the model

## License

[MIT](../../LICENSE)
