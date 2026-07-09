# @localmode/chrome-ai

## 2.2.0

### Minor Changes

- **Fixed: the Summarizer and Translator were unreachable on every modern Chrome.** Both implementations read the legacy `self.ai.summarizer` / `self.ai.translator` namespace, which Chrome removed; `isChromeAISupported()` was `'ai' in self`, so it returned `false` on exactly the browsers where the APIs exist. They now read the top-level `self.Summarizer` / `self.Translator` globals, keeping the legacy namespace as a fallback. `isChromeAISupported()` now reports whether _any_ built-in AI API is present.
- **Fixed: `SummarizerType` is `'tldr'`, not `'tl;dr'`.** Passing `'tl;dr'` made Chrome throw `TypeError: The provided value 'tl;dr' is not a valid enum value of type SummarizerType`. The `type` option on `ChromeAISummarizerSettings` (and its default) is now `'tldr'`.
- Summarizer and Translator now gate on `availability()` and accept `allowDownload` + `onProgress`, matching the language model. Without `allowDownload` they throw rather than silently starting a large, browser-wide model download.
- Summarizer and Translator now throw typed `SummarizationError` / `TranslationError` (with actionable hints) instead of a bare `Error`, and a failed `create()` no longer poisons the cached session promise.
- The `availability()` gate in both is raced against a 3s deadline (`CHROME_AVAILABILITY_TIMEOUT_MS`). `Translator.availability()` has been observed never to settle on some Chrome builds, so an unresponsive probe now falls through to `create()` rather than hanging the call.
- Added the `ChromeAIAvailability` type (`'available' | 'downloadable' | 'downloading' | 'unavailable'`); `AILanguageModelAvailability` is now an alias of it.
- Corrected the documented Prompt API requirement to **Chrome 148+** for web pages (Chrome 138 shipped it for extensions only). Summarizer and Translator remain Chrome 138+.
- docs: replace the README "Demo" badge with "UI Components" (localmode.ai) and add a "Blocks & Apps" badge linking to the localmode.ai/blocks gallery

## 2.1.0

### Minor Changes

- Added `LanguageModel` implementation (`ChromeAILanguageModel`) wrapping Chrome's Prompt API (Gemini Nano) with `doGenerate()`, `doStream()`, `warmUp()`, `isReady()`, and `destroy()` lifecycle methods
- Added `isPromptAPISupported()` utility to check Prompt API availability before model creation
- Exported Chrome AI API type declarations (`AILanguageModel`, `AILanguageModelAvailability`, `AILanguageModelCreateOptions`, `AILanguageModelFactory`, `AILanguageModelPromptOptions`, `ChromeAILanguageModelSettings`)
- Exported `ChromeAILanguageModel` class for direct instantiation

### Fixed

- Removed dead-code `finishReason` ternary (`stopped ? 'stop' : 'stop'`) in both `doGenerate` and `doStream` — Chrome's Prompt API does not expose token-limit truncation, so `finishReason` is always `'stop'`

## 2.0.0

### Major Changes

- New package: Chrome Built-in AI provider for zero-download inference via Gemini Nano
- Summarization and translation implementations
- Automatic capability detection and fallback to `@localmode/transformers`

### Patch Changes

- Updated dependencies
  - @localmode/core@2.0.0
