# @localmode/chrome-ai

## 2.3.0

### Minor Changes

- Added `chromeAI.languageDetector(settings?)` (`ChromeAILanguageDetector`), a `LanguageDetectionModel` over Chrome's built-in Language Detector API (`self.LanguageDetector`, Chrome 138+ desktop), so `detectLanguage()` from `@localmode/core` runs on it. Results map Chrome's `{ detectedLanguage, confidence }` to `{ languageCode, confidence }`, highest first, with Chrome's `und` entry dropped; `topK` (settings or `providerOptions.chromeAI.topK`) keeps the most confident candidates. Gates on `availability()` with the 3 s deadline; `allowDownload` (settings or `providerOptions.chromeAI.allowDownload`) and `onProgress` as in the other models. Errors are `TranslationError`s coded `chrome-ai-not-supported`, `chrome-ai-model-not-available`, `chrome-ai-download-required`, `chrome-ai-permissions-denied`, `chrome-ai-quota-exceeded` or `chrome-ai-detection-failed`; aborts surface as `AbortError`. `warmUp()`, `isReady()`, `destroy()`.
- Added `isLanguageDetectorSupported()` (synchronous, never throws); `isChromeAISupported()` now also counts the Language Detector API.
- Exported `ChromeAILanguageDetectorSettings`, `AILanguageDetector`, `AILanguageDetectorFactory`, `AILanguageDetectorCreateOptions` and `AILanguageDetectionResult`.
- The `@localmode/core` peer range is now `>=2.2.0`, the oldest core that exports the language detection types.
- Language detector errors coded `chrome-ai-not-supported`, `chrome-ai-model-not-available`, `chrome-ai-download-required`, `chrome-ai-permissions-denied` or `chrome-ai-quota-exceeded` carry `retryable: false`, so `detectLanguage()` (core 2.6.0+) fails at once rather than retrying after the user activation has expired; `chrome-ai-detection-failed` stays retryable.
- Added streaming for the Summarizer and the Translator: `ChromeAISummarizer.doStreamSummarize({ text, context?, maxLength?, abortSignal?, providerOptions? })` and `ChromeAITranslator.doStreamTranslate({ text, sourceLanguage?, targetLanguage?, abortSignal? })` read Chrome's `summarizeStreaming()` / `translateStreaming()` and yield `{ text, done: false, timestamp }` per chunk (`performance.now()` on arrival), then `{ done: true, timing: { requestedAt, firstChunkAt, endedAt, chunkCount, chars }, usage }`. Errors: `chrome-ai-streaming-not-supported` (`retryable: false`), `chrome-ai-summarization-failed` / `chrome-ai-translation-failed` with Chrome's error as `cause`; an abort surfaces as `AbortError`.
- Added `measureInputUsage()`, `getInputQuota()` and `getModelInfo()` on both (translator: per pair). `getModelInfo()` returns `availabilityAtCreate`, `requestedOptions`, `sessionOptions` as the session reports them, `inputQuota`, `browser` and `modelVersion: null` (Chrome exposes no model version to pages; read it from `chrome://components`).
- Added `outputLanguage`, `expectedInputLanguages` and `expectedContextLanguages` to the summarizer settings (and `providerOptions.chromeAI`), forwarded to `availability()` and `create()` only when set; setting `outputLanguage` removes Chrome's "No output language was specified" console warning. `getModelInfo()` records all three.
- Added `getChromeBuildInfo()`: `userAgent`, `brands`, `fullVersionList`, `platform`, `platformVersion`, `architecture` from `navigator.userAgentData`, `null` where absent; never throws.
- `chromeAI.summarizer()` / `chromeAI.translator()` are now typed as `ChromeAISummarizer` / `ChromeAITranslator` (still `SummarizationModel` / `TranslationModel`).
- Fixed: a `providerOptions.chromeAI` override of `length` alone was ignored, and any `providerOptions.chromeAI` with `type`, `format` or `sharedContext` recreated the summarizer session on every call; the session is now recreated only when a creation option changes.
- docs: `onProgress` on every model receives a fraction (`loaded` from 0 to 1, `total` 1), not bytes; the JSDoc and README now say so.

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
