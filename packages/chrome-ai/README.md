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
- Implements `SummarizationModel` and `TranslationModel` from `@localmode/core`
- Automatic fallback support — pair with `@localmode/transformers` for non-Chrome browsers

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
import { summarize, translate } from '@localmode/core';
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

### Feature Detection

```typescript
import { isChromeAISupported, isSummarizerAPISupported, isTranslatorAPISupported } from '@localmode/chrome-ai';

if (isChromeAISupported()) { /* Chrome AI available */ }
if (isSummarizerAPISupported()) { /* Summarizer API available */ }
if (isTranslatorAPISupported()) { /* Translator API available */ }
```

## Acknowledgments

This package is built on [Chrome Built-in AI](https://developer.chrome.com/docs/ai/built-in) by [Google](https://google.com/) — on-device AI APIs powered by Gemini Nano, enabling zero-download inference directly in Chrome.

## License

MIT
