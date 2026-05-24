# @localmode/chrome-ai

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
