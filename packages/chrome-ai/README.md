# @localmode/chrome-ai

[![npm](https://img.shields.io/npm/v/@localmode/chrome-ai)](https://www.npmjs.com/package/@localmode/chrome-ai)
[![license](https://img.shields.io/npm/l/@localmode/chrome-ai)](../../LICENSE)

[![Docs](https://img.shields.io/badge/Docs-LocalMode.dev-red)](https://localmode.dev/docs/chrome-ai)
[![UI Components](https://img.shields.io/badge/UI_Components-LocalMode.ai-green)](https://localmode.ai)
[![Blocks & Apps](https://img.shields.io/badge/Blocks_&_Apps-LocalMode.ai-purple)](https://localmode.ai/blocks)

On-device AI inference via Chrome's built-in Gemini Nano model. Your application ships and fetches no model files — Chrome supplies the model. Part of the [LocalMode](https://localmode.dev) ecosystem.

## Features

- Your app ships no model files — Chrome supplies the model and downloads it once, browser-wide, on first use (opt in with `allowDownload`, track it with `onProgress`)
- Zero bundle size impact — browser-native APIs
- No per-call model loading once the on-device model is available
- Implements `SummarizationModel`, `TranslationModel`, and `LanguageModel` from `@localmode/core`
- Automatic fallback support — pair with `@localmode/transformers`, `@localmode/webllm`, `@localmode/wllama`, or `@localmode/litert` for non-Chrome browsers

## Requirements

- **Summarizer & Translator APIs: Chrome 138+** on desktop (Windows 10+, macOS 13+, Linux, or ChromeOS on Chromebook Plus)
- **Prompt API (`languageModel()`): Chrome 148+** on desktop — Chrome 138 shipped the Prompt API for *extensions* only; it reached web pages in 148
- **22 GB free disk space** on the volume containing your Chrome profile (for the Gemini Nano model)
- **Hardware**: GPU with >4 GB VRAM, or CPU with 16 GB+ RAM and 4+ cores
- Not available on mobile (Android/iOS) or in Incognito mode
- Non-Chrome browsers need a fallback provider (e.g., `@localmode/transformers`)

### Enabling Chrome AI

On a supported Chrome stable build, **no flags are required** — these APIs ship on by default. What
you need is for Chrome to have fetched the on-device model, which happens once, browser-wide.

Verify in the DevTools console:

```ts
'Summarizer' in self;      // Summarizer  — Chrome 138+
'LanguageModel' in self;   // Prompt API  — Chrome 148+

// 'available' | 'downloadable' | 'downloading' | 'unavailable'
await Summarizer.availability();
```

If it reports `'downloadable'`, the model is not on disk yet. This package refuses to start that
download implicitly; pass `allowDownload: true` and call from a **user activation** (a click), which
Chrome requires to begin the ~1.5 GB fetch.

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

See this pattern running in a real app: the [Writing Tools blocks](https://localmode.ai/blocks/writing-tools) use Chrome AI with automatic Transformers.js fallback — Write (Prompt API), Translate (Translator API), and Summarize (Summarizer API) each resolve a Chrome AI capability when available and fall back to Transformers.js otherwise, the canonical end-to-end example of the fallback pattern above. (The fourth block, Complete, is Transformers.js-only — there is no Chrome AI fill-mask to fall back from.)

## API

### `chromeAI.summarizer(settings?)`

Creates a `SummarizationModel` using Chrome's Summarizer API.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `type` | `'key-points' \| 'tldr' \| 'teaser' \| 'headline'` | `'tldr'` | Summary type. Chrome's enum spells it `tldr`; `'tl;dr'` throws a `TypeError`. |
| `format` | `'markdown' \| 'plain-text'` | `'plain-text'` | Output format |
| `length` | `'short' \| 'medium' \| 'long'` | `'medium'` | Summary length |
| `sharedContext` | `string` | — | Context shared across calls |
| `allowDownload` | `boolean` | `false` | Let Chrome download the model when `availability()` is `downloadable`. Requires a user activation. |
| `onProgress` | `(p: { loaded: number; total: number }) => void` | — | Model download progress |

### `chromeAI.translator(settings?)`

Creates a `TranslationModel` using Chrome's Translator API.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `sourceLanguage` | `string` | `'en'` | Source language (BCP 47) |
| `targetLanguage` | `string` | `'es'` | Target language (BCP 47) |
| `allowDownload` | `boolean` | `false` | Let Chrome download the language pack for this directed pair. Requires a user activation. |
| `onProgress` | `(p: { loaded: number; total: number }) => void` | — | Language-pack download progress |

### `chromeAI.languageModel(settings?)`

Creates a `LanguageModel` using Chrome's Prompt API (Gemini Nano). Supports `generateText()`, `streamText()`, `generateObject()`, and the model-warmup protocol via `warmUp()` / `isReady()`.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `systemPrompt` | `string` | — | Prepended to every session as `initialPrompts[0]` |
| `temperature` | `number` | Chrome default | Sampling temperature (0–1) |
| `topK` | `number` | Chrome default | Top-K sampling cutoff |
| `contextLength` | `number` | `6144` | Soft documentation value for `model.contextLength` |
| `onProgress` | `(p: { loaded: number; total: number }) => void` | — | Forwarded to `monitor` for Gemini Nano download progress |
| `allowDownload` | `boolean` | `false` | Let Chrome download Gemini Nano. Also settable per call via `providerOptions.chromeAI.allowDownload`. Requires a user activation. |

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
| `ChromeAIAvailability` | On-device model state reported by every factory's `availability()`: `'available' \| 'downloadable' \| 'downloading' \| 'unavailable'` |
| `AILanguageModelAvailability` | Alias of `ChromeAIAvailability`, kept for backward compatibility |
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

This package is built on [Chrome Built-in AI](https://developer.chrome.com/docs/ai/built-in) by [Google](https://google.com/) — on-device AI APIs powered by Gemini Nano, enabling inference directly in Chrome with no model files shipped by your app.

## License

MIT
