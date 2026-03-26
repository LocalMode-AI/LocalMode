# @localmode/ai-sdk

Vercel AI SDK provider for LocalMode — use local browser models with `generateText()`, `streamText()`, and `embed()` from the `ai` package.

[![npm](https://img.shields.io/npm/v/@localmode/ai-sdk)](https://www.npmjs.com/package/@localmode/ai-sdk)
[![license](https://img.shields.io/npm/l/@localmode/ai-sdk)](../../LICENSE)

[![Docs](https://img.shields.io/badge/Docs-LocalMode.dev-red)](https://localmode.dev/docs/ai-sdk)
[![Demo](https://img.shields.io/badge/Demo-LocalMode.ai-purple)](https://localmode.ai)

## Features

- **Universal Interface** — Use the AI SDK API you already know with models running entirely in the browser
- **Privacy-First** — All inference happens on-device. No servers, no API keys
- **Swap Local/Cloud** — Change one line to switch between local and cloud models
- **Full Streaming** — `streamText()` works with local LLMs via WebLLM

## Installation

```bash
pnpm install @localmode/ai-sdk @localmode/core ai
```

You also need at least one LocalMode provider:

```bash
# For LLM inference
pnpm install @localmode/webllm

# For embeddings, classification, etc.
pnpm install @localmode/transformers
```

## Quick Start

### Text Generation

```typescript
import { createLocalMode } from '@localmode/ai-sdk';
import { webllm } from '@localmode/webllm';
import { generateText } from 'ai';

const localmode = createLocalMode({
  models: {
    'llama': webllm.languageModel('Llama-3.2-1B-Instruct-q4f16_1-MLC'),
  },
});

const { text } = await generateText({
  model: localmode.languageModel('llama'),
  prompt: 'Explain quantum computing in simple terms',
});
```

### Streaming

```typescript
import { streamText } from 'ai';

const result = streamText({
  model: localmode.languageModel('llama'),
  prompt: 'Write a short story about a robot',
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

### Embeddings

```typescript
import { createLocalMode } from '@localmode/ai-sdk';
import { transformers } from '@localmode/transformers';
import { embed } from 'ai';

const localmode = createLocalMode({
  models: {
    'embedder': transformers.embedding('Xenova/bge-small-en-v1.5'),
  },
});

const { embedding } = await embed({
  model: localmode.embeddingModel('embedder'),
  value: 'Hello world',
});
```

## Provider Pattern

The provider follows the standard AI SDK provider pattern:

```typescript
const localmode = createLocalMode({
  models: {
    'llm': webllm.languageModel('Llama-3.2-1B-Instruct-q4f16_1-MLC'),
    'embedder': transformers.embedding('Xenova/bge-small-en-v1.5'),
  },
});

// Callable as a function (returns LanguageModelV3)
localmode('llm');

// Or via named methods
localmode.languageModel('llm');
localmode.embeddingModel('embedder');
```

## Limitations

- **No tool calling** — Local models have limited tool-calling ability. Use cloud models for agent workflows.
- **No structured output / JSON mode** — Not supported by the current LocalMode LanguageModel interface.
- **WebGPU required for LLMs** — WebLLM requires WebGPU. Falls back gracefully if unavailable.

## Documentation

Full documentation at [localmode.dev/docs/ai-sdk](https://localmode.dev/docs/ai-sdk).

## Acknowledgments

This package is built on the [Vercel AI SDK](https://sdk.vercel.ai/) by [Vercel](https://vercel.com/) — a universal TypeScript SDK for building AI applications.

## License

MIT
