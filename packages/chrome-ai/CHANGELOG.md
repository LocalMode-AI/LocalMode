# @localmode/chrome-ai

## 2.2.1

### Patch Changes

- fix: a response Chrome cuts at its output cap is no longer reported as an oversized input. Chrome 153 ends such an answer by rejecting the prompt with a `QuotaExceededError` reading "The response exceeded output limits and was truncated."; the provider mapped it to `chrome-ai-quota-exceeded` ("input exceeded Gemini Nano's token budget") and, in `doStream()`, threw away the text Chrome had already streamed. Now `doStream()` keeps that text and ends with `finishReason: 'length'` (a truncated answer, like every other runtime at its token limit), and `doGenerate()`, where Chrome delivers nothing, fails with the new code `chrome-ai-output-truncated` and a hint to stream or ask for a shorter answer. An input that really is too long still maps to `chrome-ai-quota-exceeded`. Seen in the wild on two Apple laptops running the LocalMode Bench long-context lane on Chrome 153, intermittently.

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
