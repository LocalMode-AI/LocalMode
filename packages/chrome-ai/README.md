# @localmode/chrome-ai

[![npm](https://img.shields.io/npm/v/@localmode/chrome-ai)](https://www.npmjs.com/package/@localmode/chrome-ai)
[![license](https://img.shields.io/npm/l/@localmode/chrome-ai)](../../LICENSE)

[![Docs](https://img.shields.io/badge/Docs-LocalMode.dev-red)](https://localmode.dev/docs/chrome-ai)
[![Demo](https://img.shields.io/badge/Demo-LocalMode.ai-purple)](https://localmode.ai)

Zero-download, instant AI inference via Chrome's built-in Gemini Nano model. Part of the [LocalMode](https://localmode.dev) ecosystem.

## Features

- Zero model downloads — Gemini Nano ships with Chrome
- Zero bundle size impact — browser-native APIs
- Instant inference — no model loading delay
- Implements `SummarizationModel`, `TranslationModel`, and `LanguageModel` from `@localmode/core`
- Automatic fallback support — pair with `@localmode/transformers`, `@localmode/webllm`, `@localmode/wllama`, or `@localmode/litert` for non-Chrome browsers

## Requirements

- **Chrome 138+** on desktop (Windows 10+, macOS 13+, Linux, or ChromeOS on Chromebook Plus)
- **22 GB free disk space** on the volume containing your Chrome profile (for the Gemini Nano model)
- **Hardware**: GPU with >4 GB VRAM, or CPU with 16 GB+ RAM and 4+ cores
- Not available on mobile (Android/iOS) or in Incognito mode
- Non-Chrome browsers need a fallback provider (e.g., `@localmode/transformers`)

### Enabling Chrome AI

1. Navigate to `chrome://flags/#optimization-guide-on-device-model` → set to **Enabled**
2. Navigate to `chrome://flags/#prompt-api-for-gemini-nano` → set to **Enabled**
3. Restart Chrome
4. The Gemini Nano model downloads automatically in the background (~1.5 GB)
5. Verify in DevTools Console: `await Summarizer.availability()` should return `"readily"`

For the Summarizer API specifically, also enable `chrome://flags/#summarization-api-for-gemini-nano` → **Enabled with Adaptation** for higher-quality summaries via LoRA.

## Installation

```bash
pnpm add @localmode/chrome-ai @localmode/core
```

## Quick Start

```typescript
import { generateText, summarize, translate } from '@localmode/core';
import { chromeAI } from '@localmode/chrome-ai';

// Summarize text (instant, no download)
const { summary } = await summarize({
  model: chromeAI.summarizer(),
  text: 'Long article text...',
});

// Translate text
const { translation } = await translate({
  model: chromeAI.translator({ targetLanguage: 'de' }),
  text: 'Hello, world!',
});

// Generate text with Gemini Nano via the Prompt API
const { text } = await generateText({
  model: chromeAI.languageModel({ systemPrompt: 'You are concise.' }),
  prompt: 'Explain TLS in one sentence.',
});
```

## Fallback Pattern

```typescript
import { summarize } from '@localmode/core';
import { chromeAI, isSummarizerAPISupported } from '@localmode/chrome-ai';
import { transformers } from '@localmode/transformers';

const model = isSummarizerAPISupported()
  ? chromeAI.summarizer()
  : transformers.summarizer('Xenova/distilbart-cnn-6-6');

const { summary } = await summarize({ model, text: 'Long article...' });
```

## API

### `chromeAI.summarizer(settings?)`

Creates a `SummarizationModel` using Chrome's Summarizer API.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `type` | `'key-points' \| 'tl;dr' \| 'teaser' \| 'headline'` | `'tl;dr'` | Summary type |
| `format` | `'markdown' \| 'plain-text'` | `'plain-text'` | Output format |
| `length` | `'short' \| 'medium' \| 'long'` | `'medium'` | Summary length |
| `sharedContext` | `string` | — | Context shared across calls |

### `chromeAI.translator(settings?)`

Creates a `TranslationModel` using Chrome's Translator API.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `sourceLanguage` | `string` | `'en'` | Source language (BCP 47) |
| `targetLanguage` | `string` | `'es'` | Target language (BCP 47) |

### `chromeAI.languageModel(settings?)`

Creates a `LanguageModel` using Chrome's Prompt API (Gemini Nano). Supports `generateText()`, `streamText()`, `generateObject()`, and the model-warmup protocol via `warmUp()` / `isReady()`.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `systemPrompt` | `string` | — | Prepended to every session as `initialPrompts[0]` |
| `temperature` | `number` | Chrome default | Sampling temperature (0–1) |
| `topK` | `number` | Chrome default | Top-K sampling cutoff |
| `contextLength` | `number` | `6144` | Soft documentation value for `model.contextLength` |
| `onProgress` | `(p: { loaded: number; total: number }) => void` | — | Forwarded to `monitor` for Gemini Nano download progress |

```typescript
import { generateText } from '@localmode/core';
import { chromeAI } from '@localmode/chrome-ai';

const { text } = await generateText({
  model: chromeAI.languageModel({ systemPrompt: 'You are concise.' }),
  prompt: 'Explain quantum tunnelling in one sentence.',
});
```

#### Lifecycle Methods

`ChromeAILanguageModel` exposes lifecycle methods for fine-grained control:

| Method | Returns | Description |
|--------|---------|-------------|
| `warmUp()` | `Promise<void>` | Pre-initialize the Gemini Nano session so the next `doGenerate()` / `doStream()` has zero creation latency. Pairs with `useModelWarmup()` from `@localmode/react`. |
| `isReady()` | `boolean` | `true` once a session is cached on this instance; `false` otherwise. |
| `destroy()` | `void` | Release the cached session and free resources. Idempotent. Subsequent calls recreate a fresh session. |

```typescript
import { ChromeAILanguageModel } from '@localmode/chrome-ai';

const model = new ChromeAILanguageModel({
  systemPrompt: 'You are concise.',
  temperature: 0.3,
});

await model.warmUp();
console.log(model.isReady()); // true

// ... use model with generateText() / streamText() ...

model.destroy(); // release resources
```

See the [Language Model docs](https://localmode.dev/docs/chrome-ai/language-model) for streaming, structured output, fallback chains, and the full error reference.

### Feature Detection

```typescript
import {
  isChromeAISupported,
  isPromptAPISupported,
  isSummarizerAPISupported,
  isTranslatorAPISupported,
} from '@localmode/chrome-ai';

if (isChromeAISupported()) { /* Chrome AI available */ }
if (isPromptAPISupported()) { /* Prompt API (LanguageModel) available */ }
if (isSummarizerAPISupported()) { /* Summarizer API available */ }
if (isTranslatorAPISupported()) { /* Translator API available */ }
```

### Exported Types

The package exports TypeScript types for Chrome's built-in AI APIs:

| Type | Description |
|------|-------------|
| `ChromeAIProvider` | Provider interface with `summarizer()`, `translator()`, `languageModel()` |
| `ChromeAIProviderSettings` | Provider-level configuration |
| `ChromeAILanguageModelSettings` | Settings for `languageModel()` (systemPrompt, temperature, topK, etc.) |
| `ChromeAISummarizerSettings` | Settings for `summarizer()` (type, format, length) |
| `ChromeAITranslatorSettings` | Settings for `translator()` (sourceLanguage, targetLanguage) |
| `AILanguageModel` | Chrome Prompt API session interface |
| `AILanguageModelAvailability` | Availability status: `'available' \| 'downloadable' \| 'downloading' \| 'unavailable'` |
| `AILanguageModelCreateOptions` | Options for `LanguageModel.create()` |
| `AILanguageModelFactory` | Chrome Prompt API factory (`window.LanguageModel`) |
| `AILanguageModelPromptOptions` | Per-call options for `prompt()` / `promptStreaming()` |
| `AISummarizer` | Chrome Summarizer API session interface |
| `AISummarizerFactory` | Chrome Summarizer API factory |
| `AISummarizerCapabilities` | Summarizer capability detection |
| `AISummarizerCreateOptions` | Options for `Summarizer.create()` |
| `AITranslator` | Chrome Translator API session interface |
| `AITranslatorFactory` | Chrome Translator API factory |
| `AITranslatorCapabilities` | Translator capability detection |
| `AITranslatorCreateOptions` | Options for `Translator.create()` |

### Implementation Classes

The implementation classes are exported for direct instantiation or advanced wiring:

| Class | Implements |
|-------|------------|
| `ChromeAILanguageModel` | `LanguageModel` from `@localmode/core` |
| `ChromeAISummarizer` | `SummarizationModel` from `@localmode/core` |
| `ChromeAITranslator` | `TranslationModel` from `@localmode/core` |

```typescript
import { ChromeAILanguageModel } from '@localmode/chrome-ai';

// Direct instantiation (bypasses provider factory)
const model = new ChromeAILanguageModel({
  systemPrompt: 'You are helpful.',
  topK: 40,
});
```

## Acknowledgments

This package is built on [Chrome Built-in AI](https://developer.chrome.com/docs/ai/built-in) by [Google](https://google.com/) — on-device AI APIs powered by Gemini Nano, enabling zero-download inference directly in Chrome.

## License

MIT
