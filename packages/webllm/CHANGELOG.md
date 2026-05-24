# @localmode/webllm

## 2.1.0

### Minor Changes

- Added Qwen 3.5 models — `Qwen3.5-4B-q4f16_1-MLC` (2.39 GB, 32K context) and `Qwen3.5-9B-q4f16_1-MLC` (5.06 GB, 32K context), bringing catalog to 32 curated models
- Added `useIndexedDBCache` model setting for Chrome MV3 extension compatibility (avoids `Cache.add()` failures on large downloads)
- Added `cacheBackend` model setting for explicit cache backend selection (`'cache'`, `'indexeddb'`, or `'cross-origin'`)
- Added `appConfig` model setting to pass custom WebLLM `AppConfig` to `CreateMLCEngine()`
- Engine reload fallback — automatically retries via `engine.reload()` when initial load progress doesn't reach completion

### Fixed

- `loadPromise` is now cleared on load failure so transient errors don't permanently brick the model instance
- `AudioPart` content no longer routed through the image preprocessor — only `ImagePart` is processed as vision input

### Changed

- Bumped `@mlc-ai/web-llm` from `^0.2.82` to `^0.2.83`

## 2.0.0

### Major Changes

- Curated model list with 30 models including Phi 3.5 Vision
- Enhanced provider, model, and type definitions for improved model management

### Patch Changes

- Updated dependencies
  - @localmode/core@2.0.0

## 1.0.2

### Patch Changes

- bump to v1.0.2
- Updated dependencies
  - @localmode/core@1.0.2

## 1.0.1

### Patch Changes

- d311bd7: update package metadata and readme files
- Updated dependencies [d311bd7]
  - @localmode/core@1.0.1
