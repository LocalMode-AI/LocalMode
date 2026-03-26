# @localmode/webllm

WebLLM provider for local-first LLM inference. Uses 4-bit quantized models for efficient browser-based text generation.

[![npm](https://img.shields.io/npm/v/@localmode/webllm)](https://www.npmjs.com/package/@localmode/webllm)
[![license](https://img.shields.io/npm/l/@localmode/webllm)](../../LICENSE)

[![Docs](https://img.shields.io/badge/Docs-LocalMode.dev-red)](https://localmode.dev/docs/webllm)
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
  model: webllm.languageModel('Llama-3.2-1B-Instruct-q4f16_1-MLC'),
  prompt: 'Explain quantum computing in simple terms.',
});

console.log(text);
console.log(`Generated in ${usage.durationMs}ms`);
```

## Streaming

```typescript
import { streamText } from '@localmode/core';
import { webllm } from '@localmode/webllm';

const result = await streamText({
  model: webllm.languageModel('Llama-3.2-1B-Instruct-q4f16_1-MLC'),
  prompt: 'Write a haiku about programming.',
});

for await (const chunk of result.stream) {
  process.stdout.write(chunk.text);
}
```

## Model Preloading

```typescript
import { preloadModel, isModelCached, deleteModelCache } from '@localmode/webllm';

// Check if model is already cached
if (!(await isModelCached('Llama-3.2-1B-Instruct-q4f16_1-MLC'))) {
  // Preload with progress
  await preloadModel('Llama-3.2-1B-Instruct-q4f16_1-MLC', {
    onProgress: (p) => console.log(`Loading: ${p.progress?.toFixed(1)}%`),
  });
}

// Delete cached model
await deleteModelCache('Llama-3.2-1B-Instruct-q4f16_1-MLC');
```

## Available Models

### Tiny (< 500MB)

| Model | Size | Context | Description |
| ----- | ---- | ------- | ----------- |
| `SmolLM2-135M-Instruct-q0f16-MLC` | 78MB | 2K | Tiniest model, instant loading |
| `SmolLM2-360M-Instruct-q4f16_1-MLC` | 210MB | 2K | Very small, surprisingly capable |
| `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` | 278MB | 4K | Tiny Qwen, great quality for size |
| `Qwen3-0.6B-q4f16_1-MLC` | 350MB | 4K | Latest tiny model |
| `TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC` | 400MB | 2K | Fast and capable chat |

### Small (500MB – 1GB)

| Model | Size | Context | Description |
| ----- | ---- | ------- | ----------- |
| `Llama-3.2-1B-Instruct-q4f16_1-MLC` | 712MB | 4K | Great for simple tasks |
| `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` | 868MB | 4K | Multilingual |
| `Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC` | 868MB | 4K | Code-specialized |

### Medium (1 – 2GB)

| Model | Size | Context | Description |
| ----- | ---- | ------- | ----------- |
| `Qwen3-1.7B-q4f16_1-MLC` | 1.1GB | 4K | Latest multilingual |
| `SmolLM2-1.7B-Instruct-q4f16_1-MLC` | 1GB | 2K | Best small model (requires `shader-f16`) |
| `gemma-2-2b-it-q4f16_1-MLC` | 1.44GB | 2K | Google Gemma 2 (requires `shader-f16`) |
| `Qwen2.5-3B-Instruct-q4f16_1-MLC` | 1.7GB | 4K | High quality |
| `Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC` | 1.7GB | 4K | Mid-range code model |
| `Llama-3.2-3B-Instruct-q4f16_1-MLC` | 1.76GB | 4K | Excellent quality |
| `Hermes-3-Llama-3.2-3B-q4f16_1-MLC` | 1.76GB | 4K | Enhanced chat |
| `Ministral-3-3B-Instruct-2512-BF16-q4f16_1-MLC` | 1.8GB | 4K | Latest Mistral 3B architecture |
| `Ministral-3-3B-Reasoning-2512-q4f16_1-MLC` | 1.8GB | 4K | Reasoning-tuned 3B |

### Large (> 2GB)

| Model | Size | Context | Description |
| ----- | ---- | ------- | ----------- |
| `Phi-3.5-mini-instruct-q4f16_1-MLC` | 2.1GB | 4K | Excellent reasoning |
| `Phi-3-mini-4k-instruct-q4f16_1-MLC` | 2.2GB | 4K | Reasoning and coding |
| `Phi-3.5-vision-instruct-q4f16_1-MLC` | 2.4GB | 1K | **Vision** — multimodal (text + images) |
| `Qwen3-4B-q4f16_1-MLC` | 2.2GB | 4K | Best quality in medium param range |
| `Mistral-7B-Instruct-v0.3-q4f16_1-MLC` | 4GB | 4K | Strong general-purpose |
| `Qwen2.5-7B-Instruct-q4f16_1-MLC` | 4GB | 4K | Excellent multilingual |
| `Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC` | 4GB | 4K | Best-in-class code model |
| `DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC` | 4.18GB | 4K | Advanced reasoning |
| `DeepSeek-R1-Distill-Llama-8B-q4f16_1-MLC` | 4.41GB | 4K | Best reasoning |
| `Llama-3.1-8B-Instruct-q4f16_1-MLC` | 4.5GB | 4K | Strong general-purpose |
| `Qwen3-8B-q4f16_1-MLC` | 4.5GB | 4K | Highest quality multilingual |
| `Hermes-3-Llama-3.1-8B-q4f16_1-MLC` | 4.9GB | 4K | Hermes 3 8B, DPO-optimized chat |
| `gemma-2-9b-it-q4f16_1-MLC` | 5GB | 1K | Google Gemma 2 9B, highest quality |

## Vision (Image Input)

Phi 3.5 Vision supports multimodal input — send images alongside text:

```typescript
import { streamText } from '@localmode/core';
import { webllm } from '@localmode/webllm';

const model = webllm.languageModel('Phi-3.5-vision-instruct-q4f16_1-MLC');
console.log(model.supportsVision); // true

const result = await streamText({
  model,
  prompt: '',
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: 'What is in this image?' },
      { type: 'image', data: base64Data, mimeType: 'image/jpeg' },
    ],
  }],
});
```

## Custom Configuration

```typescript
import { createWebLLM } from '@localmode/webllm';

const myWebLLM = createWebLLM({
  onProgress: (p) => updateLoadingBar(p.progress),
});

const model = myWebLLM.languageModel('Llama-3.2-1B-Instruct-q4f16_1-MLC', {
  systemPrompt: 'You are a helpful coding assistant.',
  temperature: 0.5,
  maxTokens: 1024,
});
```

### Default Settings

| Setting | Default | Description |
| ------- | ------- | ----------- |
| `temperature` | `0.7` | Sampling temperature |
| `topP` | `0.95` | Nucleus sampling threshold |
| `maxTokens` | `512` | Maximum tokens to generate |
| `contextLength` | `4096` | Context window size |

## Utilities

```typescript
import {
  preloadModel,
  isModelCached,
  deleteModelCache,
  getModelSize,
  isWebGPUAvailable,
} from '@localmode/webllm';

// Check WebGPU support
const gpuAvailable = await isWebGPUAvailable();

// Get estimated model size in bytes
const size = getModelSize('Llama-3.2-1B-Instruct-q4f16_1-MLC');

// Delete cached model data
await deleteModelCache('Llama-3.2-1B-Instruct-q4f16_1-MLC');
```

## Requirements

- WebGPU support (Chrome 113+, Edge 113+)
- Sufficient GPU memory for the model
- Some models (SmolLM2-1.7B, Gemma 2 2B) require the `shader-f16` WebGPU extension, which is not available on all devices (e.g., Qualcomm/Android). Use `q4f32_1` variants as fallbacks for broader compatibility.

## Acknowledgments

This package is built on [WebLLM](https://github.com/mlc-ai/web-llm) by [MLC AI](https://mlc.ai/) — high-performance LLM inference in the browser with WebGPU.

## License

[MIT](../../LICENSE)
