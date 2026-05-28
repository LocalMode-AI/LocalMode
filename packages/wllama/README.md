# @localmode/wllama

wllama provider for [LocalMode](https://localmode.dev) -- run any GGUF model in the browser via llama.cpp compiled to WebAssembly.

[![npm](https://img.shields.io/npm/v/@localmode/wllama)](https://www.npmjs.com/package/@localmode/wllama)
[![license](https://img.shields.io/npm/l/@localmode/wllama)](../../LICENSE)

[![Docs](https://img.shields.io/badge/Docs-LocalMode.dev-red)](https://localmode.dev/docs/wllama)
[![Demo](https://img.shields.io/badge/Demo-LocalMode.ai-purple)](https://localmode.ai)

## Features

- Run any of the 160,000+ GGUF models from HuggingFace
- Works in all modern browsers (no WebGPU required, only WASM)
- 30 curated models: 25 language (including 4 vision-language, 2 reasoning), 3 embedding, 2 reranker
- **True streaming** via `createChatCompletion({ stream: true })` for real token-by-token output
- **Structured output / JSON mode** via `response_format` (text, json_object, json_schema)
- **Reranking** via `wllama.reranker()` with cross-encoder GGUF models (Jina, BGE)
- **Embedding models** via `wllama.embedding()` (nomic-embed, mxbai-embed, bge-small)
- **WebGPU acceleration** with `useWebGPU` and `nGpuLayers` settings
- **Tool calling** via `providerOptions.wllama.tools` and `tool_choice`
- **Vision/multimodal** input with `mmprojUrl` for VLMs (Holo2 4B/8B, Gemma 4 E2B/E4B)
- **Reasoning mode** for DeepSeek-R1 style chain-of-thought thinking
- **Performance tuning** -- KV cache quantization, flash attention, speculative decoding
- **Grammar sampling** via GBNF for constrained text output
- **LoRA adapters** for fine-tuned model loading
- **Jinja chat templates** enabled by default for accurate prompt formatting
- **Model management** -- list cached models, clear cache
- GGUF metadata inspection via HTTP Range requests (~4KB download)
- Browser compatibility checking before downloading multi-GB files
- Auto-detects CORS isolation for multi-threaded inference
- Chrome MV3 extension support (auto-resolves bundled WASM binaries)
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

## True Streaming

`doStream()` uses `createChatCompletion({ stream: true })` for real token-by-token streaming. Each token is yielded as it arrives from the WASM backend -- no buffering. For prompt-only input (no messages or systemPrompt), it falls back to a single-chunk delivery via `doGenerate()`.

```typescript
import { streamText } from '@localmode/core';
import { wllama } from '@localmode/wllama';

const model = wllama.languageModel('Llama-3.2-1B-Instruct-Q4_K_M');

const result = await streamText({
  model,
  messages: [{ role: 'user', content: 'Write a haiku about the sea.' }],
});

for await (const chunk of result.stream) {
  process.stdout.write(chunk.text); // real token-by-token output
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

## Embedding Models

Generate text embeddings from GGUF embedding models using `wllama.embedding()`:

```typescript
import { embed } from '@localmode/core';
import { wllama } from '@localmode/wllama';

const model = wllama.embedding('nomic-embed-text-v1.5-Q4_K_M');

const { embedding } = await embed({ model, value: 'Hello world' });
console.log(embedding.length); // 768
```

Three curated embedding models are included in the catalog:

| Model | Size | Dimensions | Description |
| ----- | ---- | ---------- | ----------- |
| `nomic-embed-text-v1.5-Q4_K_M` | 78MB | 768 | High-quality text embeddings for semantic search |
| `mxbai-embed-large-v1-Q4_K_M` | 197MB | 1024 | Top-quality English embeddings |
| `bge-small-en-v1.5-Q8_0` | 35MB | 384 | Lightweight English embeddings |

Dimensions are auto-detected from GGUF metadata when not specified.

## Reranking

Rerank search results using cross-encoder GGUF models via `wllama.reranker()`:

```typescript
import { rerank } from '@localmode/core';
import { wllama } from '@localmode/wllama';

const model = wllama.reranker('jina-reranker-v2-base-multilingual-Q4_K_M');

const { results } = await rerank({
  model,
  query: 'machine learning frameworks',
  documents: [
    'PyTorch is a deep learning framework',
    'A recipe for chocolate cake',
    'TensorFlow supports distributed training',
    'The weather forecast for tomorrow',
  ],
});

// Results sorted by relevance score
for (const r of results) {
  console.log(`[${r.score.toFixed(3)}] ${r.text}`);
}
```

Two curated reranker models are included in the catalog:

| Model | Size | Context | Description |
| ----- | ---- | ------- | ----------- |
| `jina-reranker-v2-base-multilingual-Q4_K_M` | 163MB | 1K | Jina Reranker v2, multilingual cross-encoder |
| `bge-reranker-v2-m3-Q4_K_M` | 218MB | 8K | BAAI BGE Reranker v2 M3, long-context multilingual |

## Tool Calling

Models that support tool calling (marked with `supportsToolCalling` in the catalog) can use tools via `providerOptions`:

```typescript
import { generateText } from '@localmode/core';
import { wllama } from '@localmode/wllama';

const model = wllama.languageModel('Llama-3.2-1B-Instruct-Q4_K_M');

const result = await generateText({
  model,
  prompt: 'What is the weather in Tokyo?',
  providerOptions: {
    wllama: {
      tools: [{
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get current weather for a city',
          parameters: {
            type: 'object',
            properties: { city: { type: 'string' } },
            required: ['city'],
          },
        },
      }],
      tool_choice: 'auto',
    },
  },
});
```

The result includes a `toolCalls` array when the model invokes tools.

## Structured Output / JSON Mode

Constrain model output to valid JSON via `providerOptions.wllama.response_format`. Three modes are available:

```typescript
import { generateText } from '@localmode/core';
import { wllama } from '@localmode/wllama';

const model = wllama.languageModel('Qwen2.5-3B-Instruct-Q4_K_M');

// Free-form JSON output
const { text } = await generateText({
  model,
  messages: [{ role: 'user', content: 'List 3 planets as JSON with name and diameter.' }],
  providerOptions: {
    wllama: {
      response_format: { type: 'json_object' },
    },
  },
});

// Schema-constrained JSON output
const { text: structured } = await generateText({
  model,
  messages: [{ role: 'user', content: 'Give me info about Mars.' }],
  providerOptions: {
    wllama: {
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'planet',
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              diameter_km: { type: 'number' },
              moons: { type: 'integer' },
            },
            required: ['name', 'diameter_km'],
          },
          strict: true,
        },
      },
    },
  },
});
```

The `WllamaResponseFormat` type is exported for TypeScript consumers.

## Vision / Multimodal

Vision-language models (e.g., Holo2) accept image input alongside text. The model requires an `mmprojUrl` pointing to the vision projection GGUF. Catalog entries for vision models include `mmprojUrl` automatically:

```typescript
import { generateText } from '@localmode/core';
import { wllama } from '@localmode/wllama';

// Catalog entries include mmprojUrl automatically
const model = wllama.languageModel('Holo2-4B-Q4_K_M');
console.log(model.supportsVision); // true

// Pass images as multimodal content parts (base64-encoded)
const { text } = await generateText({
  model,
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: 'Describe this screenshot.' },
      { type: 'image', data: base64ImageData, mimeType: 'image/png' },
    ],
  }],
});
```

For custom vision models, pass `mmprojUrl` in the model settings:

```typescript
const model = wllama.languageModel('my-repo/my-vlm-GGUF:model.gguf', {
  mmprojUrl: 'https://huggingface.co/my-repo/my-vlm-GGUF/resolve/main/mmproj-f16.gguf',
});
```

## Audio Input (Experimental)

Models that accept audio content parts can receive audio alongside text. Audio data is passed as base64-encoded strings and converted to ArrayBuffer internally:

```typescript
import { generateText } from '@localmode/core';
import { wllama } from '@localmode/wllama';

const model = wllama.languageModel('my-audio-model');

const { text } = await generateText({
  model,
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: 'Transcribe this audio.' },
      { type: 'audio', data: base64AudioData, mimeType: 'audio/wav' },
    ],
  }],
});
```

> **Note:** Audio support depends on the underlying GGUF model's capabilities. No curated catalog models currently support audio input.

## WebGPU Acceleration

Enable WebGPU to offload transformer layers to the GPU for faster inference:

```typescript
const model = wllama.languageModel('Llama-3.2-1B-Instruct-Q4_K_M', {
  useWebGPU: true, // enable GPU offload; falls back to WASM if unavailable
});

// Or auto-detect WebGPU availability
const model2 = wllama.languageModel('Llama-3.2-1B-Instruct-Q4_K_M', {
  useWebGPU: 'auto',
});

// Fine-grained control: offload specific number of layers
const model3 = wllama.languageModel('Llama-3.2-1B-Instruct-Q4_K_M', {
  nGpuLayers: 20, // offload 20 layers; use -1 for all layers
});

// gpuAccelerated is available on the concrete WllamaLanguageModel class
import { WllamaLanguageModel } from '@localmode/wllama';
const wllamaModel = new WllamaLanguageModel('Llama-3.2-1B-Instruct-Q4_K_M', { useWebGPU: true });
console.log(wllamaModel.gpuAccelerated); // true when WebGPU is active
```

WebGPU settings also work with embedding models:

```typescript
const embedModel = wllama.embedding('nomic-embed-text-v1.5-Q4_K_M', {
  useWebGPU: 'auto',
});
```

## Jinja Chat Templates

wllama v3 uses the model's built-in Jinja chat template for accurate prompt formatting. This is enabled by default (`useJinja: true`). If a model's template causes errors, wllama automatically falls back to raw completion mode.

```typescript
const model = wllama.languageModel('Llama-3.2-1B-Instruct-Q4_K_M', {
  useJinja: false, // disable Jinja templates (use raw completion)
});
```

## Reasoning Mode

Enable chain-of-thought reasoning for DeepSeek-R1 style thinking models:

```typescript
import { generateText } from '@localmode/core';
import { wllama } from '@localmode/wllama';

const model = wllama.languageModel('DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M', {
  reasoning: true,
  reasoningFormat: 'deepseek',       // 'none' | 'deepseek-legacy' | 'deepseek'
  reasoningBudgetTokens: 1024,       // limit thinking tokens
});

const { text } = await generateText({
  model,
  messages: [{ role: 'user', content: 'Solve: if 3x + 7 = 22, what is x?' }],
});
```

When streaming, reasoning content is surfaced via `reasoning_content` delta chunks alongside regular content.

## Performance Configuration

### KV Cache Quantization

Reduce memory usage for long contexts by quantizing the KV cache:

```typescript
const model = wllama.languageModel('Llama-3.1-8B-Instruct-Q4_K_M', {
  cacheTypeK: 'q4_0',  // quantize key cache (f32, f16, q8_0, q5_1, q5_0, q4_1, q4_0)
  cacheTypeV: 'q4_0',  // quantize value cache
});
```

### Flash Attention

```typescript
const model = wllama.languageModel('Llama-3.2-3B-Instruct-Q4_K_M', {
  flashAttention: true,
});
```

### Speculative Decoding

Use a smaller draft model for 2-3x faster inference:

```typescript
const model = wllama.languageModel('Llama-3.1-8B-Instruct-Q4_K_M', {
  specDraftModel: 'https://huggingface.co/bartowski/SmolLM2-135M-Instruct-GGUF/resolve/main/SmolLM2-135M-Instruct-Q4_K_M.gguf',
  specDraftNgl: -1,     // GPU layers for draft model
  specDraftNMin: 2,     // min draft tokens
  specDraftNMax: 8,     // max draft tokens
  specDraftPMin: 0.5,   // min probability threshold
});
```

## Grammar Sampling

Constrain output to a GBNF grammar for structured text beyond JSON mode:

```typescript
import { generateText } from '@localmode/core';
import { wllama } from '@localmode/wllama';

const model = wllama.languageModel('Qwen2.5-3B-Instruct-Q4_K_M');

const { text } = await generateText({
  model,
  prompt: 'Generate a valid email address',
  providerOptions: {
    wllama: {
      grammar: `root ::= [a-zA-Z0-9._%+-]+ "@" [a-zA-Z0-9.-]+ "." [a-zA-Z]{2,}`,
    },
  },
});
```

## Model Management

List and clear cached GGUF models stored in the browser's OPFS:

```typescript
import { listCachedModels, clearAllModelCache, deleteModelCache, isModelCached, refreshModel } from '@localmode/wllama';

// List all cached models
const cached = await listCachedModels();
for (const m of cached) {
  console.log(`${m.name}: ${(m.size / 1024 / 1024).toFixed(1)}MB`);
}

// Delete a specific model
await deleteModelCache('Llama-3.2-1B-Instruct-Q4_K_M');

// Re-download a model (replaces corrupted cache)
await refreshModel('SmolLM2-135M-Instruct-Q4_K_M', {
  onProgress: (p) => console.log(`${p.progress}%`),
});

// Clear everything
await clearAllModelCache();
```

## LoRA Adapters

Load fine-tuned LoRA adapters alongside the base model:

```typescript
const model = wllama.languageModel('Llama-3.2-1B-Instruct-Q4_K_M', {
  loraAdapters: [
    { path: 'https://example.com/my-lora-adapter.gguf', scale: 1.0 },
  ],
});
```

Set `loraInitWithoutApply: true` to initialize adapters without applying them (for manual control).

## Extended Sampling Parameters

Fine-grained control over generation via `providerOptions.wllama`:

```typescript
const { text } = await generateText({
  model,
  prompt: 'Write a creative story.',
  providerOptions: {
    wllama: {
      top_k: 40,                    // top-K sampling (limit token pool)
      repeat_penalty: 1.1,          // repetition penalty
      repeat_last_n: 64,            // window for repetition penalty
      min_p: 0.05,                  // minimum probability threshold
      seed: 42,                     // reproducible generation
      penalty_freq: 0.5,            // frequency penalty
      penalty_present: 0.5,         // presence penalty
      typ_p: 0.95,                  // locally typical sampling
      dynatemp_range: 0.2,          // dynamic temperature range
      dynatemp_exponent: 1.0,       // dynamic temperature exponent
      mirostat: 2,                  // Mirostat sampling (0=off, 1=v1, 2=v2)
      mirostat_tau: 5.0,            // Mirostat target entropy
      mirostat_eta: 0.1,            // Mirostat learning rate
      logit_bias: [[128, -100]],    // bias specific token logits
      samplers_sequence: 'tkpm',    // custom sampler order
      n_probs: 5,                   // return top-N token probabilities
    },
  },
});
```

## Curated Model Catalog

The package ships 30 curated GGUF models optimized for browser use: 25 language models (including 4 vision-language and 2 reasoning), 3 embedding models, and 2 reranker models. Use catalog keys as shorthand model IDs:

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
| `Gemma-4-E2B-IT-Q4_K_M` | 3.46GB | 131K | Yes | Google Gemma 4 E2B IT, 5.1B params (2.3B effective PLE), vision + tool calling |
| `Gemma-4-E4B-IT-Q4_K_M` | 5.41GB | 131K | Yes | Google Gemma 4 E4B IT, 8B params (~4B effective PLE), vision + tool calling |

### Text Models (Selected)

| Model | Size | Context | Description |
| ----- | ---- | ------- | ----------- |
| `SmolLM2-135M-Instruct-Q4_K_M` | 70MB | 8K | Tiniest GGUF model, instant loading |
| `Llama-3.2-1B-Instruct-Q4_K_M` | 750MB | 128K | Llama 3.2 1B, great for simple tasks |
| `Qwen2.5-3B-Instruct-Q4_K_M` | 1.94GB | 32K | High quality multilingual generation |
| `Phi-4-mini-instruct-Q4_K_M` | 2.3GB | 4K | Microsoft Phi-4, strong reasoning |
| `Llama-3.1-8B-Instruct-Q4_K_M` | 4.92GB | 128K | Best quality for capable devices |

### Embedding Models

| Model | Size | Dimensions | Description |
| ----- | ---- | ---------- | ----------- |
| `nomic-embed-text-v1.5-Q4_K_M` | 78MB | 768 | Nomic Embed Text v1.5, high-quality semantic search |
| `mxbai-embed-large-v1-Q4_K_M` | 197MB | 1024 | MxBai Embed Large v1, top-quality English embeddings |
| `bge-small-en-v1.5-Q8_0` | 35MB | 384 | BAAI BGE Small, lightweight on-device embeddings |

See `WLLAMA_MODELS` in the source for the full catalog of all 30 models.

### Catalog Fields

Each `WllamaModelEntry` has optional capability fields:
- `vision?: boolean` + `mmprojUrl?: string` — multimodal (text + image) models with vision projection
- `supportsToolCalling?: boolean` — models verified for OAI-compatible tool calling
- `isEmbeddingModel?: boolean` + `dimensions?: number` — embedding-only models
- `isRerankerModel?: boolean` — cross-encoder reranker models (used with `wllama.reranker()`)
- `supportsReasoning?: boolean` — reasoning/thinking models (e.g., DeepSeek-R1)
- `nGpuLayers?: number` — recommended GPU layer count for WebGPU acceleration

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

## Safari / iOS Compatibility

wllama v3 requires the WebAssembly Memory64 proposal, which is not yet available in Safari or iOS browsers. To support Safari users, install the optional compatibility package:

```bash
pnpm add @wllama/wllama-compat
```

This package provides a fallback WASM build that works without Memory64. No code changes needed — wllama detects and uses the compat build automatically when available.

| Browser | Status |
|---------|--------|
| Chrome 80+ | Supported |
| Edge 80+ | Supported |
| Firefox 141+ | Supported (Windows), 147+ (macOS Apple Silicon) |
| Safari | Requires `@wllama/wllama-compat` |
| iOS Safari | Requires `@wllama/wllama-compat` |

## Chrome Extension Support (MV3)

The wllama WASM binaries can be bundled in Chrome Manifest V3 extensions. When `chrome.runtime.getURL` is available, the provider automatically resolves WASM paths via the extension runtime instead of fetching from a CDN (which would be blocked by MV3's "no remotely hosted code" rule).

Bundle the WASM file under `wllama-wasm/` in your extension:

```
your-extension/
  wllama-wasm/
    wllama.wasm
```

No additional configuration is needed -- the provider detects the extension context automatically.

## Output Token IDs

> **Note:** As of wllama v3, per-token IDs are no longer exposed via the OAI-compatible API. The `outputTokenIds` extension is not available. If you need raw token access for cross-modal use cases (e.g., Orpheus TTS), consider using a provider that exposes token-level output.

## Documentation

Full documentation at [localmode.dev/docs/wllama](https://localmode.dev/docs/wllama).

## Acknowledgments

This package is built on [wllama](https://github.com/ngxson/wllama) by [ngxson](https://github.com/ngxson) and [llama.cpp](https://github.com/ggml-org/llama.cpp) by [Georgi Gerganov](https://github.com/ggerganov) — GGUF model inference via llama.cpp compiled to WebAssembly. GGUF metadata parsing uses [@huggingface/gguf](https://github.com/huggingface/huggingface.js/tree/main/packages/gguf) by [HuggingFace](https://huggingface.co/).

## License

MIT
