# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.16.23] - 2026-10-28

**Released:** `@localmode/bench` 0.11.0.

### Changed

- **ui:** the pinned sample item lists of the `/bench/tasks` page (`src/lib/bench/task-item-lists.ts`, regenerated with `scripts/pin-task-item-lists.ts`) follow the translation and language-identification item lists re-drawn from FLORES+ devtest (source commit `1147e2dc59f37fbb5c22fd8478770de02cd399f9`; whitespace normalised, one corrected reference, Chinese as `cmn_Hans`): the five translation and five FLORES language-ID lists get new item digests and file SHA-256s at unchanged counts, the WiLI list a new file SHA-256 (its Chinese rows name `cmn_Hans`) with its item digest unchanged, and the e2e pilot lists `pilot-e2e-translate-flores-5`, `pilot-e2e-translate-flores-1` and `pilot-e2e-detect-flores-5` new digests. The seven summarization lists are unchanged.
- **bench 0.11.0, ui:** the task item-list protocol therefore changes for those lists: `TASKS_PROTOCOL_VERSION` is `tasks/2`, which the page records on every session (`harness.control.tasks.protocol`). Submissions must carry `tasks/2`; `validateRunShape(run, { anyProtocol: true })` still reads an archived `tasks/1` session, which is never re-scored. Options and rules are those of `tasks/1`; `localmode-bench/5`, schema 3 and plausibility rules 2 are unchanged.

### Documentation

- **bench (docs):** `packages/bench/NOTES.md` (Task sessions) records `tasks/2` and the task protocol history.

## [2.16.22] - 2026-10-28

**Released:** `@localmode/bench` 0.10.1.

### Fixed

- **ui:** on /bench/tasks the Translator pairs created from the Run click are created one at a time in the plan's order, each with its own `availability()` reading and `create()` span as its cell's load (`createOrder`, `activationAtCreate` recorded); before, they were created together and shared one span.
- **bench 0.10.1, ui:** a task cell's download bytes are measured on the model's own profile folders (`TranslateKit`, `OptGuideOnDeviceModel`, `optimization_guide_model_store`): the driver's per-click reading, else the session's folder sizes, as `modelBytesDelta`; the whole-profile change is kept apart as `wholeProfileBytesDelta`.

### Documentation

- **ui, bench (docs):** the `/bench/methodology` control-runs list and `packages/bench/NOTES.md` (The kinds) name the export-only `chrome-ai-tasks` kind: Chrome's built-in Summarizer, Translator and Language Detector against open fallbacks run in the page, per item; the protocol stays `localmode-bench/5` and its schema fields are additive. Docs only.

## [2.16.21] - 2026-10-28

**Released:** `@localmode/chrome-ai` 2.3.0, `@localmode/core` 2.6.0, `@localmode/transformers` 4.2.0, `@localmode/bench` 0.10.0.

### Added

- **chrome-ai 2.3.0:** `chromeAI.languageDetector()` implements `LanguageDetectionModel` over Chrome's Language Detector API (Chrome 138+ desktop): BCP 47 codes with confidences, `und` dropped, optional `topK`, the same `availability()` gate, 3 s deadline, `allowDownload` opt-in and `chrome-ai-*` error codes as the other models, and an `isLanguageDetectorSupported()` guard; the core peer range moves to `>=2.2.0`.
- **chrome-ai 2.3.0:** streaming for the Summarizer and the Translator: `doStreamSummarize()` / `doStreamTranslate()` over Chrome's `summarizeStreaming()` / `translateStreaming()`, each chunk stamped with `performance.now()` and a final item with request, first-chunk and end times; `measureInputUsage()`, `getInputQuota()` and `getModelInfo()` (availability at creation, create options as requested and as the session reports them, `inputQuota`, the Chrome build) on both; `getChromeBuildInfo()` reads `brands` and `fullVersionList`. The summarizer takes `outputLanguage`, `expectedInputLanguages` and `expectedContextLanguages` (unset by default; `outputLanguage` silences Chrome's missing-language warning).
- **core 2.6.0:** `isRetryableError()` returns `false` for a `ValidationError` or an error with `retryable: false`, and `detectLanguage()` rethrows such an error at once instead of retrying with 1 s and 2 s waits; chrome-ai sets `retryable: false` on its not-supported, model-not-available, download-required, permissions-denied and quota-exceeded errors.
- **core 2.6.0:** `getLanguageName()` resolves script- and region-tagged BCP 47 codes to the base language (`zh-Hans` → `Chinese`).
- **transformers 4.2.0:** the translator gives multi-target Opus-MT models their sentence-initial target token as one vocabulary id: `Xenova/opus-mt-en-zh` gets `>>cmn_Hans<<` and `Xenova/opus-mt-en-ar` gets `>>ara<<` (both previously ran without one; `en-zh` turned `Hello.` into an unrelated sentence). `targetLanguageToken` (setting or per-call `providerOptions.transformers`) picks another token or turns it off with `false`; a `>>id<<` at the start of the text is honoured the same way, where Transformers.js would otherwise split it into sub-word pieces. Exports `OPUS_MT_TARGET_LANGUAGE_TOKENS` and `resolveTargetLanguageToken()`.
- **transformers 4.2.0:** `revision` on `createTransformers()` and every model factory pins the Hugging Face branch, tag or commit each load requests (default `'main'`, unchanged).
- **bench 0.10.0:** export-only control kind `chrome-ai-tasks` with the `tasks/1` sub-protocol: `runTaskSession()` runs one task (summarize, translate, detect-language) over one item list, one item per call, with per-item streaming stamps, availability before/at/after `create()`, `inputQuota`, `measureInputUsage()`, download capture, a per-item watchdog and a finalize handshake that adds captures taken outside the page before the digest; validator rules kept, adapted or skipped for task cells; per-item `inputTruncated`, `inputTokens` and `modelMaxTokens` fields inside the digest, and the `transformers-wasm-current` runtime id for a fallback run through the current-releases bundle; `runBenchmarkSuite` and the submit route refuse the kind.
- **ui:** unlinked, unindexed `/bench/tasks` page for task sessions: item lists from a local item server, each pinned by a compiled digest; Chrome's Summarizer, Translator and Language Detector against Transformers.js DistilBART-CNN / Opus-MT (q8 or fp32, explicit device, revision pinned by request rewriting and a SHA-256 check of every loaded file) and MediaPipe's detector (CPU delegate, pinned WASM path); `window.__benchTasks` driver contract (`bench-tasks-driver/1`); Export JSON only. Every sample list is pinned (file, file SHA-256, count, item digest; `scripts/pin-task-item-lists.ts`). A Translator pair whose pack `chrome://components` lists is created inside the Run click (Chrome reports an installed pack `downloadable` in a new process until then) and its `create()` span is the cell's load. Fallback items record input truncation. A secondary `transformers-wasm-current` arm runs the same pinned q8 files through the current-releases Transformers.js on WASM. `/bench/run?control=chrome-ai-tasks` and `collect-control-runs.ts` refuse the kind.
- **tests:** `packages/chrome-ai/tests/streaming.test.ts` runs streaming, abort, quota, model info and `getChromeBuildInfo()` against fake `Summarizer` / `Translator` globals that return real `ReadableStream`s.
- **tests:** `packages/chrome-ai/tests/language-detector.test.ts` runs the model and `detectLanguage()` against a fake `LanguageDetector` global; `packages/core/tests/language-detection.test.ts` covers the single attempt for a non-retryable error, backoff for others, and BCP 47 name lookup. The real-Chrome path was checked by hand (eight languages, `und` dropped, `topK`, a fresh-profile download; streamed summaries and en to de translations in Chrome 156).
- **tests:** `packages/transformers/tests/opus-mt-target-token.integration.ts` (in `test:validate`) translates with the real en-zh and en-ar models at pinned revisions, with and without the token; `revision.test.ts` and `translator-target-token.test.ts` cover the load option and token selection; the writing-tools e2e lanes assert the size labels and that only fp32 weights are fetched.
- **tests:** bench unit tests for the kind, every validator rule, the session runner and the analysis CLI; `scripts/bench-tasks.test.ts`; `e2e/bench/tasks.spec.ts` drives the page in an installed Chrome with built-in AI reachable.

### Fixed

- **chrome-ai 2.3.0:** a `providerOptions.chromeAI.length` override on the summarizer is applied, and the session is recreated only when a creation option changes, not on every call.
- **transformers 4.2.0:** the catalog size of Granite 4.0 350M is its q4 file set, 580,070,509 bytes (declared ~120MB).
- **ui:** the writing-tools summarize and translate size labels state the fp32 file sets the Transformers.js fallback loads: DistilBART ~1.13 GB, Opus-MT ~416-517 MB per pair (declared ~120 MB and ~80 MB); gallery badges follow. The blocks stay on fp32: q8 DistilBART and Opus-MT fail to create a WASM session in the browser under Transformers.js 4.2 (`TransposeDQWeightsForMatMulNBits Missing required scale`), while q8 works in Node.

### Documentation

- **chrome-ai:** `onProgress` receives a fraction (`loaded` 0 to 1, `total` 1), not bytes, now stated in the JSDoc and README for all four models.
- **transformers:** `quantized` defaults to `false` (fp32), as the code always did; the JSDoc, README and docs said `true`.

## [2.16.20] - 2026-10-23

**Released:** `@localmode/bench` 0.9.14, `@localmode/transformers` 4.1.5, `@localmode/litert` 2.0.4.

### Added

- **bench:** three export-only control run kinds, each in the protocol order with every lane at the protocol's configuration, each recorded as `harness.control.kind`, refused by the submit route (422 `control-run`), filed by `scripts/collect-control-runs.ts` under `controls/<kind>/<YYYY-MM-DD>/`, and refused by `scripts/import-exported-run.ts`:
  - `current-releases` (`/bench/run?control=current-releases`) runs Transformers.js 4.3.1 (with ONNX Runtime Web 1.31.0-dev.20260914), WebLLM 0.2.86, wllama 3.8.1 (and its compatibility build at the same version) and LiteRT-LM 0.18.0 instead of the pinned releases. `apps/ui` installs them under npm aliases (`@huggingface/transformers-current`, `@mlc-ai/web-llm-current`, `@wllama/wllama-current`, `@litert-lm/core-current`), and `scripts/build-current-release-providers.ts` (`pnpm bench:current-releases`, run by `predev` and `prebuild`) builds a second bundle of the four provider packages from their unchanged source against those releases (wllama's CDN pins moved to 3.8.1) into `src/lib/bench/current-releases/`, loaded only on this kind (the Transformers.js WASM worker loads it too). The run records `harness.control.runtimeVersions`, and every cell of the changed lanes records `runtimeConfig.runtimeVersion` (and `runtimeVersion`). On LiteRT-LM 0.18 the lane keeps text the engine streams on the thought channel, inline in one `<think>` block (`runtimeConfig.thoughtChannel: 'inline'`). A lane that fails on a current release is recorded as an error cell.
  - `ort-profile` (`/bench/run?control=ort-profile`) attaches an ONNX Runtime Web operator profile to each Transformers.js Qwen3 0.6B generation cell (WebGPU and WASM). The timed iterations run unprofiled: ONNX Runtime keeps every profiled event in the WASM heap until the session ends, and over a Standard cell set that exhausted the WASM lane's heap (`std::bad_alloc` within 32 to 40 runs at the 512-token prompt in Chrome 156 on an M4) and held about 3.8 GB on the WebGPU lane. After the model's cells, an untimed pass per cell runs in a fresh session with `enableProfiling`, in a fresh dedicated worker on either lane (a second WebGPU pass on the page's own ONNX Runtime heap, which never shrinks, failed to load the model in Chrome 156): a 4-token warmup request, then the cell's prompt and token budget, then `endProfiling()`, whose output ONNX Runtime prints through the console and the page routes into an aggregator (installed before the runtime loads). The cell's `profile` holds the node events (and on WebGPU the GPU timestamps per program) aggregated per phase, timing source, operator type, kernel and provider (at most 100 rows); a pass that runs out of WASM memory is repeated at half the budget down to 16 tokens and the failed budgets are recorded. The raw events of each pass are kept beside the run as a gzip-compressed Chrome-trace file, downloadable from the Saved exports panel.
  - `llamacpp-profile` (`/bench/run?control=llamacpp-profile`) time-stamps the llama.cpp lanes' token delivery path without changing wllama: while the engine starts, the page wraps wllama's Blob-URL module worker in a module that imports a stamp module first, and records per request and reply the page's send, the worker's receipt and reply, the page's receipt and the chunk handed to the runner, on `performance.timeOrigin + performance.now()`. Each llama.cpp generation cell carries per-request statistics (median, 90th and 99th percentile, maximum, mean and a fixed histogram of the emission, receipt and chunk gaps, the worker's time, the round trip's transit free of the page/worker clock offset, receipt to chunk and page turnaround, plus the estimated clock offset); the raw stamps are kept beside the run as a gzip-compressed JSON file. Works in Chrome and Firefox.
- **bench 0.9.14:** the kinds, `HarnessControl.runtimeVersions`, `BenchCellResult.profile` with its two shapes, the adapter profiler hook (`LoadedLLM.profiler`), the `profile-error` trace event, `summarizeGaps()`, and validator checks (`controlRuntimeVersionsError`, `runtimeVersionCellError`, `cellProfileError`); see the package changelog.
- **transformers 4.1.5:** `sessionOptions` on `languageModel()` settings, `getInferenceSessions()` and `preload()`.
- **litert 2.0.4:** `thoughtChannel: 'drop' | 'inline'` on `languageModel()` settings.
- **bench (Saved exports):** a saved run can keep files beside it (a profile run's raw profiles): listed under the run with their own Download, and included in Download all.
- **bench (protocol):** not a protocol change; the protocol stays `localmode-bench/5`, the schema 3 and the plausibility rules 2. A protocol run loads the pinned bundle and adds no profiler. `SETUP.md` section 9, `NOTES.md`, the package README and the methodology page document the kinds.
- **bench (tests):** `packages/bench/tests/release-profile-controls.test.ts` (the kinds, markers, refusals and validator checks, written red-first; a runner run through the public API whose mock profiler sees each cell's requests and none of the warmup, a failing and a partly failing `collect()` recorded as `profile-error`); `packages/transformers/tests/session-options.test.ts` (session options on both load paths, sessions exposed, `preload()` runs nothing, red-first); `packages/litert/tests/litert.test.ts` (the thought channel dropped by default, inlined in one block, closed at stream end, red-first). In `apps/ui`: `bench-ort-profile.test.ts` (the aggregation over real ONNX Runtime Web profile lines captured from Transformers.js 4.2.0 in Chrome 156, WebGPU and WASM, and a pass driven through the real console capture), `bench-llamacpp-delivery.test.ts` (the statistics, the stamp module run in a separate VM context, and the page-side Worker wrapper), `bench-current-releases.test.ts` (the committed bundles equal a fresh build, import only the current-release aliases, and point wllama at 3.8.1), `bench-control.test.ts`, `bench-saved-exports.test.ts` (attachments survive a reload and enter the archive), `bench-submit-route.test.ts` (422 for each kind; its test nonces are now unique per call, since two tests issuing one in the same millisecond shared it and the second was refused as used), `collect-control-runs.test.ts` and `import-exported-run.test.ts`; and three lanes in `e2e/bench/bench.spec.ts` (a real Quick `current-releases` run asserting each changed cell's version and that the page fetched wllama 3.8.1 and Transformers.js 4.3.1's ONNX Runtime Web build; a real Quick `llamacpp-profile` run asserting the profiles and the raw file under Saved exports; a real Standard `ort-profile` run on the WASM Qwen3 lane asserting both profiles and raw files, with a documented allowlist for the `std::bad_alloc` lines Transformers.js logs when a pass falls back, bounded by the failed budgets the profiles record), passing in Playwright's Chromium against a production build.
- **bench (real-browser check, Chrome 156 on an M4, fresh profiles):** a Quick `current-releases` run (every cell `ok`, each changed lane recording 4.3.1, 0.2.86, 3.8.1) and a Standard `current-releases` run over the six Qwen3 0.6B lanes, all `ok`: the Transformers.js 4.3.1 WebGPU language-model cells (q4) ran with coherent output on Apple Silicon, so the 4.3.0 `MatMulNBits` failure behind the pin does not reproduce on 4.3.1 on this machine, and LiteRT-LM 0.18.0 with the pinned Qwen3 file delivered its output on the content channel (no thought-channel text). A Standard `ort-profile` run over the two Transformers.js Qwen3 lanes: all four cells profiled (decode `MatMulNBits` about 88% of the WASM lane's node time, about 30% of the WebGPU lane's GPU time); an earlier build that profiled the WebGPU lane on the page failed its second pass, which is why every pass now runs in a fresh worker, and one WASM pass fell back from 128 and 64 tokens to 32 as designed. A Quick `llamacpp-profile` run: both SmolLM2 cells profiled (about 17 ms per token on the CPU lane and 8 ms on WebGPU, nearly all worker time; round-trip transit about 0.06 ms; the worker clock about 1 ms ahead of the page's). Every run file validates, and the collect tool files all four (dry run). Firefox was not available on that machine; the stamp path uses only module workers and Blob URLs.

## [2.16.19] - 2026-10-22

**Released:** `@localmode/wllama` 3.4.4, `@localmode/bench` 0.9.13.

### Added

- **bench:** a sixth control run kind, `wllama-compat`: `/bench/run?control=wllama-compat` runs the suite in the protocol order with every lane at the protocol's configuration, except that both llama.cpp lanes (`wllama-webgpu` and `wllama`, language and embedding models) load through wllama's compatibility build (`@wllama/wllama-compat`: 32-bit memory, no JSPI) instead of the memory64 build. wllama 3.5.1 starts the compatibility build by itself only on a browser without JSPI or Memory64 (Safari), and its constructor clears the compatibility resources on Firefox, so the llama.cpp lanes of every Firefox run so far ran the memory64 build; this kind measures what the other build changes. The page forces the build in every browser, so the kind is browser-independent. The run file carries `harness.control = { kind: 'wllama-compat', runtimeOrder, wllamaBuild: 'compat' }`, and each llama.cpp cell's `runtimeConfig.wllamaBuild` records the build its worker started on. The banner reads "Control run: llama.cpp lanes on the wllama compatibility build; not published to the leaderboard". Like the other kinds it is export-only: the publish toggle is locked off, the submit route answers 422 `control-run`, `scripts/collect-control-runs.ts` files it under `controls/wllama-compat/<YYYY-MM-DD>/`, and `scripts/import-exported-run.ts` refuses it. The page maps a control record to adapter settings through one function, `controlAdapterOptions()` in `apps/ui/src/lib/bench/control.ts`.
- **bench:** every llama.cpp cell records `runtimeConfig.wllamaBuild` (`memory64` or `compat`) on every run, protocol runs included: the build wllama started its worker on, as the provider recorded it, never the lane's intent. A protocol run records `memory64` in Chrome and Firefox.
- **bench 0.9.13:** `ControlKind` gains `'wllama-compat'` (`CONTROL_KINDS` lists six kinds), `HarnessControl` an optional `wllamaBuild: 'compat'` (required on that kind and refused on every other), and new exports `CONTROL_WLLAMA_BUILDS`, `controlWllamaBuildError()`, `WLLAMA_BUILDS`, `wllamaBuildError()` and the type `WllamaBuild`. `runBenchmarkSuite` refuses a wrong `wllamaBuild` marker before anything loads. `validateRunShape` rejects a `runtimeConfig.wllamaBuild` other than `compat` or `memory64`, the field on a cell that is not llama.cpp, and, on a `wllama-compat` run, a llama.cpp cell whose engine loaded with a `runtimeConfig` but without `wllamaBuild: 'compat'`. Cells without the field (every run before this release) are not checked, so archived runs still validate.
- **wllama 3.4.4:** `wasmBuild: 'auto' | 'compat'` on `languageModel()` and `embedding()` settings: `'compat'` starts the worker on wllama's compatibility build (`@wllama/wllama-compat` from the jsDelivr CDN, pinned to 3.5.1, exported as `WLLAMA_COMPAT_CDN`) in every browser, by wrapping the instance's `getWorkerResources()`; `'auto'` (the default) leaves the choice to wllama. `loadedBuild` on `WllamaLanguageModel` and `WllamaEmbeddingModel` reports the build the worker started on (`'memory64'`, `'compat'`, or null before wllama starts its worker). A runtime without `getWorkerResources()` fails a `'compat'` load with `ModelLoadError` instead of silently running the default build.
- **bench (control runs on any tier):** every control kind runs on the Quick, Standard and Thorough tiers; a Thorough-tier `fixed-order` run (`/bench/run?tier=thorough&quality=off&runs=1&cooldown=0&cold=off&control=fixed-order`) runs every Thorough cell, the Gemini Nano cells included, and exports with `harness.control.kind` `fixed-order` and `suite` `thorough`. No code change was needed; unit tests now cover it.
- **bench (protocol):** not a protocol change; the protocol stays `localmode-bench/5`, the schema 3 and the plausibility rules 2. A protocol run loads the same build as before (the page passes no build setting to the provider), and `wllamaBuild` is an additive `runtimeConfig` entry in the run file, not a `cells.csv` column. `SETUP.md` section 9, `NOTES.md`, the package README and the methodology page document the kind and the record.
- **bench (tests):** `packages/bench/tests/wllama-build.test.ts` (the kind's spec, marker, refusals and validator checks, written red-first, plus a runner run through the public API); `packages/wllama/tests/wllama.test.ts` (the build is recorded, forced, kept when wllama already picked it, and a runtime that cannot be told fails the load); `apps/ui/scripts/bench-wllama-build.test.ts` (the real adapters with a fake provider: protocol runs pass no build setting and record `memory64`, the control forces `compat` on all four llama.cpp lanes, a marked run whose lanes were not switched fails validation); `bench-control.test.ts` (parsing, banner, record, series, preset link, and the Thorough fixed-order link); `bench-submit-route.test.ts`, `collect-control-runs.test.ts` and `import-exported-run.test.ts` (refusal, filing under `controls/wllama-compat/`, and a refused `memory64` record); and a `?control=wllama-compat` lane in `e2e/bench/bench.spec.ts` (a real Quick run asserting the record and that the worker fetched `@wllama/wllama-compat`), with the fixed-order lane now asserting `memory64`.

## [2.16.18] - 2026-10-22

**Released:** `@localmode/bench` 0.9.12.

### Documentation

- **bench (docs):** the `@localmode/bench` README is rewritten as a short npm README: what the package is, install, a quick start (run a suite with injected adapters, digest, validate, aggregate with errata), the protocol in brief with the methodology link, the API grouped in one table, the analysis CLI, a control-run kinds table, errata in one paragraph, links and license. Nothing is removed: the protocol's version history, metric definitions, validity gates, the per-runtime `runtimeConfig` record, model file pinning, trace events, the environment capture, the quality-fidelity lane, control-run details, the publication rule, errata, the ONNX Runtime heap limitation, the analysis tooling and every CSV column move to the new `packages/bench/NOTES.md`, organized by topic. `SETUP.md` lists the dataset's current layout (`NOTES.md`, `native/`, `tools/`). README and docs only; no code, protocol or recorded value changes, and the protocol stays `localmode-bench/5`.

## [2.16.17] - 2026-10-22

**Released:** `@localmode/bench` 0.9.11.

### Added

- **bench:** per-cell errata. The dataset gains `index/errata.json`, a list of `{ runId, cellIds, reason, recordedAt, reference }` entries naming published cells that enter no aggregate. An erratum is an exclusion with a stated reason, never a re-score: the run file is unchanged and the cell keeps its status and values. An entry names only `ok` cells (a cell with any other status already enters no aggregate). The first entries exclude 12 cells from the 11 RTX 3080 Ti v5 Thorough runs of 12 and 13 October that loaded the replaced LiteRT Qwen3 file: each run's `litert/qwen3-0.6b/quality-mmlu-25` cell, recorded `ok` with score 0 at parse rate 0, and the first run's `litert/qwen3-0.6b/warm-reload` cell, recorded `ok` but timing the replaced file. Their pp128 and pp512 cells are already `invalid` and are not listed.
- **bench 0.9.11:** `validateErrata(errata, runs)` (with `validateErrataShape`, `errataExclusions`, `ERRATA_FILE` and the `ErratumEntry`/`ErrataTally` types) refuses a malformed list or an entry naming a run or cell the dataset does not hold, or a non-ok cell. `aggregateRuns` takes the errata as an optional third argument and `aggregateRunsWithErrata` also returns the total tally; each `LeaderboardRow` carries `excludedByErratum`, and a row whose every cell is excluded stays with zero submissions. `rowsToCSV` appends an `excludedByErratum` column. The analysis CLI reads `index/errata.json` next to the runs (or `--errata <file>`, or `--no-errata`), applies it to `leaderboard.csv`, prints the tally, writes `errata.txt`, and stops before writing anything when the file does not validate against the runs it read.
- **bench (leaderboard):** the leaderboard reads `index/errata.json` from the dataset beside `index/summary.json` (uncached, 404 meaning none), validates it against the index (`buildLeaderboardSnapshot` throws `errata-invalid`, so the board is never served with exclusions silently dropped), and `aggregateIndex` leaves the listed cells out of every median. Each row carries `excludedByErratum`, the snapshot and `GET /api/bench/leaderboard` carry the total `excludedByErratum: { cells, runs }`, and the cached snapshot key gains a shape marker (`errata-1`) so no older aggregate is served. On `/bench` a row with exclusions shows `(+N excluded by erratum)` beside its run count, and one line under the table names the exclusions on the rows shown and links to the new Errata section of `/bench/methodology`, which describes the mechanism. `apps/ui/scripts/rebuild-bench-index.ts` checks `index/errata.json` against the run files and refuses to write the index when it does not validate; the index itself is unchanged by errata.
- **bench (protocol):** not a protocol change; the protocol stays `localmode-bench/5`. Errata change no prompt, budget, policy number, gate or integrity rule and no recorded value, only which published cells the aggregates leave out, each counted and with its reason, so v5 rows stay one configuration and nothing is re-scored.
- **bench (tests):** `packages/bench/tests/errata.test.ts` (an erratum entry moves a quality median from 0.4 at n = 3 to 0.44 at n = 2 with a tally of one, written red-first against an aggregation without the exclusion; every other row unchanged; an all-excluded row kept at zero submissions; control runs not counted; twelve malformed-entry rejections; unknown run, unknown cell and non-ok cell refused) and `packages/bench/tests/analyze-cli.test.ts` (the real CLI in a child process over a dataset fixture: errata found at the root and next to `runs/`, `--no-errata`, refusal with nothing written for an unknown run or a malformed entry, `index/` never read as runs). In `apps/ui`: `bench-store.test.ts` (`aggregateIndex` and `buildLeaderboardSnapshot` with errata, red-first), `bench-leaderboard-cache.test.ts` (the API response carries the tally; a listed cell leaves its row and every other row is unchanged; errata naming an unknown run give an empty, logged board), `rebuild-bench-index.test.ts` (errata checked against run files; refusal with nothing written) and `bench-leaderboard-errata-note.test.ts` (the table's per-row count and note, rendered in jsdom).

## [2.16.16] - 2026-10-21

**Released:** `@localmode/litert` 2.0.3, `@localmode/wllama` 3.4.3, `@localmode/bench` 0.9.10.

### Fixed

- **litert:** the catalog model URLs are pinned to a repository revision instead of `resolve/main`. The `litert-community/Qwen3-0.6B` repository replaced `Qwen3-0.6B.litertlm` on 2026-10-12 (commit a6e678a1) and 2026-10-13 (e6687177) with builds made for litert-lm 0.18.0. On the `@litert-lm/core` 0.12.1 this package uses, their chat template iterates content parts only, so the string turn the engine passes renders an empty user turn, and the reply arrives on the `thought` channel, which the provider does not read: a browser that downloaded the file after 2026-10-12 got empty or prompt-ignoring text, while browsers holding the earlier file in the `litert-models` Cache API kept running it (the provider caches by URL and never revalidates). `qwen3-0.6B` is pinned to a3c5d805 (sha256 `555579ff...6e5ab0b4`, 614,236,160 bytes: the file the catalog's `sizeBytes` always named, unchanged from 2026-07-17 to 2026-10-12), `gemma-4-E2B` to 73d35ec3 and `gemma-4-E4B` to 4f479a5f (both unchanged since 2026-05-19). `LiteRTModelEntry` gains an optional `sha256` (the file's LFS sha256 at the pinned revision), set on all three. The Cache API key is the URL, so each browser downloads the pinned file once; the old `resolve/main` entries stay in `litert-models` until the cache is cleared. The README and the docs (`/docs/litert`, `/docs/litert/models`) say why a `repo:file` shorthand or a `resolve/main` URL is not reproducible, and their Qwen3 examples use the catalog id or the pinned URL.
- **litert:** `LiteRTLanguageModel.loadInfo` (new; type `LiteRTLoadInfo`, exported) reports what the loaded engine runs: `requestedBackend` (`'GPU'` for an explicit GPU setting or LiteRT-LM's default streaming GPU backend, `'CPU'` when the setting or the WebGPU probe pinned the CPU), `backend` after the automatic CPU retry that follows a GPU backend refusing a stream load ("Streaming ... is not supported yet"), `gpuFallback`, `modelUrl`, and `modelBytes` (the bytes the engine read from the stream that loaded it: the download, or the cached file). It is `null` before the first generation and after `unload()`. Until now the backend the engine ended on was not observable: on 0.12.1 the GPU backend refuses the Qwen3 0.6B stream with every revision of the file, so that model runs on the CPU backend in WebGPU browsers too.
- **wllama:** the catalog URLs of the five GGUF files the bench loads are pinned to the revisions they have had since before the bench's protocol v5 (each checked with the Hugging Face API: size equal to the catalog's `sizeBytes`, no later commit to the file): `Qwen3-0.6B-Q4_K_M` f2d6f9ca (2025-06-23), `Llama-3.2-1B-Instruct-Q4_K_M` 9971ce1b (2024-09-25), `Gemma-4-E2B-IT-Q4_K_M` 81012ba3 (2026-07-26), `bge-small-en-v1.5-Q8_0` d32f8c04 (2024-02-17), `SmolLM2-135M-Instruct-Q4_K_M` d255afaf (2024-10-31). Same file bytes; the URL change means one re-download per browser. The other catalog entries are unchanged.
- **bench:** the LiteRT and llama.cpp lanes download pinned files: `apps/ui/src/lib/bench/catalog.ts` carries the pinned LiteRT and GGUF URLs (equal to the provider catalogs, as the drift guard requires), and `apps/ui/scripts/bench-catalog.test.ts` fails when any bench lane's file URL (its own, or the provider catalog's it loads) or any LiteRT catalog entry is not pinned to a 40-hex revision. The lanes that load by provider model id (Transformers.js ONNX repositories, WebLLM MLC builds) resolve `main` inside their libraries and are not pinned by this change.
- **bench:** the LiteRT lane's `resolvedBackend` follows the engine instead of a WebGPU probe. The adapter recorded `gpu` whenever the browser had a WebGPU adapter, while the provider retried on the CPU backend after the GPU backend refused the stream, so LiteRT Qwen3 cells recorded `gpu` for runs that most likely ran on the CPU (observed on Chrome 156 / Apple M4 with every revision of the file; the archived cells carry no record of the backend that ran). The record now comes from `loadInfo`: `gpu` or `cpu` from the backend the engine loaded on, `unknown` before it loaded (the provider loads on first use), and the warm-reload handle gets an untimed `settle()` that loads the engine with the warmup probe, as on the llama.cpp lanes. LiteRT cells now carry `runtimeConfig`: `modelRevision` (the pinned commit, or `unpinned`), `webgpu_adapter`, and once loaded `modelBytes`, `requestedBackend` (`gpu`/`cpu`) and, after a GPU attempt, `gpu_fallback`.
- **bench 0.9.10:** `validateRunShape` rejects a LiteRT cell whose `resolvedBackend` disagrees with its load report (new export `liteRtLoadReportError()`): with `requestedBackend: 'cpu'` the backend must be `cpu` and `gpu_fallback` absent; with `'gpu'`, `gpu_fallback` must be a boolean and the backend `cpu` when it is `true`, `gpu` otherwise; `modelRevision` must be a 40-hex commit or `unpinned` and `modelBytes` a positive integer. Cells without the record (every LiteRT cell before 0.9.10) are not checked, so archived runs still validate. The fields are additive `runtimeConfig` entries in the run file (not `cells.csv` columns); the schema stays 3 and the plausibility rules stay 2.
- **bench (protocol):** not a protocol change; the protocol stays `localmode-bench/5`. No prompt, budget, policy number or integrity rule changes, and the pin restores the file every valid v5 LiteRT Qwen3 cell measured (every run whose browser cached the file before 2026-10-12 04:00:59 UTC), so v5 rows stay one configuration. Moving the lane to the new file or to a newer litert-lm would change the model and its template contract and would need a version bump. No run is re-scored: the dataset README documents the 11 published v5 Thorough runs (one RTX 3080 Ti, 12 and 13 October) whose LiteRT Qwen3 cells loaded the 2026-10-12 file; their pp128 and pp512 cells are already `invalid` (degenerate output), and their `quality-mmlu-25` cell is recorded `ok` with score 0 at parse rate 0. The leaderboard has no per-cell exclusion, so that cell still enters the quality median of its row. The methodology page (Model load; a known model-file limitation), `packages/bench/README.md` and `SETUP.md` section 4 describe the pin, the record and the rule for moving a lane to a new file.
- **bench (tests):** `packages/litert/tests/litert.test.ts` covers the pins (40-hex revision, sha256, the Qwen3 revision and size) and `loadInfo` (null before load, default GPU load, GPU refusal with the CPU retry's bytes, CPU pinned without a GPU attempt, a multi-chunk byte count, cleared by `unload()`); its engine mock now reads the model stream to the end, as the real engine does. `packages/bench/tests/litert-load-report.test.ts` covers `liteRtLoadReportError` (agreeing, archived and contradicting records, malformed fields) and `validateRunShape`. `apps/ui/scripts/bench-litert-load-report.test.ts` drives the real LiteRT adapter and the real provider source over a fake `@litert-lm/core` that reads the stream and can refuse a GPU load (before load, GPU refusal, GPU accepted, no WebGPU device, `settle()`), and the real runner, whose timed and warm-reload cells carry the same record and validate. A new lane of `e2e/bench/bench.spec.ts` runs Qwen3 0.6B on LiteRT alone (Standard, quality on) and checks that the page fetched only the pinned file, every timed iteration follows the prompt, the MMLU parse rate is above 0, and every LiteRT cell records the revision, 614,236,160 bytes and a backend consistent with its report.

## [2.16.15] - 2026-10-21

**Released:** `@localmode/bench` 0.9.9.

### Added

- **bench:** two control-run kinds that split the two changes `wasm-default` makes to the Transformers.js WASM lane: `wasm-q8` (`/bench/run?tier=standard&quality=off&runs=6&cooldown=5&cold=off&control=wasm-q8`) loads the lane's models at dtype `q8` and leaves ONNX Runtime's WASM thread count at the runtime's own default (the page does not set `numThreads`; ONNX Runtime applies `min(4, ceil(cores / 2))` on a cross-origin-isolated page), and `wasm-threads` (`/bench/run?tier=standard&quality=off&runs=6&cooldown=5&cold=off&control=wasm-threads`) keeps the protocol's files (`q4` language model, `fp32` embedding model) and sets the thread count to `navigator.hardwareConcurrency`. With `fixed-order` (neither change) and `wasm-default` (both) the four kinds form a 2x2 factorial over the dtype and the thread count; the Standard tier is the smallest suite with a Transformers.js WASM language-model cell. Both run the protocol's runtime order, every other lane and every rule is the protocol's, and the run file carries `harness.control.wasmLane` = `{ dtype: 'q8', numThreads: null, simd: true }` (`wasm-q8`; `null` because the page left the thread count to the runtime) or `{ dtype: 'q4', numThreads, simd: true }` (`wasm-threads`); each `transformers-wasm` cell records the `dtype` its model loaded at and the `numThreads` ONNX Runtime ran with. The banners read "Control run: Transformers.js WASM lane at q8, runtime thread default; not published to the leaderboard" and "Control run: Transformers.js WASM lane at q4 on all cores; not published to the leaderboard". Both are export-only like the other kinds: the publish toggle is locked off, no upload token is fetched, `POST /api/bench/submit` refuses them with 422 `control-run`, `collect-control-runs.ts` files them under `controls/wasm-q8/` and `controls/wasm-threads/`, `import-exported-run.ts` refuses them, `aggregateRuns` leaves them out of every leaderboard row, `runs.csv` names them in `controlKind`/`controlRuntimeOrder`, and a paid-study link carrying either is refused. The kinds come from one per-kind table (`CONTROL_WASM_LANE_SPECS`, a dtype and a thread policy per WASM-lane kind) that the record, the validator, the page and the adapters read: the `transformers-wasm` adapters send the worker only what a kind changes (`dtype: 'q8'` when the lane loads q8, `numThreads` when the page sets it). The `order-reversed`, `fixed-order` and `wasm-default` records, and the settings `wasm-default` applies, are unchanged; the unknown-kind message lists the five kinds, and the refusal of a `wasmLane` on an order kind names the three WASM-lane kinds. `packages/bench/README.md` (Control runs), `SETUP.md` section 9 and the methodology page describe the two kinds and their links.
- **bench 0.9.9:** `ControlKind` gains `'wasm-q8'` and `'wasm-threads'`; `HarnessControlWasmLane.dtype` is `'q8' | 'q4'` and `numThreads` is `number | null`; new exports `CONTROL_WASM_LANE_SPECS` and the type `ControlWasmLaneSpec`; `createHarnessControl('wasm-threads', { numThreads })` requires a thread count and `createHarnessControl('wasm-q8')` refuses one. A control run is never submitted, published or scored, so the protocol stays `localmode-bench/5`, the schema stays 3 and the plausibility rules stay 2; no run is re-scored.

### Fixed

- **bench:** the llama.cpp lanes' record now follows the engine's offload report. A `wllama-webgpu` cell whose engine offloaded no layer (llama.cpp printed `offloaded 0/M layers`, or no offload line at all, which it does when it finds no GPU device) recorded `resolvedBackend: 'webgpu'` from the lane's prediction while `runtimeConfig.offloadedLayers` read `unreported`; `resolvedBackend` is now `webgpu` only when at least one layer was offloaded and `wasm` otherwise, and is `unknown` (never the prediction) when the record is read before the engine loaded. The shape is additive: `offloadedLayers` keeps its values, and a cell of a lane that requested GPU layers (`n_gpu_layers` not 0) whose engine loaded also carries `gpu_fallback: boolean` in `runtimeConfig` (`true` when no layer was offloaded, so the WebGPU lane ran on the CPU; absent on the CPU lane and before the engine loads; in the run file only, not a `cells.csv` column).
- **bench:** `warm-reload` cells of the llama.cpp lanes always read `offloadedLayers: "unreported"` with the lane's requested backend, because wllama loads on first use and the warm reload never used the model. After the warm reload's timed span the runner now calls the reloaded handle's optional, untimed `settle()` (new on `LoadedLLM`/`LoadedEmbedder`), which the wllama adapters implement by sending the warmup probe, as the timed cells' warmup does, so the warm-reload cell carries the same offload report as the timed cells. The timed span is unchanged (it still measures the provider's preload path); a `settle()` failure keeps the warm-reload cell with the record as read; adapters that load eagerly have no `settle()` and are read as before.
- **bench 0.9.9:** `validateRunShape` rejects a cell whose `resolvedBackend` disagrees with its offload report (new export `offloadReportError()`): with `offloadedLayers: "N/M"` the backend must be `webgpu` when N > 0 and `wasm` when N = 0; `gpu_fallback` must be a boolean, set only on a lane that requested GPU layers, `true` exactly when no layer was offloaded, with the matching backend. An `unreported` cell without `gpu_fallback`, the record of every run before 0.9.9, is not checked, so every archived run still validates; no run is re-scored. Runs from earlier builds keep their record: read an `unreported` `wllama-webgpu` timed cell there as a CPU run.
- **bench (docs):** corrected the 0.9.8 note on the Transformers.js `bge-small-en` pairing in `packages/bench/README.md`, `packages/bench/CHANGELOG.md` and the dataset's `SCHEMA.md`. It read as if the WASM lane's embedding preload fetched the q8 file only before 0.9.8; on a protocol run it still does in every release so far, while the timed model uses the fp32 file, so that pairing's cold-start `load` segment measures the preload and the fp32 download falls in the first warmup (the `wasm-threads` control run keeps this, as it keeps the protocol's files). "Before 0.9.8" applied to the record: since bench 0.9.8 (site build 2.16.14) `runtimeConfig.dtype` names the loaded dtype. The preload is unchanged, since changing it would be a protocol change.
- **bench (tests):** `packages/bench/tests/control-run.test.ts` covers the spec table, both kinds' order and record (key order and the explicit `null` included), the `createHarnessControl` refusals, the validator and the runner on wrong `wasmLane`s, digest and validation of a real suite run, aggregation and `runs.csv`, and `wasm-default`'s unchanged record. `apps/ui/scripts/bench-wasm-lane.test.ts` checks the settings each kind sends to the worker and the `runtimeConfig` it records, and the worker handler for each (`wasm-q8`: q8 files, no thread count set, the runtime default read back; `wasm-threads`: the provider's own files, the thread count set before the first session). `bench-control.test.ts`, `bench-submit-route.test.ts`, `collect-control-runs.test.ts` and `import-exported-run.test.ts` cover the page parsing and refusals, banners, records, series state and preset links, the 422, filing under `controls/<kind>/` and the import refusal. `packages/bench/tests/offload-report.test.ts` covers `offloadReportError` (agreeing, archived and contradicting records) and the runner's warm-reload `settle()` (called after the timed span, its failure keeping the cell, adapters without it). `apps/ui/scripts/bench-wllama-offload.test.ts` drives the real wllama adapters over a fake provider whose engine loads on first use (before load, full offload, no offload line, 0 layers, the CPU lane, the embedding lane, `settle()`), and the real runner with the real adapter, whose timed and warm-reload cells agree and validate. Two new lanes of `e2e/bench/bench.spec.ts` run a real Quick suite from `?control=wasm-q8` and `?control=wasm-threads` and check the exported record, every `transformers-wasm` cell's `runtimeConfig` (`q8` with ONNX Runtime's default thread count; the protocol's `fp32` with `numThreads` equal to `navigator.hardwareConcurrency`), which ONNX file the lane fetched, and that no bench API request is made.

## [2.16.14] - 2026-10-17

**Released:** `@localmode/bench` 0.9.8.

### Added

- **bench:** a third control-run kind, `wasm-default`, on `/bench/run?control=wasm-default` (for example `/bench/run?tier=standard&quality=off&runs=6&cooldown=5&cold=off&control=wasm-default`; the Standard tier, because it is the smallest suite with a Transformers.js WASM language-model cell, Qwen3 0.6B). It runs the suite in the protocol's runtime order with the Transformers.js WASM lane at the runtime's own defaults instead of the protocol's configuration: the lane's models load at dtype `q8` (Transformers.js 4.2's default on the WASM device; a protocol run loads the language model's `q4` files, which the provider uses on both devices, and the embedding model at `fp32`), and ONNX Runtime's WASM thread count (`env.backends.onnx.wasm.numThreads`) is set to `navigator.hardwareConcurrency` (ONNX Runtime's own default is `min(4, ceil(cores / 2))` on a cross-origin-isolated page). Every other lane and every rule is the protocol's. The page shows "Control run: Transformers.js WASM lane at runtime defaults (q8, all cores); not published to the leaderboard", and the run file carries `harness.control = { kind: 'wasm-default', runtimeOrder: [...], wasmLane: { dtype: 'q8', numThreads, simd: true } }`. The settings are applied only in this mode: `createLLMAdapters`/`createEmbedAdapters` take an optional `wasmLane`, which only the `transformers-wasm` adapters read; the lane's worker sets the thread count before its first ONNX Runtime session, preloads and loads the language model at `q8` (a download plus throwaway session through Transformers.js, since the provider's `preloadModel` loads a language model's `q4` files) and the embedding model through the provider's quantized (`q8`) path, and fails the load if ONNX Runtime did not initialise from the env the thread count was set on. It is export-only like the other kinds: the publish toggle is locked off, no upload token is fetched, `POST /api/bench/submit` refuses it with 422 `control-run`, `collect-control-runs.ts` files it under `controls/wasm-default/<YYYY-MM-DD>/`, `import-exported-run.ts` refuses it, `aggregateRuns` leaves it out of every leaderboard row and `runs.csv` names it in `controlKind`/`controlRuntimeOrder`; a paid-study link carrying it is refused. `apps/ui` declares `@huggingface/transformers` `~4.2.0` (the version `@localmode/transformers` pins, so the worker and the provider share one Transformers.js instance and one ONNX Runtime env). `packages/bench/README.md` (Control runs), `SETUP.md` section 9 and the methodology page describe the kind and the link.
- **bench:** the Transformers.js WASM lane's cells record `numThreads` in their `runtimeConfig` on every run: the WASM thread count ONNX Runtime initialised with in the lane's worker, read back from the runtime env after the first session (ONNX Runtime's default on a protocol run), so the run file says how many threads the lane used. The lane's embedding cells now also record their `dtype` (`fp32`, what the provider loads an embedding model at; the bench catalog labels the pairing `q8`). Both are additive `runtimeConfig` entries; `cells.csv` keeps its columns (`dtype` was already one; `numThreads` is in the run file only).
- **bench 0.9.8:** `ControlKind` gains `'wasm-default'`; `HarnessControl` gains the optional `wasmLane` (`HarnessControlWasmLane`), required on `wasm-default` and refused on every other kind by `runBenchmarkSuite` (before anything loads) and `validateRunShape`; `createHarnessControl(kind, { numThreads })`; new exports `CONTROL_WASM_DTYPE`, `CONTROL_WASM_MAX_THREADS` and `controlWasmLaneError`. A control run is never submitted, published or scored, so the protocol stays `localmode-bench/5`, the schema stays 3 and the plausibility rules stay 2; no run is re-scored.
- **bench (tests):** `packages/bench/tests/control-run.test.ts` covers the kind list, the order, the record and its `wasmLane`, the `createHarnessControl` refusals, the shared lane check in the validator and in the runner (refused before any load), digest and validation of a real suite run, aggregation and `runs.csv`. `apps/ui/scripts/bench-wasm-lane.test.ts` drives the real adapters (settings sent to the worker and `runtimeConfig` recorded, per mode) and the real worker message handler (thread count set before the first session, `q8` download and model only when asked, a load that fails when the runtime never read the env). The page parsing, banner and record, the submit-route 422, the import refusal and filing under `controls/wasm-default/` are covered in the existing suites. A new lane of `e2e/bench/bench.spec.ts` runs a real Quick suite from `?control=wasm-default` and checks the exported record, every `transformers-wasm` cell's `runtimeConfig` (`dtype: 'q8'`, `numThreads` equal to `navigator.hardwareConcurrency`), that the lane fetched the quantized ONNX file and not the fp32 one, and that no bench API request is made; the `fixed-order` lane now checks that the same cells record `fp32` and ONNX Runtime's default thread count on the same build.

## [2.16.13] - 2026-10-16

**Released:** `@localmode/bench` 0.9.7.

### Added

- **bench:** a second control-run kind, `fixed-order`, on `/bench/run?control=fixed-order`. It runs the same suite in the protocol's own runtime order (`RUNTIME_EXECUTION_ORDER`) and marks the run file `harness.control = { kind: 'fixed-order', runtimeOrder: [...] }`. It is the same-build, same-day reference series for an order-reversed series: the protocol runs on the leaderboard may come from another browser build, so comparing the two orders within one browser build needs a reference series recorded beside the reversed one and kept out of the leaderboard. It is export-only exactly like `order-reversed`: the page shows "Control run: protocol runtime order; not published to the leaderboard", the publish toggle is locked off, no upload token is fetched, `POST /api/bench/submit` refuses it with 422 `control-run`, `collect-control-runs.ts` files it under `controls/fixed-order/<YYYY-MM-DD>/`, `import-exported-run.ts` refuses it, `aggregateRuns` leaves it out of every leaderboard row, and `runs.csv` names it in `controlKind`/`controlRuntimeOrder`. The runner refuses a `fixed-order` marker whose order is not the protocol order, through the same refusal as a mismatched `order-reversed` order; an unknown kind and a paid-study link carrying either kind are still refused on the page. The unknown-kind message now reads "the supported kinds are order-reversed, fixed-order". Every `order-reversed` behaviour is unchanged. `packages/bench/README.md` (Control runs), `SETUP.md` section 9 and the methodology page describe both kinds, when to use `fixed-order`, and the advice to leave a cool-down between the runs of a series (`cooldown=5`, five minutes between runs; the parameter is in minutes, capped at 30) so that a laptop still warm from the previous run does not push the next run into critical Compute Pressure, which an analysis excluding runs by `pressureCriticalFraction` would drop. Unit tests cover the kind list, the order validation per kind in the runner and the validator, the record, aggregation and `runs.csv`, the page's parsing, banner and series state, the submit-route rejection, filing under `controls/fixed-order/`, and the import refusal; a new lane of `e2e/bench/bench.spec.ts` runs a real Quick suite from `?control=fixed-order` and checks the banner, the protocol order in the exported JSON and that no bench API request is made.
- **bench 0.9.7:** `ControlKind` gains `'fixed-order'`; `CONTROL_KINDS` is `['order-reversed', 'fixed-order']` and `controlRuntimeOrder('fixed-order')` returns a fresh copy of `RUNTIME_EXECUTION_ORDER`. A control run is never submitted, published or scored, so the protocol stays `localmode-bench/5`, the schema stays 3 and the plausibility rules stay 2; no run is re-scored.

## [2.16.12] - 2026-10-15

**Released:** no npm package; the `/bench` site only.

### Fixed

- **bench:** a series that only exports its runs could lose finished runs for good. An export-only control series (`/bench/run?control=order-reversed&runs=6&cooldown=0`) ran six executions but only three JSON files were saved. After each run the page downloaded the file with a programmatic click (no user activation) and reloaded for the next run; Chrome blocks a site's repeated automatic downloads unless the user allows them, the finished run lived only in the page's memory, and the crash-recovery record was deleted on completion, so a blocked download was unrecoverable. The page now keeps every finished run in the browser BEFORE it tries to download it: every run of a series (published or not) and every single run that is only exported (a control run, publishing off, or an upload that failed for good). The copy is the exact file text (two-space JSON with the digest, the same serializer Export JSON and the series download use), kept in a new object store `finished-runs` (keyed by run id) in the page's IndexedDB database `localmode-bench-progress`, now version 2; the upgrade only adds the missing store, so unfinished-run records from version 1 are kept. A record notes when its download was last triggered (`exportedAt`) and is kept until the user removes it; nothing deletes it by age (`SAVED_EXPORT_MAX_AGE_DAYS` is `null`), and Clear model caches does not touch it.

### Added

- **bench:** a **Saved exports** panel on `/bench/run`, shown whenever the browser holds a kept run (after reloads and after a series ends): each run's short id, suite, control kind, series place, finish time, size and last download, with a per-run Download, a Remove that asks first, and **Download all (.zip)**, which saves one uncompressed ZIP of every kept run from the click (one download per click, which Chrome allows), each entry named `localmode-bench-<runId>.json` and byte for byte the file a single download saves, so `collect-control-runs.ts --dir` and `import-exported-run.ts` take the unzipped files as they are. The series panel says how many of its runs the browser holds and, per run, whether its download was triggered; the series summary text carries the same, and the series record gains `savedInBrowser` and `downloadTriggered`. With Runs above 1 and publishing off (or a control run), the series settings read "Each run's JSON is kept in this browser under Saved exports; allow automatic downloads for this site in Chrome to also save them to disk." `packages/bench/SETUP.md` section 9 and the methodology page describe the panel and how to recover the files. Unit tests drive the store over fake-indexeddb (committed before the download callback runs, kept when the download throws, kept across a reload, newest first, Remove, no pruning by default, the version-1 upgrade, the collect tool filing the stored and archived files) and the panel in jsdom (listing, Download all from a click as one archive of the stored bytes checked by an independent ZIP reader with zlib CRCs, per-run Download, Remove with confirm). A new lane of `e2e/bench/bench.spec.ts` runs a real 2-run control Quick series in a browser context that refuses every download, asserts both runs under Saved exports and in IndexedDB, then opens the same storage in a context that accepts downloads and checks that Download all from a click yields both files byte for byte as stored.

## [2.16.11] - 2026-10-14

**Released:** `@localmode/bench` 0.9.6.

### Added

- **bench:** control runs on `/bench/run`, a control experiment for the methodology. The protocol runs its cells in a fixed runtime order (`RUNTIME_EXECUTION_ORDER`, a reproducibility measure), so a lane is tied to its position in the suite. `/bench/run?control=order-reversed` runs the same suite with the runtimes in the exact reverse of that order, so the lane ratios of the two orders can be compared. Control mode is turned on only by that query parameter, and the page shows "Control run: reversed runtime order; not published to the leaderboard" for as long as it is on. The run file carries `harness.control = { kind: 'order-reversed', runtimeOrder: [...] }`, the order the runner actually used (the runner orders the cells by it and refuses any other order for the kind); the cells, rules, traces and environment capture are those of a protocol run. A control run is never uploaded: the publish toggle is locked off (a `publish=on` in the link is overridden), the results offer Export JSON only, the page fetches no upload token, and `POST /api/bench/submit` refuses a run carrying `harness.control` with 422 `control-run`, before the nonce check and without spending the nonce. Runs N works in control mode, so a series of ten runs goes unattended with each run exported as a JSON download; the stored series carries the control kind (`settings.control`, with publishing forced off), so a resumed series stays in control mode across its reloads, and the preset link keeps `control=order-reversed`. A paid-study link (`PROLIFIC_PID` or `cc`) carrying the parameter, and an unknown kind, are refused on the page with a message and Run stays disabled; the completion-code rule also refuses a control run. The methodology page documents control runs.
- **bench:** `apps/ui/scripts/collect-control-runs.ts` files exported control runs into a dataset clone under `controls/<kind>/<YYYY-MM-DD>/<runId>.json` without indexing them (`--dataset`, `--file` repeated or `--dir`, `--dry-run`): each file must be a control run whose digest verifies and whose shape validates, the nonce is dropped if present, `index/summary.json` is never touched, a run id already under `runs/`, `quarantine/` or `controls/` is refused, and one refused file stops the batch before anything is written. `import-exported-run.ts` refuses a control run with a pointer to the collector, so a control run never enters the leaderboard index. `packages/bench/SETUP.md` (section 9) documents both.
- **bench 0.9.6:** `harness.control` and the types `HarnessControl` and `ControlKind`; `CONTROL_KINDS`, `controlRuntimeOrder()`, `createHarnessControl()` and `isControlRun()`; `orderCells(cells, order?)` takes an optional runtime order. `validateRunShape` accepts a well-formed control marker (an exported control run validates offline) and rejects a malformed one. `aggregateRuns` leaves control runs out of every leaderboard row, and `runs.csv` appends `controlKind` and `controlRuntimeOrder` after `reportedOtherApps` (empty on a protocol run; every existing column keeps its name, position and value). A control run is never submitted, published or scored, so the protocol stays `localmode-bench/5`, the schema stays 3 and the plausibility rules stay 2; no run is re-scored. The package README documents the field, the columns and the dataset's `controls/` folder; the dataset's `SCHEMA.md` needs the same note.

## [2.16.10] - 2026-10-13

**Released:** no npm package; the `/bench` site only.

### Fixed

- **bench:** a run started on `/bench/run` after a series had finished on that page was assembled as one more run of the finished series and could not be published. The page kept a complete (or stopped) series in localStorage (`localmode-bench-series`) and in its own state, and the next run read it as its series, so a lab run after a series of 10 Thorough runs carried `harness.series` index 11 of count 10; the submit route refused it with "harness.series.index must be an integer from 1 to harness.series.count" and the page showed "not published: invalid shape". The page now stores a series only while it has runs to do (`seriesToStore()` in `apps/ui/src/lib/bench/series.ts`): the stored state is removed when the last run is recorded and when the series is stopped, so a later page load starts with no series, and a finished series stays on the page that ran it only until closed. Run benchmark closes a finished series still on screen before it starts, and the run's assembly takes its series from `seriesForRun()`, which accepts only an open series whose next index is within its count; any other record is dropped with a console warning, so a run never carries a stale record. `scripts/bench-series.test.ts` covers the stored state through and after the last run (and after a stop) and the assembly check (a complete series of 10 dropped at index 11, a record numbered past its count, a stopped series, an open one kept). The series-of-2 lane of `e2e/bench/bench.spec.ts` now runs on a `next start` bound to the local GitHub-compatible store; after the series completes it asserts the stored series is gone, then opens `/bench/run` in a second tab of the same browser and makes a plain Quick run there, which shows no series, uploads with a 200, and posts and commits a run with no `harness.series`. The Stop series lane also asserts that a stopped series is not stored.

### Added

- **bench:** `apps/ui/scripts/import-exported-run.ts` takes `--drop-stale-series` for a run exported with that defect. Only when the file's `harness.series.index` exceeds its `count`, it verifies the participant's digest over the file as exported, then removes `harness.series` as a publication scrub (`scrubbedAt` stamped, digest recomputed, the rest of the run unchanged) before the submit route's checks; the output prints the removed record and the client digest, and the index entry carries a new optional key `importNote: "stale series record removed"` after `importedAt`. The flag is refused for a run whose series record is consistent or absent, and without it the run is refused with the shape error as before. `RunIndexEntry` gains `importNote`, `scripts/rebuild-bench-index.ts` keeps it, and `scripts/import-exported-run.test.ts` covers the four paths on the study fixture (a run numbered 3 of 2 refused without the flag, imported with it with the record removed and a rebuild reproducing the index, a consistent record and a run with none refused with the flag, a tampered file refused). `packages/bench/SETUP.md` section 8 and the `/bench/methodology` integrity section describe it. The lab run `febbece7-76a1-4088-bb17-aa03d1c10708` (Thorough, NVIDIA GeForce RTX 3080 Ti, 66 of 69 cells ok, `harness.series` index 11 of count 10) was imported with it into the dataset as `runs/2026/10/febbece7-76a1-4088-bb17-aa03d1c10708.json`, unflagged, in device class `windows/nvidia-ampere` and subclass `windows/nvidia-geforce-rtx-3080-ti`.

## [2.16.9] - 2026-10-08

**Released:** no npm package; the `/bench` site only.

### Fixed

- **bench:** a paid-study link did not fix the suite it pays for. A participant opened a Thorough study link (`tier=thorough&quality=on&...&ccmode=full`) and uploaded two Standard-suite runs, because the Suite picker, the quality-fidelity switch, Runs, Cool-down between runs and Clear caches after each run stayed editable on a study link, and the full-completion rule counted the shorter suite's planned cells as the whole run, so it could issue the code. On a paid-study link (a valid `cc`, in both the `attempt` and the `full` completion mode) those five controls are now disabled at the link's values, a parameter the link leaves out taking the plain-visit value (`studyRunLock()` in `apps/ui/src/lib/bench/study-completion.ts`), and a note under the configuration panel reads "This study link fixes the suite and the run settings."; publishing stays forced on in `full` mode as before. The completion code is now issued only when the finished run's `suite` equals the link's `tier` and its quality-fidelity setting (read from its quality cells, `runSettingsOf()`) equals the link's `quality`; a run that differs gets no code and the page asks the participant to message the researcher with a screenshot. Organic visits are unchanged: a link still only prefills the controls. Unit tests cover the presets-to-lock mapping and both checks in both modes; the bench e2e spec checks the locked controls on study links in both modes and the editable ones on an organic visit, asserts that the run the full-mode lane uploads has the link's suite, and drives a real run that differs from its study link (an open series from an earlier visit) to the researcher message with no code.

## [2.16.8] - 2026-10-07

**Released:** no npm package; the `/bench` site only.

### Fixed

- **bench:** a run longer than six hours could not be uploaded. The page fetched its session nonce when the run started, and the submit route refuses a nonce older than `NONCE_MAX_AGE_MS`, then 6 hours; a participant's Thorough run on an Intel integrated GPU took 12.5 hours, its upload was refused as `invalid-nonce`, and the page showed "The run finished but the upload did not go through". The page now fetches a fresh nonce from `/api/bench/nonce` right before every upload attempt (the first one, the automatic resubmission after a rate limit, the series loop and Retry submission) and, when the route still answers `invalid-nonce` (the fetch had failed), fetches another and tries once more. The run digest does not cover the nonce (`computeRunDigest` omits it since schema 3), so the swap needs no new digest; the run kept on the page, and its Export JSON, keep the nonce the run started with. `NONCE_MAX_AGE_MS` is also raised to 24 hours, as a backstop for pages built before this release, whose nonce still dates from the start of the run: the refresh fixes the cause, the longer window covers the pages already open in participants' browsers. A used nonce is now remembered for the same 24 hours (`NONCE_CONSUMED_TTL_SEC`), so it cannot be replayed inside the longer window. The route's expired-nonce answer now reads "The session token of this upload is missing or has expired. The bench page fetches a new token and tries the upload again by itself; if it still fails, export the run as JSON." `scripts/bench-store.test.ts` covers the 24-hour window and the remembered-nonce period, `scripts/bench-submit-route.test.ts` the message and the same run accepted with a fresh nonce and its original digest, and a new `e2e/bench/bench.spec.ts` lane runs a real Quick run whose run-start nonce is a correctly signed nonce from 25 hours earlier: the upload is preceded by a second nonce request, posts that nonce, succeeds and shows the completion code, the dataset receives the page's digest, and posting the exported file with its start nonce is refused with the new message. The `/bench/methodology` integrity section says so.
- **bench:** in the full-completion study mode (`ccmode=full`), a device that dies at the same model load every time spent four full runs on it. A run interrupted at the same cell as the previous attempt (the cell the attempt's IndexedDB progress record names as in progress when the page died, or when the runner failed in the page) now stops after that second attempt and shows the "could not finish" screen with Export JSON and no code: "The run could not finish after 2 attempts: both stopped at the same step. Please message the researcher with a screenshot of this page; you are paid for the attempt." ("the last two stopped at the same step" when the repeat comes later). An interruption at a different cell than the previous one keeps the cap of 3 automatic restarts and the existing message after 4 attempts. An unknown cell (no progress record, or the page died between cells) never counts as the same cell. The attempt count in `localmode-bench-series-attempts` gains three optional keys, `partialAttemptId`, `lastInterruptedCellId` and `capReason`; a count stored by the previous release still reads. The overlay says "Attempt 2 of at most 4 · an interrupted run restarts by itself, up to 3 times, and stops if it is interrupted twice in a row at the same step", which holds on both paths. `scripts/bench-study-completion.test.ts` covers both policies through the stored count, and the e2e cap lane is replaced by two real lanes: reloads during the first cell of attempts 1 and 2 stop at the same-cell message after attempt 2 (two partial records, Export JSON names the cell), and reloads alternating between the first cell and a later one restart up to the 4-attempt cap message.

### Added

- **bench:** a maintainer tool, `apps/ui/scripts/import-exported-run.ts` (`--dataset <clone> --file <export.json> [--dry-run]`), adds a run whose upload never went through to a dataset clone from the file the participant exported. The submit route's steps now live in `apps/ui/src/lib/bench/submission.ts` (`parseSubmissionBody`, `checkSubmission`, `toPublishedRun`, `publicationOf`, with `runPath`, `serializeRunFile`, `appendIndexEntry` and `toIndexEntry` from the store), which the route calls; its answers are unchanged apart from the expired-nonce message, and the existing route tests pass as before. The tool runs the same steps on the file, except the nonce check (an exported file's nonce has expired) and the GitHub writes: it writes the run file at the path the route would use, with the bytes the route would commit, and appends the index entry from `toIndexEntry()` to `index/summary.json`. The entry carries a new optional key `importedAt` (ISO time of the import), present only on imported runs, so every other entry stays byte-identical; `scripts/rebuild-bench-index.ts` keeps `importedAt` from the current index. A run id already in the index or under `runs/` or `quarantine/` is refused, and so is a file whose digest does not verify. `scripts/import-exported-run.test.ts` runs it over a copy of the study fixture dataset: a valid export lands at the route's path with the bytes the real route commits for the same body, its digest verifies, its entry equals the route's plus `importedAt`, and a rebuild reproduces the index byte for byte; a flagged export lands in `quarantine/`; a tampered export, a duplicate run id and a second import are refused; `--dry-run` writes nothing. `packages/bench/SETUP.md` section 8 documents it: an imported run passed the same validation as a submitted one, lacks only the live nonce check, and is marked. A dry run on the 12.5-hour export (run `e2898ac9-ce18-4f80-a656-4a806d900f6c`) would write `runs/2026/10/e2898ac9-ce18-4f80-a656-4a806d900f6c.json` with no flags; it has not been imported.

## [2.16.7] - 2026-10-02

**Released:** `@localmode/bench` 0.9.5.

### Fixed

- **bench:** a published paid-study run carried a Windows computer name: the participant typed the processor and the device name into "Graphics card or chip", and run `4d447c9c-5c1c-48c8-91c9-2a9afeb0c684` in the dataset recorded `environment.userReportedHardware.gpu` as the processor name followed by `DESKTOP-` and the seven characters of the computer name. `sanitizeReportedGpu()` in `@localmode/bench` 0.9.5 now removes URLs, email addresses, Windows computer names (`DESKTOP-XXXXXXX`, `LAPTOP-XXXXXXX`, `WIN-XXXXXXXXXXX`, also when glued to the text before them) and other uppercase `NAME-XXXXX` tokens whose suffix mixes letters and digits, and keeps product names such as "RTX 4060 Ti", "RX 7900 XT", "Arc A770", "M4 Max" and `GTX-1080TI`. The page applies it when it assembles the run file (`toUserReportedHardware()` in `apps/ui/src/lib/bench/study-hardware.ts`), so such an answer is never sent, and an answer that is only a computer name counts as unanswered and keeps Start benchmark disabled; the submit route applies it again through `scrubRunForPublication`, so a page built before this release cannot publish one either. `packages/bench/tests/user-reported-hardware.test.ts` and `scripts/bench-study-hardware.test.ts` cover the removals and the product names that survive.
- **bench:** a new maintainer tool, `apps/ui/scripts/scrub-run-field.ts`, rewrites one participant answer of a published run in a dataset clone: `--field` with `--value`, `--delete`, or `--sanitize` (the GPU name only), and `--dry-run`. It refuses every path other than `environment.userReportedHardware.{gpu,chassis,ramGB,otherAppsRunning}` and `environment.userReportedDevice`. The run goes through the submit route's publication path (`scrubRunForPublication`, `scrubbedAt` stamped, digest recomputed with `computeRunDigest`), must pass `validateSubmission` and `verifyRunDigest`, and is written back in the dataset's compact JSON layout; the run's `index/summary.json` entry changes only in the fields `toIndexEntry()` derives from the edited answer. It prints the before and after of the field, the digest and the index entry. `scripts/scrub-run-field.test.ts` runs it as a real process over a copy of the study fixture dataset: the digest verifies after the scrub, every other byte of the run and of the index is unchanged, and fields outside the participant's answers are refused with nothing written. Applied to run `4d447c9c` in the dataset (the GPU answer now reads "Processador Intel(R) Core(TM) i5-3330S CPU @ 2.7"); no other study answer in the dataset changes under the new rule. `packages/bench/SETUP.md` documents the tool.
- **bench:** the leaderboard grouped some AMD integrated GPUs under the wrong generation. Chrome reports a WebGPU adapter's `architecture` from Dawn's `gpu_info.json`, which matches AMD device ids under a 0xFFF0 mask, so Barcelo (0x15E7) and Lucienne (0x164C), Vega / GCN 5 parts of the Renoir family, arrive as `rdna-2`, and Kaveri (0x130A, GCN 2) as `gcn-1`. `@localmode/bench` 0.9.5 reads the PCI device id from the run's `environment.webglRenderer` (`amdArchitectureFromRenderer()`) and, for the ids in its sourced `AMD_DEVICE_ID_ARCHITECTURE` table, uses the table's architecture in `deviceClassOf()` and `deviceSubclassOf()`. The index entry built by `toIndexEntry()` (`apps/ui/src/lib/bench/store.ts`) then carries the corrected `gpuArchitecture` and a new optional `gpuArchitectureReported` with the browser's label; the key is absent when nothing was corrected, so every other entry stays byte-identical. This changes only which device class a run is grouped under: the protocol, the measurements, validation and scoring are untouched, and the run files are not rewritten. A dry run of `scripts/rebuild-bench-index.ts` over the dataset finds five study runs that move (four from `windows/amd-rdna-2` to `windows/amd-gcn-5`, one from `windows/amd-gcn-1` to `windows/amd-gcn-2`) and 432 entries unchanged; the index is not rebuilt by this release, and `packages/bench/SETUP.md` says that the next rebuild applies the correction. `packages/bench/tests/amd-architecture.test.ts` and `scripts/bench-store.test.ts` cover the extractor, the override, ids the table does not list, non-AMD renderers and the index entry.

## [2.16.6] - 2026-10-02

**Released:** no npm package; the `/bench` site only.

### Added

- **bench:** a full-completion mode for paid-study links on `/bench/run`. A new link parameter `ccmode=full` (absent or any other value keeps today's `attempt` mode, so batch 1 links behave exactly as before) applies to a link with a valid `cc` code and `PROLIFIC_PID` opened in an eligible browser. In this mode the completion code appears only for a finished, uploaded run: the suite reached its end with every planned cell attempted (`ok`, `error` and `invalid` count, error cells are data; a lane this device cannot run counts as a planned skip; a lane the submitter switched off does not) and `POST /api/bench/submit` answered success; in a series, only after the last run. Until then no code is shown anywhere, including after a Stop. The page note and the run overlay say: "Your completion code appears when the whole run has finished and uploaded. If it is interrupted, this page restarts it by itself." An interruption (a reload, a tab crash, a closed tab, a runner error) restarts the run on the next page load of the link without a click and without asking "About this computer" again; a runner error reloads the page itself after 3 seconds. Attempts are counted in localStorage under `localmode-bench-series-attempts` (`{ code, runIndex, attempts, inFlight, capped, hardware }`), shown in the overlay as "Attempt 2 of 4", capped at 3 automatic restarts per run: after a fourth interrupted attempt the page stops restarting, disables Run benchmark and shows "The run could not finish after 4 attempts. Please message the researcher with a screenshot of this page; you are paid for the attempt." with an Export JSON button for the newest partial record, and no code. The count resets when a run finishes, when the run is stopped, and when the link is opened with another `cc`. Cancel run (and Stop series) asks first in an `alertdialog` "Stop the run?": "The study pays only for a finished run. If you stop now, no completion code is issued; reopening the link starts the run again from the beginning.", with "Keep running" and "Stop"; a confirmed Stop cancels the run as before (nothing is uploaded, the partial record is removed) and shows no code. A finished run whose upload fails for good (a failure other than the rate limit, which is still resubmitted by itself) shows "The run finished but the upload did not go through. Export the result and message the researcher with it; you are paid for the attempt." beside Export JSON and Retry submission, and no code. On these links publishing is forced on and the lane switches are locked. The generated preset link keeps `&ccmode=full` when the page was opened with it, and the Link presets list documents the parameter; there is no new control. A browser that grants the screen wake lock only inside a user activation would get a single Continue button instead of the automatic restart, which the study gate (Chromium on a computer) never reaches. The decisions live in `apps/ui/src/lib/bench/study-completion.ts`, covered by `scripts/bench-study-completion.test.ts`. The results store reads an optional `BENCH_GITHUB_API_URL` (unset in production, documented in `packages/bench/SETUP.md`), which `e2e/bench/bench.spec.ts` uses to run a second `next start` of the same build against a local GitHub-compatible endpoint, so five new lanes drive real Quick runs end to end: the code appears only after a successful upload (absent during the run and while the commit is held), a reload mid-run restarts at attempt 2 with no dialog and then finishes, uploads and shows the code, Stop asks first and a confirmed Stop issues no code and restarts at attempt 1 when the link is reopened, four reloads end at the cap message with Export JSON, and the unbound server's 503 shows the upload message without a code. Nothing measured and no run file field changes.

## [2.16.5] - 2026-10-01

**Released:** no npm package; the `/bench` site only.

### Changed

- **bench:** on a paid-study link (`cc` in the link) opened in an eligible browser, `/bench/run` asks "About this computer" in a dialog instead of an inline form, and all four questions are now required. Nothing is shown on the page before the click: the Run benchmark button is enabled and opens a modal dialog titled "About this computer" (`role="dialog"`, named by its title and described by a line saying all four answers are needed and are published with the run in the public leaderboard dataset). The dialog holds the same four questions: "Graphics card or chip", "Computer type", "Memory (RAM)" and "Other heavy programs running (games, video calls, editing software)", which was optional and is now required like the other three. Under "Graphics card or chip", the help is a "Where to find it:" list tied to the input with `aria-describedby`, one line per system ("Windows: Task Manager, Performance tab, GPU"; "macOS: About This Mac, Chip or Graphics"; "Linux: Settings, About, or `lspci | grep -i vga`"), followed by a separate line of example names. The dialog's Start benchmark button stays disabled until all four answers are given, with the missing ones named beside it (for example: Still to answer: memory (RAM) and other heavy programs running.); Start closes the dialog and starts the run from the same click, through the same code path as the Run button before, so the click still counts as the user activation the screen wake lock needs, and focus moves into the run overlay. Cancel and Escape close the dialog without starting, keep the answers given so far, and return focus to Run benchmark. In a series the dialog appears before run 1 only; runs 2 and later start on their own with the stored answers, and a later run whose stored answers are incomplete opens the dialog instead of starting. The answers stay editable in the run overlay during the run, exactly as before, and the values present when the run file is assembled are recorded as `environment.userReportedHardware`, which on study runs now always carries `otherAppsRunning`. The field's schema in `@localmode/bench` 0.9.4 is unchanged (`otherAppsRunning` stays optional there), visits without `cc` and browsers the study gate turns away see no change, and nothing measured changes. `scripts/bench-study-hardware.test.ts` covers the four-answer rule and the reason text, `scripts/bench-study-eligibility.test.ts` adds Chrome on ChromeOS (with and without `userAgentData`) to the eligible browsers, which the gate already admitted, and `e2e/bench/bench.spec.ts` drives the dialog in real Chromium: no inline form, Start disabled with every missing answer named, Cancel and Escape starting nothing and fetching no model, the three help bullets, a real Quick run started from the dialog with an answer corrected in the overlay, and a series of two that asks once and restores the answers on run 2.
- **bench:** the paid-study gate on `/bench/run` now admits only Chromium on a computer (Chrome or Edge on Windows, macOS, Linux or ChromeOS); phones and tablets are turned away whatever their browser. `studyEligibility()` (`apps/ui/src/lib/bench/study-eligibility.ts`) gains a mobile rule, evaluated after the WebKit rule and before the Gecko and Chromium rules: `navigator.userAgentData.mobile` set to `true`, `navigator.userAgentData.platform` equal to "Android", or an `Android`, `Mobile`, `Tablet`, `iPhone`, `iPad` or `iPod` token in the user agent makes the browser ineligible with the new reason `mobile` (`StudyIneligibleReason` is now `'webkit' | 'mobile' | 'gecko' | 'other'`). The tokens and the platform are checked as well as the bit because some Chromium builds report `mobile: false` on tablets and Chrome's "desktop site" mode on Android clears the bit and drops `Mobile` from the user agent. Safari on macOS and every iPhone and iPad browser still report `webkit`, since that rule runs first; Firefox on Android now reports `mobile` instead of `gecko`. The alert keeps its heading "This study needs Chrome or Edge" and now reads: "This study needs Chrome or Edge on a computer. Runs from phones and tablets, Safari, Firefox and other browsers are not eligible for payment and do not receive a completion code. Open this exact link in Chrome or Edge on a Windows, macOS, Linux or ChromeOS computer to take part." 2.16.4 admitted Chrome on Android (and Samsung Internet); this release withdraws that. `scripts/match-study-submissions.ts` recomputes eligibility with the same function, now also passing the run file's `environment.device.mobile` and `environment.os.platform`, so a run from a phone or tablet is listed as `ineligible (mobile)`. Nothing measured and no run file field changes. `scripts/bench-study-eligibility.test.ts` moves the Android Chrome cases (with and without brands, and desktop-site mode) and Samsung Internet to the ineligible `mobile` reason and adds an Android tablet reporting `mobile: false`, a Linux user agent with `userAgentData.platform` "Android", and Firefox on an Android phone and tablet; the desktop cases are unchanged. `e2e/bench/bench.spec.ts` adds a Chromium lane with an Android Chrome user agent and `userAgentData` set to brands Chromium and Google Chrome, `mobile: true` and platform "Android": the notice shows, there is no Run button, and no model is requested.

## [2.16.4] - 2026-10-01

**Released:** `@localmode/bench` 0.9.4.

### Added

- **bench:** `/bench/run` gates paid-study links by browser. When the link carries a `cc` completion code (`?PROLIFIC_PID=<id>&cc=<code>`), the page checks the browser with `studyEligibility()` (`apps/ui/src/lib/bench/study-eligibility.ts`): Chrome or Edge on a computer and Chrome on Android are eligible (a `navigator.userAgentData.brands` entry "Chromium", "Google Chrome" or "Microsoft Edge", which also admits Brave, Opera and Samsung Internet; without `userAgentData`, a `Chrome/`, `Chromium/`, `HeadlessChrome/` or `Edg/` token in the user agent). WebKit (Safari on macOS, and every iPhone and iPad browser including Chrome `CriOS` and Firefox `FxiOS`), Gecko (Firefox on desktop and Android) and unrecognised browsers are not, and the user-agent string is checked before the brands, so a Chromium page claiming Safari counts as Safari. An ineligible browser sees, in place of the Run benchmark button, an alert headed "This study needs Chrome or Edge": "This study needs Chrome or Edge on a computer, or Chrome on Android. Runs from Safari, iPhone or iPad browsers, Firefox and other browsers are not eligible for payment and do not receive a completion code. Open this exact link in Chrome or Edge to take part." No run can start from that page (a pending series does not resume either), so it downloads no model, and the study hints and the completion code are never shown there. Without `cc` (a plain visit, or `PROLIFIC_PID` alone) nothing changes, and eligible browsers see the page as before. The run file is unchanged: `userReportedDevice` still carries `prolific:<hash>`, and `environment.browser` and `environment.userAgent` remain the maintainer's source for verifying a payment. The query-string reader moved, unchanged in behaviour, to `parseStudySession()` (`apps/ui/src/lib/bench/study-session.ts`): only `PROLIFIC_PID` is hashed, parameter order does not matter, and other parameters such as `STUDY_ID` and `SESSION_ID` are ignored and recorded nowhere. Unit tests cover real user-agent strings and brands lists (`scripts/bench-study-eligibility.test.ts`) and the session reader against Node's own SHA-256 (`scripts/bench-study-session.test.ts`); `e2e/bench/bench.spec.ts` checks the gate in Chromium and under a Safari user agent with `userAgentData` removed, on links carrying `STUDY_ID` and `SESSION_ID`, with no model request.
- **bench 0.9.4:** `/bench/run` asks paid-study participants about their computer. On a study link with a valid `cc` code opened in an eligible browser (the gate above), a fieldset "About this computer" is shown from page load above the Run benchmark button: "Graphics card or chip" (text, at most 64 characters, required; its help text says where to read it: Windows Task Manager, Performance, GPU; macOS About This Mac; Linux Settings, About, with example names), "Computer type" (laptop, desktop or other, required), "Memory (RAM)" (4, 6, 8, 12, 16, 24, 32, 48, 64, 96, or 128 GB or more, or "Not sure", required) and "Other heavy programs running (games, video calls, editing software)" (yes or no, optional), with a note that the answers are published with the run in the public leaderboard dataset. The Run benchmark button stays disabled until the three required answers are given, with the reason beside it (for example: Answer "About this computer" first: memory (RAM).). The controls stay editable during the run, in the run overlay, and the answers present when the run file is assembled, right before the upload, are recorded as `environment.userReportedHardware` (`{ gpu?, chassis?, ramGB?, otherAppsRunning? }`; the GPU name with control characters removed and whitespace collapsed, "128 GB or more" as 128, "Not sure" as `null`). In a series the answers are stored beside the series state (`localmode-bench-series-hardware`), restored on each run's page load, and removed when the series ends or is stopped. Visits without `cc` see no form and no change, and their runs carry no such field. `validateRunShape` accepts the field and rejects malformed values (GPU name 1 to 64 characters after trimming, without control characters; chassis `laptop`, `desktop` or `other`; RAM an integer from 1 to 1,024 GB or `null`; other programs a boolean), the digest covers it with the rest of `environment`, and the publication scrub normalizes the GPU name with the new `sanitizeReportedGpu()` (a changed name gets a recomputed digest and `scrubbedAt`). The leaderboard index entry gains `reportedGpu`, `reportedChassis` and `reportedRamGB` when the run carries them and leaves them out otherwise, so the rebuilt index of the current dataset (371 entries) is byte for byte the committed one. `runs.csv` gains `reportedGpu`, `reportedChassis`, `reportedRamGB` and `reportedOtherApps` after `powerLevel`; every existing column keeps its name, position and value. A maintainer tool, `apps/ui/scripts/match-study-submissions.ts`, reads a study's participant export (a CSV "Participant id" column or one id per line), hashes each id with the page's own `parseStudySession()`, and lists for each participant the verdict (`approve`, `duplicate` with every run, or `no-match`), the run, its browser, the eligibility recomputed with `studyEligibility()`, and the reported hardware, as a table or as JSON (`--json`); `packages/bench/SETUP.md` documents it. The protocol (`localmode-bench/5`), the schema version, the measurements, validation of every other field and the scoring are unchanged: nothing measured changes.

### Changed

- **bench:** the run settings on `/bench/run` are grouped into one configuration panel instead of three loose rows. Inside the "Configure the run" card, "Suite" holds the tier picker with a one-line description of the selected tier and the quality-fidelity lane switch; "Series" holds Runs, Cool-down between runs and Clear caches after each run, each with one line of help, above the existing series explanation; "Publishing" holds the publish switch with a line stating what happens to the result; and "Tools" holds the Clear model caches button, now styled as a destructive action, and the Link presets disclosure with Copy link. The sections sit in two columns on wide screens and one column on phones, followed by the model lanes and the Run benchmark button with the lane count and download estimate. Every control keeps its accessible name, role and id, the help paragraph tied to Runs and Cool-down keeps its text, and the series panel, the between-runs cool-down and the wake-lock status are unchanged.

### Fixed

- **bench:** after the 2.16.3 deploy, the leaderboard on `/bench` and `GET /api/bench/leaderboard` still showed 42 runs, although the dataset's rebuilt `index/summary.json` held 371 entries. Both read the index from raw.githubusercontent.com with `next: { revalidate: 300 }`, which stores the response in the Next.js data cache, and Next refuses any data-cache entry over 2 MB (it logs "items over 2MB can not be cached"). The rebuilt index is 4,453,966 bytes, so every revalidation downloaded it, failed to store it, and kept serving the 42-entry copy of the old 210 KB file. The raw index is now fetched with `cache: 'no-store'`, and what is cached is the aggregate both surfaces render: the leaderboard rows, the run count, the protocol list and the 25 newest submissions without their per-cell metrics. It is cached with `unstable_cache` for 5 minutes, keyed by the dataset repository, and on the current dataset (371 entries, 347 runs on the leaderboard, 772 rows) it is about 359 KB as a cache entry. `/bench` stays a static page with a 5-minute revalidation, and the API response keeps its shape (`rows`, `runs`, `protocols`, `repo`). Should the aggregate itself ever pass 2 MB (about 4,800 rows: at the current rate of new device groups around 2,300 index entries, or about 60 more runs if each came from a device group not yet on the leaderboard), the server logs an error naming the entry count and size instead of failing silently. A failed index read (an HTTP error other than 404, or a body that is not a complete JSON array) now raises an error instead of reading as an empty dataset, so it is never cached as an empty leaderboard; a cached aggregate keeps being served while the read is retried.

## [2.16.3] - 2026-10-01

**Released:** `@localmode/bench` 0.9.3.

### Added

- **bench 0.9.3:** the analysis exports carry the battery state and each cell's wall-clock span, which an analysis had to read from the run files. `runs.csv` gains `powerCharging` and `powerLevel` (from `environment.power`; both empty when the browser has no Battery API) after the `rv_*` columns. `cells.csv` gains `cellStartedAt` and `cellEndedAt` after `errorCause`: ISO 8601 UTC times, rounded to the millisecond, of the earliest and latest timestamp the cell records (load, load progress, load end plus warmup, kept and discarded iterations, failed attempts), mapped through `createdAt`, which the runner stamps right after the last `suite-end` event. Both are empty on a skipped cell, on a quality cell over a model an earlier cell loaded (the quality lanes record no timing), and on a run without `suite-end`. Every existing column keeps its name, position and value; the package README and the dataset's `SCHEMA.md` document the columns. The protocol (`localmode-bench/5`), the schema, validation, scoring and the leaderboard are unchanged.

### Fixed

- **bench:** submissions erased the leaderboard index four times between 24 and 28 September 2026, each time on the first submission after `index/summary.json` in the dataset grew past 1 MiB (at 1,055,628, 1,071,590, 1,052,923 and 1,058,847 bytes; 108, 50, 89 and 82 entries cut to one). The submit route read the index through the GitHub contents API, which for a file over 1 MiB answers HTTP 200 with `content: ""` and `encoding: "none"`; the empty string failed to parse, the route took that as an empty index and wrote it back holding only the new run. Only index entries were lost, never a run file: all 370 verified and 1 flagged run files stayed in `runs/` and `quarantine/`, but the leaderboard, its run count and the leaderboard API counted only the runs indexed since the last reset (42 of 371 at dataset commit 0e3e638). The route now takes the sha from the contents API and reads the content through the Git blobs API, which returns base64 at any size up to 100 MB. It rejects an index whose content is missing, shorter than the reported size, or not a JSON array, and refuses any write with fewer entries than it read. When the index cannot be read or updated, the run file stays committed and the response is HTTP 502 with the code `index-update-failed`, the run's path and URL, and a message that the run needs no resubmission; before, the index was reset and the response said the run was published. A new maintainer tool, `apps/ui/scripts/rebuild-bench-index.ts`, regenerates the index from every run file in a dataset clone with the submit route's own `toIndexEntry()`, ordered by `createdAt` then path, and refuses to drop a run the current index lists unless `--allow-shrink` is passed. On the dataset it rebuilds 371 entries; the 42 present entries come out byte for byte, and the leaderboard rows equal those aggregated from every entry the index ever held. Entries first written by older harness versions gain the fields the submit path writes today (such as `deviceSubclass` and `harnessVersion`), and the one protocol v1 entry gets its cell metrics from the current summary rules (v1 is not on the leaderboard); no leaderboard value changes and no run file is re-scored. The leaderboard's own read uses the raw file host, which serves the index at any size. `packages/bench/SETUP.md` and the dataset README document the tool.

### Documentation

- **bench:** the methodology page states a known prompt limitation. The Llama 3.2 1B chat template writes the current local date into its default system header ("Today Date: <d Mon YYYY>", through `strftime_now`), and the bench sends no system prompt, so on the three Llama lanes (Transformers.js WebGPU, llama.cpp CPU and llama.cpp WebGPU) the rendered prompt changes with the device's local calendar date. Decoding is greedy, so on the Transformers.js lane each date yields a different fixed output and the decode rate follows the text: the pp128 decode rate of one machine moved by about 9 to 13% between dates, stepping at local midnight on two machines, and one tinyMMLU item changed from wrong to right, with no change to the model files, the browser or the harness. The llama.cpp Llama lanes already vary from iteration to iteration, so the date leaves no mark in their output. The Qwen3, Gemma 4 and SmolLM2 templates carry no date on any lane; WebLLM's templates insert a fixed default system message instead, so the prompts of one pairing already differ across runtimes. Same-day comparisons on a Llama lane use identical prompts, comparisons across days carry the date effect, and for crowd submissions the local date is not recoverable (schema 3 stopped recording the time zone), so Llama-lane rows aggregate runs made with different prompts; the run files store the generated text, so the Transformers.js Llama cells can be partitioned by output. Pinning the date (or one fixed system prompt on every lane) and a per-cell digest of the rendered prompt are reserved for a future protocol version. The protocol (`localmode-bench/5`), the plausibility rules and the scoring are unchanged, and no run is re-scored. The dataset README and SCHEMA.md carry the same note.
- **bench:** the STS-B license notice claimed CC BY-SA 4.0 for the sentence pairs. The 100 pairs in `packages/bench/src/datasets/stsb/stsb-subset.ts` are the first 100 rows of the STS Benchmark test split, all captions from the Microsoft Research Video Description Corpus; the STS Benchmark releases its similarity scores under CC BY-SA 4.0 and leaves each sentence under its source corpus's terms, Microsoft Research's for these pairs. The notice (`LICENSE-CC-BY-SA.md`), the header of `stsb-subset.ts` and the package README's dataset-license list now say so, and that the file is retained for the protocol's quality-fidelity lane while the maintainer confirms the redistribution terms. The npm package bundled the pairs into `dist` without the notice (`files` listed only `dist`, `README.md` and `LICENSE`); `files` now ships `src/datasets/stsb/LICENSE-CC-BY-SA.md`.
- **bench, wllama:** the docs called the llama.cpp CPU lane's memory limit a "4 GB wasm heap" or a wasm32 heap. wllama 3.5.1's default build, the one Chromium loads, is a memory64 build (its `wllama.wasm` imports a shared 64-bit memory of at most 65,536 pages) linked with `-sMAXIMUM_MEMORY=4096MB`; only the compatibility build for browsers without JSPI or Memory64, such as Safari, is 32-bit. The bench README, the methodology page, the wllama README and the source and test comments in `packages/wllama` and `apps/ui/src/lib/bench` now name the 4 GiB link-time memory cap of wllama's memory64 build; the 4 GiB figure and every behavior are unchanged.
- **bench:** the `protocol.ts` comments gave the pp128 and pp512 prompts as 512 and 2,178 characters; the prompts, unchanged, are 509 and 2,335 characters. Comment only.
- **bench:** the `deviceMemoryGB` type comment said Chrome caps `navigator.deviceMemory` at 8. The dataset shows 8 on Chrome 144/145 and on Android and 32 on desktop Chrome 152/153; the comment now states those as the observed caps. Comment only.

## [2.16.2] - 2026-09-29

**Released:** `@localmode/bench` 0.9.2.

### Fixed

- **bench:** on Safari (macOS, iPhone and iPad), and every other iOS browser, a series on `/bench/run` could not keep the screen awake after run 1, so the device slept a few minutes into the series while Chrome and Firefox stayed awake. Cause, reproduced on WebKit: `navigator.wakeLock.request('screen')` is granted only with a user activation. Run 1 starts from the Run click and gets the lock; every later run starts from the page's own reload and is refused with `NotAllowedError` (Chrome grants it after the reload). Three iOS and macOS Safari series on file stopped after run 2, whose trace has no wake-lock event. The page now, on WebKit, requests the lock again on the next tap or key press and says "Tap anywhere to keep the screen awake"; while a series runs without a granted lock (refused, awaiting a tap, or no wake-lock API), the series box in the run overlay and the between-runs series panel show a notice: "This browser did not grant a screen wake lock, so the device may sleep during the series.", followed on WebKit by "iPhone or iPad: Settings, Display & Brightness, Auto-Lock, Never. Mac: run caffeinate -d in Terminal or set the display to never turn off." (elsewhere, "Set the display to never turn off, or keep the device awake another way, until the series ends."), and "If the device sleeps, the series waits until it wakes, and steps measured while the page is hidden are set aside." The overlay's "the screen is kept awake for you" line no longer claims so when it is not. No silent video or audio is used to keep the screen on. The methodology page documents the WebKit behaviour and what the run file records.
- **bench 0.9.2:** the trace records a refused wake-lock request as `wakelock-denied` (detail: the error name), re-requests the lock on the next user activation, and records a lock granted that way as `wakelock-acquired` with the detail `user-activation`. Before, a denial left no event. Covered by the digest like every trace event; no validation or scoring rule reads it; the protocol (`localmode-bench/5`) and schema version are unchanged.

## [2.16.1] - 2026-09-28

**Released:** `@localmode/bench` 0.9.1, `@localmode/transformers` 4.1.4, `@localmode/webllm` 2.2.1.

### Added

- **bench:** a **Cool-down between runs** control on `/bench/run` (minutes, 0 to 30 in half-minute steps, default 0), next to Runs. It is part of the series settings kept in `localmode-bench-series` and applies to every run of the series. After a run's result is kept (published, or exported as JSON) and the caches are cleared when that switch is on, the page stays loaded and idle for the cool-down before it reloads for the next run, with a countdown in the series box ("Cooling down: 2:45 until run 4 of 10"); the wake lock and the tab title progress stay on, the series estimate counts the remaining cool-downs, **Stop series** during the countdown ends the series at once (no run is in flight), and a page reloaded by hand during the countdown waits out the rest before it starts the next run. Link presets take `cooldown=<minutes>` (clamped to 0 to 30, rounded to the nearest half minute); the Link presets note and the methodology page document it. Why: a 7-run back-to-back Quick series on a 15 W class laptop showed the llama.cpp CPU decode falling from about 135 to about 85 chars/s from run 3 on, so laptop and phone series need a recorded pause between runs. The pause is idle time on the page; the protocol (`localmode-bench/5`), the measurement rules, the plausibility rules and the scoring are unchanged.
- **bench 0.9.1:** optional fields on `harness.series`: `cooldownMs` (the cool-down configured for the series, recorded on every run including run 1) and `idleBeforeMs` (the idle time measured before the run started, from the moment the previous run was kept to this run's start across the reload; absent on run 1 and on a run resumed with Continue series). Validation accepts them and rejects values that are not integers from 0 to `SERIES_MAX_COOLDOWN_MS` (1 hour) and `SERIES_MAX_IDLE_BEFORE_MS` (30 days); the digest covers them like the rest of `harness`. `runs.csv` gains `seriesCooldownMs`, `seriesIdleBeforeMs` and a Compute Pressure summary per run: `pressureSamples` (the run's `pressure-change` events) and `pressureCriticalFraction`, `pressureSeriousFraction`, `pressureFairFraction`, `pressureNominalFraction` (fractions of the suite wall time in each state, from the event timestamps and the suite start and end; empty when the run has no sample), computed by the new export `pressureStateFractions()`. The seven columns follow `coldStart`; the `rv_*` columns move seven places right. The columns are the basis of an analysis-side exclusion of runs with heavy `critical` pressure; no leaderboard or validation rule reads them. Additive, so no schema version change. The package README and the dataset's `SCHEMA.md` document the fields and the columns.

### Changed

- **bench:** the copyable preset link on `/bench/run` now always carries `cooldown=<minutes>` (after `runs`); links without it still work and mean no cool-down.

### Fixed

- **transformers, webllm, bench:** the declared sizes of four bench lanes were wrong in both the provider catalogs and the bench pairing catalog, found when a run's `declaredBytes` for Transformers.js Llama 3.2 1B (398,458,880) was compared with its real q4 download. Every size-declaring lane was re-checked against the files its provider fetches, summed from the Hugging Face tree API:
  - Transformers.js Llama 3.2 1B Instruct (q4): 1,704,451,656 bytes, declared 380 MiB. The catalog carried a figure below even the q4f16 build; the provider loads `dtype: 'q4'`, whose decoder keeps its weights in a 1,692,672,000-byte external data file.
  - Transformers.js Qwen3 0.6B (q4, both lanes): 928,224,461 bytes, declared 570 MiB (the q4f16 file's size).
  - Transformers.js Gemma 4 E2B: 5,163,395,208 bytes, declared 1,500 MiB. The multimodal load creates the audio and vision encoder sessions as well as the text ones, so the download is the q4 `embed_tokens` and decoder, the fp16 vision encoder and the fp32 audio encoder. Gemma 4 E4B, not a bench lane, is corrected in the provider catalog to 7,160,140,415 bytes (declared 3,000 MiB) by the same count.
  - WebLLM SmolLM2 135M (q0f16): 271,206,869 bytes, declared 78 MiB (the q0f16 build keeps fp16 weights).
  - Within 10% and left as they are: WebLLM Qwen3 0.6B (347 MB real, 350 MiB declared) and Llama 3.2 1B (704 MB real, 712 MiB declared). Exact already: both LiteRT files and every GGUF (corrected in 2.13.2).

  The runner's download estimate, the provider READMEs, the docs and blog model tables, and the Writing Tools Write block's fallback label (Llama 3.2 1B, now ~1.7 GB) say the real sizes, and a new drift-guard test in `apps/ui/scripts/bench-catalog.test.ts` pins every declared size to the verified download within 10%. The declared size also selects a cell's decode-rate envelope class at validation: Transformers.js Llama 3.2 1B moves from the "up to 500 MB" class (4,000 chars/s) to the "up to 2 GB" class (1,500) and Transformers.js Gemma 4 E2B from the "up to 2 GB" class to the "over 2 GB" class (1,000); Qwen3 0.6B and SmolLM2 135M stay in their classes. Archived runs carry their own declared sizes and are validated as they were; none would have been flagged under its corrected class either (the highest Transformers.js Llama 3.2 1B decode on file is 704 chars/s, the highest Gemma 4 E2B decode 210). The envelope table is unchanged, so the protocol (`localmode-bench/5`) is too.
- **bench:** the pre-run download estimate on `/bench/run` counts each model file once. It merged only lanes whose catalog entries share a file URL, so the SmolLM2 135M GGUF (no URL in the catalog) was counted for both llama.cpp lanes and the Transformers.js Qwen3 0.6B q4 files for both the WASM and the WebGPU lane, although the second lane loads them from the provider cache: Quick read 495 MB instead of 394 MB, Standard 3.5 GB instead of 2.5 GB and Thorough 16.4 GB instead of 15.5 GB. Lanes now share a file when they share its URL, or its provider cache, model id and quantization (`estimateDownloadBytes()` in the bench catalog, with a unit test over the three suites). Display only: what is downloaded, measured and recorded, including each cell's `declaredBytes`, is unchanged.

## [2.16.0] - 2026-09-24

**Released:** `@localmode/bench` 0.9.0.

### Added

- **bench:** runner conveniences on `/bench/run` for long series and study participants. The protocol (`localmode-bench/5`), the measurement rules, the plausibility rules and the scoring are unchanged.
  - **Runs** (1 to 30, default 1): a series of consecutive runs with the same suite, quality lane, lanes, publishing and cache setting. Each run executes on a fresh page load, because the Transformers.js lanes share one ONNX Runtime WebAssembly heap per page that never shrinks and the analysis counts one fresh page load as one independent sample. The series state lives in the runner's localStorage; after each run the page keeps the result (published, or downloaded as JSON when publishing is off or the submission fails; a rate-limited submission is waited out), reloads itself and starts the next run without a click. A "Series: run k of N" read-out lists the completed runs with their raw links, the elapsed time and an estimate from the mean run duration, with **Stop series** (after the run in progress, never mid-run; at once when idle) and **Copy summary**. A run that fails, is cancelled, or takes the page down pauses the series with the reason and a **Continue series** button, so a crashing run cannot loop; the unfinished-run recovery card works as before.
  - **Clear model caches** (asks first in an `alertdialog`, disabled during a run): deletes the model files the providers keep for the site, namely Transformers.js (Cache API `transformers-cache`), WebLLM (Cache API or IndexedDB `webllm/*`), LiteRT (Cache API `litert-models`) and wllama (the OPFS directory `cache`, through wllama's own `clearAllModelCache`, with a direct removal as the fallback), then lists what was deleted and the site's storage use before and after. The bench's crash-recovery database, the service worker's caches and the runner's localStorage keys are never touched. The card states that Gemini Nano (browser-wide) and the browser's HTTP disk cache are not affected: provider caches cleared, not a fresh browser profile. **Clear caches after each run** repeats the clear after every run (after the result is published or exported), so the next run loads cold.
  - **Link presets**: `/bench/run?tier=quick|standard|thorough&quality=on|off&runs=N&cold=on|off&publish=on|off` prefills the controls (with a copyable link for the current settings). A link never starts a run; only the reload inside a series does.
  - A screen wake lock is held while a run or series is active and requested again when the tab returns to the front, with a status line ("Screen kept awake" / "Wake lock unavailable in this browser"); the tab title shows the series progress (`3/10 · LocalMode Bench`).
- **bench 0.9.0:** optional run-file fields `harness.series` (`{ id, index, count }`) and `harness.coldStart: 'provider-caches-cleared'` (set only when the run started right after a clear that left the provider stores empty; a fresh browser profile cannot be detected from a page and is never claimed). Validation accepts them and rejects malformed values, the digest covers them, and `runs.csv` gains `seriesId`, `seriesIndex`, `seriesCount` and `coldStart` (after `validationFlags`; the `rv_*` columns move four places right). Additive, so no schema version change. The methodology page and the dataset's `SCHEMA.md` document the fields, the series behaviour, the clear semantics and the link parameters.

### Fixed

- **bench:** `pnpm test` in `packages/bench` ran no tests ("No test files found"); it now runs the package's suite through the workspace Vitest config.

## [2.15.3] - 2026-09-23

**Released:** `@localmode/bench` 0.8.3.

### Added

- **bench:** the analysis tooling (`scripts/analyze.ts`) exports the per-cell and per-run records the CSVs did not carry, as additive columns and two new files; every existing column keeps its name, position and value (checked row for row against the previous output on the full dataset clone: 101 runs, 1,025 leaderboard rows, 8,780 iteration rows). `iterations.csv` gains `cellId`, `chunkCount`, `generatedTokensApprox` and `generatedTokensFidelity` (provider-reported output tokens and how they were counted), `tokensPerSecApprox` (decode chunks per second, one chunk counted as one token, empty unless every iteration of the cell passes the stream-coherence gate, the same rule the leaderboard applies), `finishReason`, `gates` and `embedCount`. The new `cells.csv` has one row per cell with the warmup duration, the load record (duration, cache probe, declared bytes, progress-sample count and span), every `runtimeConfig` field the llama.cpp and Transformers.js lanes record (`n_threads`, `n_threads_used`, `multithread`, `n_ctx`, `n_gpu_layers`, `offloadedLayers`, `webgpu_adapter`, `cache_prompt`, `mmproj`, `dtype`, `device`, `worker`), the memory samples (`memoryBaseline`, `memoryPostLoad`, `memoryPostRun`, `memoryAtError`, `memoryApi`), the quality result and the error. The new `runs.csv` has one row per run with the harness build, suite, device class, browser, OS, cores, memory, screen, WebGPU adapter, cell counts by status, suite duration, the validation verdict and flags, and one `rv_*` column per runtime package version. New exports `runsToCellsCSV`, `runsToRunsCSV` and `runtimeVersionColumn`; the columns are documented in the package README. Run files are now read in sorted path order. The protocol (`localmode-bench/5`), the plausibility rules, the scoring and the leaderboard are unchanged.

## [2.15.2] - 2026-09-23

**Released:** no npm package; the `/bench` site only.

### Documentation

- **bench:** the methodology page states a known device limitation. On the Galaxy Z Fold 7 (Adreno 830, Chrome 153 on Android) the llama.cpp WebGPU lane (`wllama-webgpu`) generates incoherent SmolLM2 text: all 18 timed chat iterations recorded on that phone across six runs and three protocol versions are strings of isolated letters and word fragments, and the lane's MMLU cell fails in every run with "Invalid typed array length". The WASM lane and every other runtime on the phone produce coherent text, and no other device in the dataset shows this. The degenerate-output gate is length-based and 17 of the 18 iterations pass it, so the cells stay `ok` and the adreno-830 `wllama-webgpu` SmolLM2 chat rows (about 60 chars/s under v4 and v5, plus a v2 adreno-830 llama.cpp row from before the lane split) are kept. Every iteration's generated text is in the run files. An output-coherence check would be a protocol change and is reserved for a future version; the protocol (`localmode-bench/5`), the plausibility rules and the scoring are unchanged, and no run is re-scored or quarantined.

## [2.15.1] - 2026-09-23

**Released:** no npm package; the `/bench` site only.

### Fixed

- **bench:** the `/bench/run` runner stamped a hard-coded `harness.version` of `0.8.0` on every run (and on the index entry's `harnessVersion`), so runs since `@localmode/bench` 0.8.1 carried a stale harness version while `harness.runtimeVersions['@localmode/bench']` on the same run said 0.8.2. The version now comes from the same build-time map as `runtimeVersions` (`benchHarnessVersion()` in `src/lib/bench/runtime-versions.ts`, filled by `next.config.mjs` from the installed `@localmode/bench`), so the two fields always agree; a build that did not stamp the map records `'unknown'` instead of a guessed version. The field is still a plain semver string. A new unit test (`scripts/bench-harness-version.test.ts`) loads the real `next.config.mjs` and checks the stamp against `packages/bench/package.json`, and the bench e2e spec now asserts the package version instead of the literal. Archived runs keep the value they were published with: for a run built with `@localmode/bench` 0.8.1 or 0.8.2 (2.14.1 to 2.15.0), `harness.version` reads 0.8.0, so read `harness.runtimeVersions['@localmode/bench']` and `harness.commit` instead.

## [2.15.0] - 2026-09-23

Security release: every open Dependabot alert on the default branch (190 alerts: 9 critical, 88 high, 79 medium, 14 low) closed at the source, plus one exposure the alerts did not list.

**Released:** `@localmode/core` 2.5.0, `@localmode/transformers` 4.1.3, `@localmode/pdfjs` 2.1.0, `@localmode/langchain` 2.1.2.

### Added

- **core 2.5.0:** `VectorDBMiddleware` gained `wrapSearch`/`wrapGet` (they receive a `doSearch()`/`doGet()` continuation, so a middleware can answer without touching the database) and `afterUpdate`/`afterDeleteWhere`/`afterImport`; `wrapVectorDB` and `composeVectorDBMiddleware` wire them, first middleware outermost. `TextLoader`, `JSONLoader`, `CSVLoader` and `HTMLLoader` and their `create*Loader()` factories take constructor options; per-call options still win.
- **pdfjs 2.1.0:** `PDFExtractResult.metadataError` reports why a document's information dictionary could not be read (see Fixed).

### Changed

- **core 2.5.0:** `encryptionMiddleware`'s `encryptVectors` now defaults to `false`, and passing `true` throws a `ValidationError`: a vector index cannot store or search ciphertext, so the old default failed every `add()`. Metadata encryption is unchanged.
- **pdfjs 2.1.0:** PDF.js 6 raises the runtime floors to Node.js 22.13+ for Node-side extraction (Node 20 dropped) and Chrome 125+ / Safari 18+ in the browser.
- **transformers 4.1.3:** `@huggingface/transformers` is pinned `~4.2.0` instead of `^4.2.0` (see Security).
- **Root `engines.node` is `>=22.13`** (was `>=18`, which nothing in the toolchain has satisfied for a while: Next 16 needs 20.9, Vite 7 / Vitest 4 need 20.19 or 22.12, and the root suite now runs pdfjs-dist 6, which needs 22.13). Published packages' `engines` are unchanged.

### Fixed

- **transformers:** `test:validate` could not run under vitest 4 and its source scan resolved the wrong directory; both fixed (see the package changelog).
- **pdfjs:** Node-side extraction was silently degraded. PDF.js 6's default build calls `Map.prototype.getOrInsertComputed`, which Node does not expose through Node 25, so `getMetadata()` threw and `extractPDFText()` returned `metadata: undefined` for every document while a bare `catch` hid the reason; PDF.js also asked for its `legacy` build and for a `standardFontDataUrl`. Node now loads the `legacy` build and requests `useSystemFonts: true`, the font path browsers already take, and a metadata failure is reported on the new `PDFExtractResult.metadataError` instead of being swallowed. Browsers keep the default build. `parsePDFDate` read a `Z` zone as local time and ignored `+HH'mm'` offsets; fixed, with out-of-range dates returning `undefined`. `PDFLoader` forwards `metadataError` into document metadata and fills the declared-but-empty `metadata.pdf`. The package now has a real-PDF test suite (39 cases); the previous tests were mocks that never imported the package and are removed.
- **core 2.5.0:** the 49 stale skipped tests in `tests/{loaders,middleware,capabilities,security}.test.ts` were rewritten as real tests and exposed bugs that are now fixed: `cachingMiddleware` never cached (and wrote `__cacheHit` into the caller's options), `loggingMiddleware` never logged search timing, `encryptionMiddleware` failed every `add()` by default (see Changed), `loadDocument()` auto-detection always chose the text loader, the loader factories and classes discarded their options, browser HTML loading merged adjacent blocks, `isOPFSSupported()` accepted any `navigator.storage`, `encryptText: false` still encrypted strings, `wrapVectorDB`'s `onError` could not suppress an error although its contract said so (returning `true` now resolves the operation with a neutral value), `cachingMiddleware` ignored `maxEmbeddings`, and `createVectorDB()`'s `encryption` option was never read, storing plaintext while looking encrypted (deprecated; `enabled: true` now throws with the working `encryptionMiddleware` path in the hint). The `checkQuotaWithWarnings()` suite that vitest 4 warned about (a non-top-level, inert `vi.mock`) is rewritten against the real functions. The root suite now skips only the three `HF_LIVE`-gated wllama tests. Docs and READMEs that showed the old behaviour (`encryptVectors: true`, `cachingMiddleware` on an embedding model, a `textField` option) are corrected. See the core changelog.
- **ui:** `next.config.mjs` imported the redirect table from a `.ts` file, which Node loads as module-type-ambiguous and warned about (`MODULE_TYPELESS_PACKAGE_JSON`) on every build and start. The single-source table is now `src/lib/legacy-redirects.mts`; the redirect-walk spec and the config still share it.
- **ui / docs (OG images):** `public/og-default.png` in both apps was 2400×1260 while the homepage and root-layout metadata declared 1200×630; both files are now exactly 1200×630. The ui SEO spec asserted the homepage `og:image` was a generated `/api/og` URL, contradicting the deliberate static cover, so it had never passed; it now expects the static cover and fetches it, checking 200, `image/png` and 1200×630 read from the PNG header.
- **ui (docs prop tables):** `src/lib/type-table-data.ts` read component sources through one dynamic `path.join(process.cwd(), sourcePath)`, which Next 16.3 now reports ("Dynamic filesystem access causes tracing of the whole project") and which traced 970 files / 48.6 MB (`public/`, `e2e/`, `content/`, `e2e-artifacts/`) into the `/docs/[[...slug]]`, `/api/search` and `/api/md` server bundles. Reads are now rooted at a literal `registry/` with an escape check plus a fixed path for `dom-baseline.ts`, and the source is handed to the generator as content: 256 files / 1.2 MB. Covered by the new `scripts/type-table-data.test.ts` against the real generator.
- **ui (e2e):** headed Playwright runs crashed the renderer on `/blocks/writing-tools` because Playwright's Chromium exposes the Chrome Built-in AI globals without a running service. The base `launchOptions` now disable those features; `writing-tools.spec.ts` keeps them enabled per file because its download-gate lane needs the globals present.
- **ui (registry `ui/lib/use-environment`):** `useCapabilities()` reported OPFS support for any `navigator.storage`; it now requires `navigator.storage.getDirectory`, the same check core's `isOPFSSupported()` uses (both the registry source and the app's `src/lib` mirror). The `/blocks` gallery card no longer says local storage is "encrypted on-device" by default: `encryptionMiddleware` is opt-in and never encrypts vectors.
- **docs:** `postcss.config.mjs` exports a named config (the one `import/no-anonymous-default-export` lint warning). Root `eslint.config.mjs` ignores `.claude/**`, so agent worktrees under it no longer fail `pnpm lint`.

### Security

- **Next.js 16.2.1 → 16.3.6** in `apps/ui` and `apps/docs` (with `eslint-config-next`). Closes 75 alerts across 25 advisories, including the two criticals (unauthenticated RCE on Windows-hosted servers; RCE in the Image Optimization API with AVIF) and the middleware/proxy bypasses, SSRF in rewrites and Server Actions, and the Server Components / Cache Components DoS fixes. No source change was needed: `proxy.ts`, the COOP/COEP headers, the redirect table, `next/og` and Fumadocs all run unmodified; every route, redirect and the registry token gate were re-checked on the production server.
- **vitest → 4.1.11 in every workspace** (critical: the UI server could read and execute arbitrary files below 3.2.6). `chrome-ai`, `langchain` and `devtools` migrated from vitest 3; test counts are identical. `happy-dom` 16 (critical VM-context escape) was never declared anywhere, only a stale optional peer left in the lockfile, and is gone.
- **`@huggingface/transformers` pinned `~4.2.0`** (`@localmode/transformers` 4.1.3). 4.3.0 was tried first and fails every WebGPU language model on Apple Silicon Chrome (see the package changelog). The alerts under its runtime are closed with overrides instead: protobufjs 7.6.6 (critical: arbitrary code execution) and `@protobufjs/utf8`, adm-zip 0.6.1 under onnxruntime-node, sharp 0.35.4 (libvips/libheif CVEs) for the Node image path. Fresh consumer installs resolve the same versions because the parents' ranges admit them.
- **`@localmode/pdfjs` 2.1.0: `pdfjs-dist` 6.3.289.** Not on the alert list because the lockfile sat at 5.5.207, one release below the vulnerable range, but the `^5.5.207` range let any fresh install pull a version that executes arbitrary JavaScript on opening a malicious PDF. The runtime floors it brings are listed under Changed.
- **`@localmode/langchain` 2.1.2:** `@langchain/core` range `>=0.3.80 <1.0.0 || >=1.1.0 <2.0.0` (serialization injection below 0.3.80; 1.0.0–1.0.6 shipped a broken `dist/`); `langsmith` 0.10.5 (prompt-pull deserialization).
- **Direct bumps:** `sharp` 0.35.4 and `tsx` 4.23.15 in `apps/ui`, `postcss` 8.5.23 in both apps, `vite` 7.3.6 at the root, `ai` 6.0.287, `@ai-sdk/provider` 3.0.16 and `@ai-sdk/provider-utils` `^4.0.33` (resolved 4.0.52) as `@localmode/ai-sdk` dev dependencies.
- **Root `pnpm.overrides` (35 entries, 31 of them version-scoped)** for the transitives no direct bump reaches, each kept inside the parent's declared major: hono 4.13.8 and `@hono/node-server`, undici 7.29.1, ws 8.21.3, fast-uri 3.1.8, ip-address 10.7.2, path-to-regexp 8.4.2, qs, body-parser, uuid, js-yaml 3.15.2 / 4.3.2, brace-expansion 1 / 2 / 5, minimatch 3 / 9, picomatch 2 / 4, flatted, browserslist 4.29.0 (`@serwist/next` pins it exactly), baseline-browser-mapping, `@babel/core`, `@humanfs/node`, nanoid, rollup 4.63.4, postcss-selector-parser, image-size 2.0.4 (the advisory still lists no patched version; 2.0.4 was published 2026-09-14 by the long-standing maintainer and its ICNS/HEIF/JXL loop guards were checked in the tarball), and ajv 6.15.0 (found by `pnpm audit`, not Dependabot). Overrides also rewrite peer ranges, so a from-scratch resolve was checked for unmet peers.
- **Left open, deliberately:** esbuild GHSA-g7r4-m6w7-qqqr (low; `esbuild serve` on Windows) on the 0.27 line that vite 7, tsup 8 and fumadocs-mdx pin; closing it needs a vite 8 / tsup major. The `tsx` path is closed (its `~0.28.0` copy re-resolved to 0.28.2). An esbuild override is not an option: pnpm rewrites peer ranges too, and it broke tsup's `bundle-require` peer. `pnpm audit` reports nothing else.

### Verified

Root suite 191 files / 2781 tests passing, 3 skipped (the `HF_LIVE`-gated wllama discovery tests; before this release 191 files / 2633 passing / 52 skipped), `test:types`, `typecheck`, `lint` (0 errors), `check:peers`, the transformers model-downloading integration suite through onnxruntime-node plus a cold-cache download through transformers.js 4.2.0, Node runs of the built pdfjs (ESM and CJS, `Z` and offset dates, empty stderr) and core middleware/loader dists, both app builds (0 warnings), the `apps/ui` unit suite (199), both consumer lanes through the real `shadcn` CLI (blocks and primitives portability), the complete headless Playwright suite (164 tests across 20 spec files, run twice, the second time on the final tree) plus headed real-WebGPU runs of the agents, WebLLM and LiteRT lanes and a headed platform run proving the Chrome Built-in AI launch flags, and real-Chrome runs of semantic search with a PDF (default-build worker 6.3.289, page attribution), chat and RAG chat on WebGPU, sentiment analysis, PII redaction, and the writing-tools page. Headless Chrome has no WebGPU, so the transformers.js 4.3.0 regression was only visible in the real-browser sweep.

## [2.14.2] - 2026-09-22

**Released:** `@localmode/chrome-ai` 2.2.1, `@localmode/bench` 0.8.2.

### Fixed

- **chrome-ai:** a response Chrome cuts at its output cap ("The response exceeded output limits and was truncated.", a `QuotaExceededError` on Chrome 153) was reported as an oversized input and, in `doStream()`, the text already streamed was discarded. `doStream()` now keeps that text and ends with `finishReason: 'length'`; `doGenerate()` fails with the new code `chrome-ai-output-truncated`. Found by the bench's Gemini Nano long-context cell failing intermittently on two Apple laptops after Chrome 153; from now on that cell records a truncated answer instead of an error.
- **bench (analysis tooling):** `scripts/analyze.ts` analysed only runs of the current protocol (it validated each file as a submission). `validateSubmission(run, { anyProtocol: true })` accepts every archived protocol identifier; the CLI uses it and now covers the whole dataset, each row labelled by `protocol`.

## [2.14.1] - 2026-09-22

**Released:** `@localmode/bench` 0.8.1 (docs only).

### Added

- **bench:** the leaderboard table is paginated: 25 rows a page (25 / 50 / 100 selectable), Previous / Next buttons with accessible names, a live "Showing x to y of n rows · page p of q" status, and a return to page 1 whenever a filter changes (a page past the end after a filter shrinks the list clamps to the last page). The arithmetic is a pure helper (`src/lib/bench/paginate.ts`) with unit tests; the table now holds 672 rows across two protocols, which was one long scroll.

### Changed

- **bench (docs):** the v5 wording on the 2,048-token context overstated its effect. The first v5 Thorough run on the 16 GB M4 shows the llama.cpp CPU lane's Gemma 4 E2B chat cells running as before while its quality cell still fails on the per-request state allocation (`std::bad_alloc`) with the 3.46 GB weights resident in the 4 GB wasm heap; it is recorded as an error exactly as under v4. The methodology page's v5 entry and the bench README now say so. No code change; the protocol is unchanged.

## [2.14.0] - 2026-09-22

Protocol `localmode-bench/5`: the llama.cpp lanes' thread count and context size, and a leaderboard that shows v4 beside v5.

**Released:** `@localmode/bench` 0.8.0.

### Changed

- **bench (protocol v5):** the two llama.cpp lanes request half the browser's logical thread count (at least two) instead of all of it, and load with a 2,048-token context (embedding lane: 512). Under v4 the CPU lane asked for every logical thread; on hybrid and SMT processors that pool runs at half speed with high variance (native M1 Pro sweep: tg128 178 ± 42 tokens/s at 10 threads, 395 ± 16 at 8; browser: the M4 Max's 16-thread pool decoded a third as fast as the M1 Pro's 10). The browser exposes no core topology, so half the logical count is the rule; it lands on the performance or physical cores on every lab device. The smaller context keeps the Gemma 4 E2B GGUF's KV cache inside the CPU lane's 4 GB wasm heap, where the 8,192 default failed the quality cell on every v4 run. `n_ctx` joins `n_threads`, `multithread` and `n_threads_used` on each cell's `runtimeConfig`. Every other lane measures exactly as under v4. Harness 0.8.0.
- **bench (leaderboard):** rows carry their protocol version and never mix versions; the leaderboard shows the current protocol and the previous one side by side (`LEADERBOARD_PROTOCOL_VERSIONS`), with a Protocol column and filter, so the v4 archive stays visible next to v5 instead of disappearing on the bump. The API's `runs` count and the page caption follow the same rule; the methodology page documents it and carries the v5 changelog entry.

## [2.13.3] - 2026-09-22

**Released:** `@localmode/wllama` 3.4.2.

### Added

- **wllama, bench:** the llama.cpp lanes record the thread pool wllama actually built. `WllamaLanguageModel` and `WllamaEmbeddingModel` expose `threadPool` (`{ multithread, threads }` from the runtime's own `isMultithread()` / `getNumThreads()`), and the bench adapters write it into each wllama cell's `runtimeConfig` as `multithread` and `n_threads_used` beside the requested `n_threads`. Firefox 156 ran both llama.cpp lanes at single-thread speed with 10 threads requested and the run files could not say why; from now on a pool that fell back to one thread is recorded as such. Metadata only, no measurement changes; the protocol version is unchanged.

## [2.13.2] - 2026-09-22

**Released:** `@localmode/wllama` 3.4.1.

### Fixed

- **wllama, bench:** the declared sizes of five GGUFs were wrong in both the provider catalog and the bench pairing catalog, found when the native baseline downloaded the same files: SmolLM2 135M Q4_K_M is 105 MB (declared 70), Qwen3 0.6B Q4_K_M is 397 MB (declared 530), Llama 3.2 1B Q4_K_M 808 MB (declared 750), Gemma 4 E2B Q4_K_M 3.46 GB decimal (declared 3.46 GiB), bge-small-en-v1.5 Q8_0 36.8 MB (declared 35 MiB). The runner's download estimate and the docs tables now say the real sizes. The declared size also selects a cell's decode-rate envelope class at validation: Qwen3 moves from the "under 1 GB" class to the "under 500 MB" class (a looser bound, 4,000 chars/s instead of 2,500; the highest Qwen3 decode ever recorded is 550). Archived runs carry their own declared sizes and are validated as they were; the envelope table itself is unchanged, so the protocol version is not.

## [2.13.1] - 2026-09-22

**Released:** `@localmode/bench` 0.7.1.

### Added

- **bench:** device subclass on the leaderboard. Rows grouped by the coarse device class (platform + WebGPU vendor-architecture) put every Apple Silicon generation in one `macos/apple-metal-3` row. `refineDeviceClass()` splits a class by the GPU model where the browser names a specific part (`macos/apple-m1-pro`, `macos/apple-m4-max`, `android/adreno-650`) and leaves it alone where the browser names nothing more specific (WebKit's `Apple GPU`, the generation-less `AMD Radeon(TM) Graphics`, Firefox's masked buckets) or where there is no WebGPU. The leaderboard and the recent-submissions table show the subclass with the coarse class beneath it; index entries written from now on carry `deviceSubclass`, and older entries derive it from their `gpuModel` at aggregation time, so the archive is not rewritten. CSV exports gain a `deviceSubclass` column.

### Changed

- **bench:** the methodology page now states the two device groupings (coarse class and GPU-model subclass, with what each browser can supply), the frozen iOS 18_7 token, Chrome's capped memory buckets, the single-use nonce and the 20-per-hour submission limit, and that a runtime-raised abort is an error with a retry while only the submitter's Cancel ends a run.

### Fixed

- **bench:** iOS runs from Safari 27 reported `os.version: "18.7"`. WebKit froze the OS token in the UA at `18_7`, so an iPhone on iOS 27 reads as iOS 18.7 in Safari and in Firefox for iOS, while Chrome for iOS on the same phone writes the real version. The capture marks the frozen pairing `unknown-frozen` (a Safari with a `Version/18.x` token keeps its real 18.x); the Safari version stays the signal for the OS generation. Harness 0.7.1. Archived runs are unchanged.

## [2.13.0] - 2026-09-21

Privacy pass on the published run files, from a review of what a public run carries.

**Released:** `@localmode/bench` 0.7.0 (result schema 3; protocol unchanged at `localmode-bench/4`).

### Changed

- **A public run file no longer carries anything that locates or tracks a person.** The capture dropped the time zone, UTC offset and calendar (a city-sized location), the language list, the battery's exact percentage and time-to-full (a device-tracking signal; the level is kept to the quarter, plus whether it is charging), and display preferences; the submission nonce is stripped by the server and the digest no longer covers it, so a published file verifies as submitted; the submitter's network address was never written and the README now says so. `scrubRunForPublication()` is the one rule, applied on every submission (a payload from a page built before schema 3 is cleaned, its digest recomputed and `scrubbedAt` stamped) and by the dataset repository's `tools/scrub-publication.mjs`, which rewrote every file published earlier on 2026-09-21. The methodology page states what a public file does not carry.
- **A session nonce fronts one submission.** Nonces are valid for six hours and were reusable, so a nonce copied from a fresh public run could front fabricated submissions until it expired; the server now consumes each nonce once (Redis `SET NX EX` when bound, in-instance set otherwise) and answers 409 `nonce-used` on a repeat. Route-level tests drive the real handler with only GitHub stubbed: clean submission published minus the nonce with the client digest intact, pre-schema-3 payload scrubbed with a recomputed digest, nonce refused on second use, wrong digest refused before anything is stored.
- **Phone guidance on the runner page names the memory precondition.** The first crash record from an iPhone under 2.12.2 showed the pattern: the page started short on memory (the Transformers.js WASM worker could not get a heap for a 35 MB model, "[wasm] RangeError: Out of memory"), and the browser killed the page twelve seconds later during WebLLM's first inference; the same phone had completed four Quick runs earlier in the day. The note under the suite picker now tells phone users to close other tabs and apps first, and that a run whose first model fails with "out of memory" rarely survives the next one.

## [2.12.2] - 2026-09-21

**Released:** `@localmode/bench` 0.6.1.

### Fixed

- **"Too many submissions" during a multi-device batch.** The submit endpoint allowed 5 submissions per hour per client address, and every device in a household (or an office, or a campus) shares one address, so the sixth run of a lab batch was refused. The limit is now 20 per hour per address (`SUBMIT_RATE_LIMIT`; the nonce, digest, shape, and plausibility checks are what keep the dataset honest, this only bounds volume), a refusal carries `Retry-After` and `retryAfterSec` with a message that names the wait, and the runner keeps the run and resubmits it by itself when the window opens, with a live countdown ("Retrying automatically in 12 m 30 s"); "Retry submission" and Export JSON stay available meanwhile.
- **"Cancel run" reacts on the first click** (`@localmode/bench` 0.6.1). The runner's watchdog raced each unit of work only against its own timeout, so a cancel during work that ignores its abort signal (a model download in flight, a generation inside a runtime with no stop) waited for that work to finish: several seconds and repeated clicks on a download. The parent abort now rejects the watchdog immediately, the abandoned work's late outcome is discarded quietly, and a model that finishes loading after its cell was cancelled is released instead of leaking a runtime. The button switches to "Stopping…" on the click itself. Measured in real Chrome on the dev build: overlay gone 203 ms after a click during a model load and 98 ms during a WebLLM generation, no unhandled rejections.
- **The run overlay never extends past the viewport and scrolls inside itself.** On windows at least 640 px wide the overlay centered the dialog in a flex box, so a dialog taller than the window was cut off at the top (unreachable by scrolling) and at the bottom, and the page behind it kept its own scrollbar. The dialog is now capped at the viewport minus its margins and scrolls internally, and the page scroll is locked while the overlay is open, so there is one scrollbar. Measured in real Chrome at 1100x560: dialog from 24 px to 536 px, 708 px of content scrolling in a 510 px box, page scroll locked and restored on close. Taking focus on open no longer scrolls the top margin away.
- **`pnpm run dev` and the new `pnpm run dev:bench` watch the workspace packages.** The root `dev` ran the packages' `tsup --watch` sequentially, so the first watcher blocked everything after it and an edit to `@localmode/bench` or `@localmode/wllama` reached the app only after a manual build; `dev` is now parallel, and `dev:bench` runs the two package watchers with the ui dev server.

- **The overlay's retry notices are one plain sentence each.** A retry showed the raw error with its stack fragment (a Windows run listed five lines of "Failed to execute 'requestDevice' on 'GPUAdapter': D3D12 create command queue failed with DXGI_ERROR_DEVICE_REMOVED (0x887A0005) at CheckHRESULTImpl (..\\..\\third_party\\dawn\\...)"). The overlay now says "<lane> · <workload>: the GPU device was lost; trying again (attempt 2)", with the memory, download, and stall cases named the same way, shows the last three, and leaves the full error, cause, and stack on the cell's `attempts` in the run record.

- **Crash diagnostics carry the page's memory at the last phase change.** Where the browser exposes it (Chromium), the saved attempt records the page memory sampled when the running lane's phase began, and Copy diagnostics prints it ("page memory when that phase began 1.95 GB"), so a page killed during a model load on an 8 GB machine can be told apart from a GPU crash.

- **A runtime's own `AbortError` no longer ends the run as "Cancelled"** (`@localmode/bench` 0.6.1). The runner and the page equated any `AbortError` with the Cancel button, so when a browser dropped a model download mid-suite (an Android phone did this on every attempt) the overlay closed with "Cancelled" and every finished cell was discarded. A cancel is now recognised only from the page's own abort signal; a runtime-raised AbortError is a cell error, recorded with its message and retried once, and the run continues.

## [2.12.1] - 2026-09-20

Phone fixes for `/bench/run` from the first iPhone attempts under v4 (site only; no package changes).

### Fixed

- **The runner page fits a phone again.** A lane's unavailability reason (on iOS Safari, the sentence explaining that wllama's model cache needs the Origin Private File System, with the browser's error inside) was rendered in a no-wrap badge inside a non-shrinking column, so the row and the whole page grew to about three viewport widths and nothing wrapped. Reasons and notes now wrap under the lane name, the badge only says "unavailable", lane names wrap instead of truncating, and the wllama reasons are shorter. Verified in WebKit at the iPhone 15 viewport: page width 393 px, no element past the edge (the badge had reached 1123 px).
- **A run that ends with a page reload can be diagnosed from the phone.** The saved attempt now records the phase of the lane that was running (load, warmup, reload, or the timed work) as well as its id, the recovery card says "ended during `<cell>` (`<phase>`)", and a "Copy diagnostics" button puts a plain-text summary (suite, harness, finished cells with their errors, the cell and phase running when the page ended, browser, OS, GPU, WebGPU, storage quota) on the clipboard, with an inline text box as the fallback. Mobile browsers reload a page that exceeds its memory budget without leaving a trace; the iPhone reload reported today happened on every attempt, with and without the quality lane, and this is the record needed to pin it to a lane.
- **The overlay's step number follows the checklist.** "Step N of M" came from the runner's cell counter, which does not count skipped cells or warm reloads, so it drifted from the "done" counter (the M4 Thorough run showed "Step 60 of 69" beside "62 of 69 steps done"); it now uses the same ordered plan as the checklist, and a warm reload keeps the group's step in the header with a "Reloading … from the cache" status line instead of "Preparing the run".

## [2.12.0] - 2026-09-20

Protocol bump to `localmode-bench/4` from the first two runs measured under v3 (a Quick and a Thorough suite on the M4 Mac mini, both green except the three cells below), plus the runner fixes those runs surfaced.

**Released:** `@localmode/wllama` 3.4.0 · `@localmode/bench` 0.6.0.

### Changed

- **The llama.cpp lanes load every language model as text only** (`@localmode/bench` 0.6.0, protocol `localmode-bench/4`). The wllama provider attaches the vision projector its catalog lists for Gemma 4 E2B, so under v3 both llama.cpp lanes loaded a 557 MB projector the text-only workloads never use: its download and CLIP warmup ran inside the untimed warmup, the provider turned wllama's model cache off for the two-file source (the warmup and the warm reload re-downloaded the 3.46 GB weights), and on the CPU lane the pair did not fit the 4 GB wasm32 heap: `clip_model_loader::warmup` aborted with "insufficient memory (attempted to allocate 157.81 MB)" and all three `wllama/gemma-4-e2b` cells errored, retried, and errored again on the Thorough run. Loaded alone, the same GGUF runs on the CPU lane (36 layers, "offloaded 0/36 layers to GPU", 24 tokens in 2.8 s on the M4). The bench adapters pass the new `vision: false` and record `mmproj: false` in every wllama language cell's `runtimeConfig`. Only the Gemma 4 E2B pairing measured differently under v3; the version is bumped anyway so no leaderboard row mixes the two configurations, and the two v3 runs stay archived as v3.
- **`@localmode/wllama` 3.4.0: `vision: false`** loads a catalog vision model (Gemma 4 E2B/E4B, Holo2) without its projector: no projector download, no projector memory, wllama's model cache stays enabled, `supportsVision` reports false. `resolveMmprojUrl()` is exported.

### Fixed

- **Warm-reload cells read the reloaded instance's backend and `runtimeConfig` before it is disposed** (`@localmode/bench` 0.6.0); they were read after, which an adapter reporting lazily off a provider that forgets its load report on unload would have turned into stale values. wllama warm-reload cells still carry `offloadedLayers: "unreported"` by design: the warm reload times the provider's preload path (an OPFS cache probe, 340 to 420 ms on the M4), and llama.cpp loads in the untimed warmup of the timed cells, whose `warmupMs` is the real load-from-cache figure.
- **Skipped lanes cost no cooldown** (`@localmode/bench` 0.6.0). Every model group was followed by the policy cooldown (5 to 10 s) and the pressure gate even when all of its cells were skipped, so a Thorough run with most lanes switched off idled for minutes before its first model loaded.
- **The download estimate counts a shared model file once.** The two llama.cpp lanes load the same GGUF from one provider cache; the runner's "est. download" summed it twice.
- **The run overlay's step line follows the model being loaded.** A model group's download and warmup happen before its first timed cell starts, so during a load the overlay kept showing the step that had just finished ("Step 30 of 69: Universal Sentence Encoder" with "downloading 95%" beneath it while LiteRT's Qwen3 was loading); the step line, counter, and status now switch to the lane being loaded, warmed up, or reloaded as soon as its first progress event arrives.

## [2.11.0] - 2026-09-20

Protocol bump to `localmode-bench/3` after the laptop submissions revealed that the wllama lane had been running on WebGPU while labelled WASM, plus the fixes the same batch of runs asked for.

**Released:** `@localmode/wllama` 3.3.0 · `@localmode/bench` 0.5.0.

### Fixed

- **`@localmode/wllama` 3.3.0: `useWebGPU: false` now keeps inference on the CPU, and `gpuAccelerated` tells the truth.** wllama 3.5 offloads every layer to WebGPU by default (`n_gpu_layers` 99999) wherever `navigator.gpu` exists; the provider forwarded nothing for `useWebGPU: false` (so it changed nothing) and computed `gpuAccelerated` from the request. It now passes `n_gpu_layers: 0` for `false`, documents `'auto'` as the effective default, captures llama.cpp's own `load_tensors: offloaded N/M layers to GPU` line through a logger handed to wllama, and reports `gpuAccelerated` and the new `offloadedLayers` from it once loaded (the embedding model gains both; the reranker honors the settings).
- **Bench protocol v3: the wllama lane is split.** Every v2 wllama cell measured on a WebGPU-capable browser is a llama.cpp-WebGPU number recorded as `wasm` (on an Apple M4: SmolLM2 decode 612 chars/s where the CPU path measures 279, TTFT 71 ms vs 668 ms), and its comparison against the Transformers.js WASM lane was GPU against CPU. v3 pins `wllama` to the CPU and adds `wllama-webgpu` (every layer offloaded) over the same GGUF files, derived from the wllama catalog entries so the two cannot drift; the recorded backend follows llama.cpp's offload report, never the request; every cell carries a `runtimeConfig` (threads, GPU layers requested, offload report, device, dtype). The methodology page carries the v3 entry; archived v2 runs stay published as v2. Verified in real Chrome on the M4: the CPU lane logs "offloaded 0/31 layers", the WebGPU lane "31/31", and the run file records `wasm` / `webgpu` with the matching `runtimeConfig`.

### Added

- **The runner cannot get stuck, and you can see that it is alive.** Runs on several lab devices appeared frozen: the status line sat on one iteration with nothing changing. Two causes, two fixes. (1) The Transformers.js WASM lane computed on the page's main thread, so during a generation the page could not repaint at all; that lane now runs inside a dedicated worker (`src/lib/bench/transformers-worker.ts`, its own ONNX runtime instance, model files from the shared Cache API, `runtimeConfig.worker: true`), verified in real Chrome with Qwen3 0.6B: the page updated every second through both timed cells (32 chars/s decode, incremental stream, warm reload 42 s). (2) A lane that genuinely stops (a worker that died, a lost WebGPU device, a hung fetch) is now caught by the harness watchdog (`@localmode/bench` 0.5.0): 2 minutes without a streamed chunk or 3 without load progress aborts the cell, it is retried once with the failed attempt kept on the cell, then skipped, and the run continues to completion and auto-submits. The Progress card shows a live activity line (a pulse that keeps moving even while the main thread is busy, elapsed time in the cell, the current phase, characters and chunks streamed so far, and "last progress N s ago"), an explanatory note after 45 s of silence that distinguishes a session being built from a stall, the watchdog's retry notices, and a "retried ×N" marker in the results table.
- **A hidden tab no longer costs the whole cell.** Browsers throttle background tabs, so a timed iteration taken while the tab was hidden measured the browser's scheduling; the runner used to mark the whole cell invalid and move on. It now sets that iteration aside (kept on the cell as `discardedIterations`), waits up to 10 minutes for the tab to be visible again, and repeats it; nothing starts timing while the tab is hidden. The overlay says "Paused: this tab is not in front" while waiting and explains that hidden measurements are repeated.
- **A run overlay for participants.** While a run is in progress, everything moves into one modal over the page: a clear instruction to keep the tab open, visible, and in front (with the consequence of not doing so, and for paid-study sessions a note that the completion code appears on this page after the upload), overall progress with an estimated time remaining and clock time (measured from this run's own cell durations and observed download rate, priors before that, labelled rough until the first models have run), the current step in plain language (model, workload, iteration, characters streamed, "last progress N s ago"), download bars, the watchdog's retry notices, a per-model checklist in execution order, a warning if the tab went to the background (those measurements are marked invalid), and a Cancel button. Leaving or reloading the page mid-run asks for confirmation. The overlay closes when the run finishes and the results table takes its place.
- **Every cell records its runtime configuration** (`@localmode/bench` 0.5.0 `runtimeConfig`, copied from the adapter's load result onto each cell of the group and onto warm-reload cells): the per-cell equal-care record the methodology asks for. Transformers.js lanes record device, dtype, and whether they ran in the worker; wllama lanes record thread count, GPU layers requested, WebGPU adapter presence, llama.cpp's offload report, and the prompt-cache pin.

## [2.10.0] - 2026-09-19

Closes the gaps the first laptop and phone submissions exposed: a device whose long runs died with the tab and left nothing to diagnose, a wllama WASM abort recorded without its location, a thorough run that silently held only the lanes its submitter left enabled, and a trace bloated by one pressure sample per second.

**Released:** `@localmode/bench` 0.4.0.

### Added

- **Crash-resilient partial runs.** The runner now writes the environment capture and every finished cell to IndexedDB as the suite progresses (`src/lib/bench/partial-run-store.ts`, over the new `onEnvironment` and existing `onCellFinish` hooks). When a tab dies mid-suite, which is what a Standard or Thorough run does on a machine past its memory ceiling, the next visit to `/bench/run` shows the unfinished attempt (suite, cells finished of planned, the cell that was executing) with "Export partial run" and "Discard". The export is the run-file shape marked `partial: true` with the list of unfinished cells; partial runs are never published. Covered by a bench e2e lane that kills the page mid-run and recovers the record in a fresh page.
- **Every suite cell is in every result.** Lanes the submitter switches off and lanes the device cannot run (no WebGPU, a GPU-compiled build without a GPU) are planned with a skip reason and recorded as `skipped` cells with that reason, instead of being dropped, so a run's suite label describes what was attempted and what was not (`@localmode/bench` 0.4.0 `PlannedCell.skipReason`).
- **WASM aborts are diagnosable.** Error cells keep the wrapped provider error's `causeName` and `causeStack` (capped) beside `cause`; wllama's `RuntimeError` "(ABORT) " names the failing llama.cpp frame only in that decoded stack.
- **Gemini Nano downloads on Run.** The Chrome Built-in AI lane used to be disabled whenever Chrome reported Gemini Nano as merely "downloadable", leaving the submitter to trigger the download by hand. Chrome starts that one-time, browser-wide download only from a user activation, so the Run click now starts it synchronously (`src/lib/bench/chrome-ai-download.ts`) while the other lanes run; the lane is enabled with a "downloads once when you click Run" note, its progress shows in the Progress card, the chrome-ai adapter waits for the download before its cells (recorded cold, load measuring the remaining wait), and a refused or failed download becomes an error cell, never a silent skip. Unit-tested against a fake Prompt API (`scripts/bench-chrome-ai-download.test.ts`); the real download path needs Chrome 148+ with Gemini Nano and stays on the manual real-Chrome sweep.

### Fixed

- **`pressure-change` events fired every second regardless of state**, 1,662 of them in one thorough run; they are now recorded on state transitions only, while the pressure gate still reads every sample.

## [2.9.1] - 2026-09-19

**Released:** `@localmode/bench` 0.3.1.

### Fixed

- **`gpuModel` on WebKit read "apple".** WebKit fills the WebGPU adapter description with the bare vendor token and bench 0.3.0 preferred that over the WebGL renderer string, so the first iPhone submission under 0.3.0 (run c5b06059) recorded `gpuModel: "apple"` where the WebGL channel says "Apple GPU". The description is now used only when it names something the vendor and architecture tokens do not (`resolveGpuModel()`), otherwise the WebGL renderer string is parsed as before. Additive; no schema or protocol change.

## [2.9.0] - 2026-09-19

Makes every benchmark submission record the full device identity the browser discloses (so later analyses never depend on a field that was not kept), stamps runtime versions into runs, and fixes the WebKit isolation and mobile-suite problems surfaced by the first iPhone submissions.

**Released:** `@localmode/bench` 0.3.0 (folds in the unpublished 0.2.1 UA-parse fix).

### Added

- **Every benchmark submission now records everything the browser discloses about the device** (`@localmode/bench` 0.3.0, additive schema fields, no protocol bump; archived runs stay valid). Beyond the device class, a run now carries the raw user-agent string, browser engine/vendor/`webdriver`, OS version, architecture, bitness and model where disclosed, a derived form factor (phone/tablet/desktop; iPads that report as Macs are unmasked by touch points), touch/pointer/display-mode signals, the JS heap ceiling, WebGPU adapter features, limits, subgroup sizes and WGSL language features, a full WebGL identity block and a GPU model parsed out of the renderer string ("Apple M4", "NVIDIA GeForce RTX 4070"), the WebAssembly proposal matrix (22 features probed with the wasm-feature-detect 1.9.0 detection modules, inlined), presence checks for every API the runtimes depend on (WebGPU, WebNN, OPFS, Cache API, workers, Compute Pressure, Chrome Built-in AI verdicts, ...), storage usage details, battery, Network Information, display (color depth, orientation, HDR, wide gamut, color scheme), locale and time zone, page origin and visibility. Verified in real Chrome 145, WebKit 26.5 and Firefox 151 with zero console errors.
- **Runtime versions are stamped into every run.** `next.config.mjs` resolves the installed versions of the provider packages and the inference runtimes they wrap at build time (and wllama's CDN pin, which is what actually executes), and the runner records them as `harness.runtimeVersions`, each cell as `runtimeVersion`; the build commit is recorded when the host exposes it (`VERCEL_GIT_COMMIT_SHA`). Runner harness version 0.3.0.
- **`/bench` shows a "Recent submissions" table** with the disclosed device identity per run (form factor, GPU model, browser + engine, OS + architecture, cores, memory, storage quota, isolation, WebGPU) linking to the run's JSON in the dataset; the leaderboard index (`index/summary.json`) carries these fields plus the harness and runtime versions so future analyses do not need to re-read every run file.

### Fixed

- **`hardware.coresClamped` was always true on Chrome.** The label compared the UA-CH brand ("Google Chrome", "Microsoft Edge") against "Chrome"/"Edge" and so marked every Chromium submission's core count as clamped; it now follows the rendering engine (Chromium reports real cores; Gecko and WebKit clamp or randomize).
- **WebKit browsers were never cross-origin isolated.** Safari, and every browser on iOS, does not implement `Cross-Origin-Embedder-Policy: credentialless`, so the site's pages ran without SharedArrayBuffer there: single-threaded WASM, a 1 ms timer, and wllama unable to create its shared WASM memory. WebKit user agents now receive `require-corp` (Chromium keeps `credentialless`); verified on WebKit 26.5 that the page is isolated, the timer drops to 20 µs, the Transformers.js and MediaPipe WASM lanes run multithreaded, and no cross-origin asset is blocked.
- **wllama lane on WebKit: honest unavailability instead of five error cells.** wllama's model cache needs the Origin Private File System; WebKit contexts that cannot open it throw `DOMException UnknownError` before any WASM runs (the iPhone runs recorded this as "Out of memory" on every wllama cell). The bench adapter now probes both the shared 4 GB WASM memory wllama imports and OPFS, and marks the lane unavailable with the reason; the runner shows it before Run.
- **Phones and tablets are gated to the Quick suite.** Standard and Thorough stack several runtimes' WASM heaps in one page and mobile browsers kill the tab first, which lost whole runs on an iPhone; the suite picker now disables them on mobile with an explanation.
- **`@localmode/bench` 0.2.1:** UA-parse fallback names Chrome/Firefox for iOS and reports the iOS version (submissions had arrived as browser `unknown`).

## [2.8.0] - 2026-09-19

Adds the paid-study session flow to the bench runner for the crowdsourced data collection and fixes a leaderboard caching lag surfaced by the first live protocol-v2 submission. No npm package releases; `apps/ui` only.

### Added

- **`/bench/run` paid-study session support.** When the page is opened with `?PROLIFIC_PID=<id>&cc=<code>`, the run records `prolific:<first 12 hex of SHA-256(id)>` in `environment.userReportedDevice` (the raw id is never stored or published) and, once the run finishes and the automatic upload attempt has resolved, shows the completion code with a link to Prolific's completion page; if the upload failed, it still shows the code with a note to message the researcher (payment is on attempt). A pre-run note tells the participant the code will appear on this page. Covered by the bench e2e real-run lane, which also asserts the raw id never reaches the exported payload.

### Fixed

- **`/api/bench/leaderboard` could serve a pre-submission copy for up to an hour.** The response allowed `stale-while-revalidate=3600`; the edge kept returning the old aggregate 27 minutes after the first v2 run was published while the ISR page had already refreshed. The stale window is now one revalidation period (300 s), matching the page.

## [2.7.0] - 2026-09-19

Bumps the LocalMode Bench protocol to `localmode-bench/2` after three real-Chrome thorough-suite pilots surfaced measurement defects in the harness and two provider bugs underneath it. The third pilot ran all 51 cells green.

**Released:** `@localmode/bench` 0.2.0 · `@localmode/wllama` 3.2.0 · `@localmode/transformers` 4.1.2.

### Fixed

- **`@localmode/transformers` 4.1.2 - `preloadModel()` leaked a resident ONNX session.** It built a full pipeline only to populate the model-file cache and never disposed it; ONNX Runtime's WASM heap never shrinks, so after a few large models every later session creation failed with `std::bad_alloc` - in the bench this killed all 18 Transformers.js cells of a thorough run regardless of execution order. The throwaway session is now disposed, and a new `device` option replaces the hard-coded WebGPU (defaulting to WebGPU only when `navigator.gpu` is present, else WASM).
- **`@localmode/wllama` 3.2.0 - a bare `prompt` is now a user turn, like every other provider.** Previously a `prompt` with no `messages`/`systemPrompt` bypassed the GGUF chat template (raw completion) and returned the whole generation as one chunk; instruct models fed untemplated text often emit EOS immediately (SmolLM2-135M produced 0 characters). Bare prompts now go through `createChatCompletion` with real token streaming when the GGUF ships a template; `providerOptions.wllama.raw` keeps raw completion, and base GGUFs without a template use it automatically. `cache_prompt` and `chat_template_kwargs` pass through.
- **`@localmode/bench` 0.2.0 - protocol `localmode-bench/2`.** Stream-coherence gating (TTFT/decode only from genuinely incremental traces; LiteRT-LM's terminal-burst surface produced an artifact 693,902 chars/s decode rate under v1 and now reports an honest end-to-end rate marked `e2e`); quality lane rebuilt (48-token budget, `<think>` stripping, uniform per-pairing no-think suffixes, stored raw outputs, server-side recomputation, and a surfaced parse rate so a format-limited score is never read as low fidelity); a degenerate-generation gate; the wllama lane pins `cache_prompt: false` so repeated prompts pay prefill every iteration (llama.cpp's prompt-KV reuse had dropped TTFT from 1018 ms to 24 ms from the second iteration on); error causes preserved on cells; and a deterministic runtime execution order for reproducibility. The leaderboard and run pages surface `e2e` rates and `(N% parsed)` annotations; the analysis CSV tooling gains `overallCharsPerSec`/`streamIncremental`/`qualityParseRate` columns. The leaderboard aggregates only runs measured under the current protocol, so archived v1 runs stay published as v1 (never re-scored) but leave the leaderboard until v2 submissions arrive. Known limitation, documented rather than fixed: the Transformers.js lanes share one ONNX Runtime WASM heap per page that never shrinks, so under system memory pressure a large-model session can fail with `std::bad_alloc` and later ORT sessions in that page fail too; such cells are recorded as errors (with cause and a failure-time memory sample), never as data, and the execution order does not change this.

## [2.6.0] - 2026-09-18

Introduces **LocalMode Bench** - an open, cross-runtime benchmark of in-browser AI with a public leaderboard at [localmode.ai/bench](https://localmode.ai/bench) - and fixes a wllama preload crash on encoder-only GGUF models.

**Released:** `@localmode/bench` 0.1.0 · `@localmode/wllama` 3.1.2.

### Added

- **`@localmode/bench` 0.1.0 - the LocalMode Bench measurement harness.** Versioned protocol `localmode-bench/1` with MLPerf-Client-compatible metrics (TTFT; pp128/pp512 prefill; tg128 decode excluding the first token), a suite runner that records raw per-chunk timing traces and full environment captures, integrity validation (canonical-JSON SHA-256 digests, timer-grid conformance, plausibility envelopes, software/virtual-renderer rejection), a quality-fidelity lane (tinyMMLU accuracy, STS-B Spearman), and leaderboard aggregation + CSV tooling that recomputes every published statistic from the raw traces. Zero runtime dependencies; runtimes are injected via adapters.
- **localmode.ai/bench - the public benchmark surface.** The leaderboard (ISR over the open CC0 [LocalMode-Bench](https://github.com/LocalMode-AI/LocalMode-Bench) dataset), the in-browser runner at `/bench/run` (suite/lane picker with availability preflight, live progress, JSON export, one-click submission; models download only behind the explicit Run action), the versioned protocol page at `/bench/methodology`, and the submission APIs (HMAC session nonce, server-side trace recompute, public quarantine for flagged runs). Model pairings run the same weights family across WebLLM, wllama, Transformers.js (WebGPU and WASM lanes), LiteRT, and Chrome Built-in AI - headlined by Qwen3-0.6B across five lanes.
- **localmode.dev/docs/bench** - a docs pointer page linking the leaderboard, runner, methodology, dataset, and harness package.

### Fixed

- **`@localmode/wllama` `preloadModel()` crashed the WASM runtime on encoder-only GGUFs** (embedding and reranker models). The previous implementation preloaded through a full `loadModelFromUrl()`, whose causal-LLM init warmup aborts in `llama_context::output_reserve` on encoder-only architectures - and loaded full model weights into memory just to populate the cache. Preloading now routes through wllama's `ModelManager` download-only path (regression tests in `packages/wllama/tests/preload.test.ts`).

## [2.5.0] - 2026-07-11

Makes on-device structured output actually reliable — small models now emit schema-conforming JSON through grammar-constrained decoding and stronger prompts — and refines the `@localmode/ui` platform at localmode.ai: Device Badge folds into the local-first family, "Open in v0" is supported, the component browser is deep-linkable, and the image blocks are WASM-pinned for stability.

**Released:** `@localmode/core` 2.4.2 · `@localmode/react` 2.4.0 · `@localmode/webllm` 2.2.0.

### Fixed

- **Structured output was broken under Zod 4 and unreliable on small models.** `@localmode/core`'s duck-typed Zod→JSON-Schema reader only understood Zod 3 internals, so every Zod 4 scalar collapsed to `{ type: 'object' }`; it now normalizes both layouts (and adds `bigint`). `buildStructuredPrompt()` now emits a concrete filled example and an explicit top-level-key list, so a model returns data instead of echoing the schema.
- **Image blocks wedged on WebGPU.** The background-remover (SegFormer) and image-enhancer (Swin2SR) pin `device: 'wasm'` — the ONNX-Runtime WebGPU session lifecycle wedged on cancel-mid-load and on switching super-resolution modes, while these tiny models run in ~1s on WASM. The object-detector pauses its live face-tracking loop during one-shot DETR so the two don't starve the GPU.
- **Accessibility & hydration** — `before-after-image-viewer` is now a keyboard-navigable ARIA tablist, and `event-log-viewer` moved its `Date.now()` clock into an effect to fix a server/client hydration mismatch.

### Added

- **Schema-constrained JSON generation.** `@localmode/webllm` forwards `providerOptions.webllm.response_format` to MLC for XGrammar-constrained decoding, and `useGenerateObject` (`@localmode/react`) gains a `providerOptions` passthrough — together forcing schema-conforming JSON from small models (wired into the Data Extractor block).
- **"Open in v0" support** — a new `add-default-export` registry-build step appends `export default <Component>` to shipped component payloads (v0 default-imports the primary component), shown only for an empirical hand-verified allowlist of primitives that render real UI in v0.
- **Deep-linkable component browser** — `/docs/components` accepts `?filter=<family>` and reflects the active family into the URL; the docs homepage gained a "100+ components" preview and a "36 interactive blocks" section linking the real `/blocks/<category>/<block>` routes.

### Changed

- **Device Badge moved into the local-first family** — `ui/device-badge` → `ui/local-first/device-badge` (source, install command, and docs route `/docs/local-first/device-badge`, with a 308 from the old path). The registry's lone top-level "seed" is gone; every component is now family-scoped.
- A mounting preview (e.g. a cmdk list) can no longer scroll the component-browser page, and several blocks now render their full surface before the model loads (controls stay disabled until ready).

### Removed

- `ui/local-first/vector-import-flow` no longer depends on `format-detection-badge` — it inlines a minimal fallback and installs independently.

## [2.4.0] - 2026-07-09

Repairs Chrome Built-in AI, which had been unreachable on every modern Chrome, and adds the user-activation download gate Chrome requires before it will fetch an on-device model.

**Released:** `@localmode/core` 2.4.0 · `@localmode/chrome-ai` 2.2.0 · `@localmode/react` 2.3.0.

### Fixed

- **Chrome Built-in AI was unreachable on every modern Chrome.** `@localmode/chrome-ai`'s Summarizer and Translator, and `@localmode/core`'s four `is*APISupported()` capability detectors, all read the legacy `self.ai.*` namespace that Chrome has removed. `isChromeAISupported()` was literally `'ai' in self`, so it returned `false` on exactly the browsers where the APIs exist — and `detectCapabilities().features.chromeAI` was always `false`. All now read the modern top-level `self.Summarizer` / `self.Translator` / `self.LanguageModel` globals, with the legacy namespace as a fallback.
- **Chrome's `SummarizerType` enum is `'tldr'`, not `'tl;dr'`.** Passing `'tl;dr'` made Chrome throw a `TypeError`, which the provider-fallback probe then swallowed and reported as "this browser does not support it" — blaming the browser for a caller bug. The enum value is corrected across `@localmode/chrome-ai` and `@localmode/react`, and the probe now rethrows bad-option errors instead of mislabelling the browser.
- The Prompt API requires **Chrome 148+** for web pages (Chrome 138 shipped it for extensions only). Summarizer and Translator remain Chrome 138+. Documentation and runtime error hints corrected throughout.

### Added

- `useProviderFallback` (`@localmode/react`) exposes `chromeAvailability`, `refreshChromeAvailability`, `requestChromeDownload`, `chromeDownloadProgress`, and `downloadingCapability`, plus standalone `probeChromeAvailability` / `downloadChromeModel`. Chrome only starts its one-time, browser-wide model download from a **user activation**, so the download must be triggered from a click.
- Chrome AI Summarizer and Translator gained `allowDownload` + `onProgress` settings and an `availability()` gate, matching the language model; they now throw typed `SummarizationError` / `TranslationError`.
- New UI registry primitive `ui/local-first/chrome-ai-download-gate` (`ChromeAIDownloadGate` + `ChromeAIReadyBadge`) rendering the download button, progress, and terminal states. Wired into the `writing-tools/{write,translate,summarize}` blocks. The catalog is now 107 components across 10 families (147 registry items).

## [2.3.0] - 2026-07-09

Launches the `@localmode/ui` registry platform at localmode.ai — a copy-owned catalog of 106 AI UI components across 10 families, plus 37 composed blocks across 12 gallery categories that wire those primitives to real on-device models. The `apps/showcase-nextjs` demo app is retired (absorbed into the blocks at parity) and the built-in DevTools widget is removed. Alongside the platform: a `@localmode/core` RAG ingest ⇄ search round-trip fix, agent tool approval, a StorageAdapter conformance suite, cross-session persistence fixes across all three storage adapters, a resilient model-file cache, and provider load fixes for WASM VLMs, long-context wllama, and LiteRT.

**Released:** `@localmode/core` 2.3.0 · `@localmode/react` 2.2.0 · `@localmode/transformers` 4.1.0 · `@localmode/wllama` 3.1.0 · `@localmode/langchain` 2.1.0 · `@localmode/devtools` 3.0.0 (breaking) · `@localmode/litert`, `@localmode/dexie`, `@localmode/idb`, `@localmode/localforage` 2.0.1.

### Added — @localmode/core

- **`ingest()` object call form + `abortSignal`** — `ingest({ db, documents, model?, embedder?, ...options })` joins the positional `ingest(db, documents, options?)` as a TypeScript overload; passing an `EmbeddingModel` as `model` generates chunk embeddings via `embedMany()`. `IngestOptions` gains `abortSignal`, and both forms throw actionable errors on a missing `db` or non-array `documents`. New type: `IngestObjectOptions`.
- **`TEXT_METADATA_FIELD`** — the metadata key (`'_text'`) under which ingestion stores chunk text, now a shared constant consumed by both the write side and `semanticSearch()`'s read side so the two cannot drift.
- **`defineTool()`** — identity helper anchoring `ToolDefinition<TParams, TResult>` generics so `parameters` and `execute(params)` type-check against each other, letting typed tools fit `ToolDefinition[]` without casts.
- **Agent tool approval** — opt-in human-in-the-loop gate for the ReAct loop: flag a tool `requiresApproval` and supply `onToolApproval` (on `AgentConfig`, per-run override on `AgentRunOptions`). Denials skip execution and feed the reason back as the step observation; decisions are recorded on `AgentStep.approval`, and a flagged tool with no callback fails fast. New types: `ToolApprovalRequest`, `ToolApprovalDecision`.
- **`createKnowledgeBaseEngine()`** — a `kind: 'core'` engine implementing the new frozen `KnowledgeBaseEngine` contract: chunk (off/recursive/semantic) → embed → typed-metadata VectorDB, vector `search`, and grounded streaming `ask` with reasoning stripped and PDF page attribution. Models are injected, so core gains a RAG engine with no new dependency.
- **`streamEmbedManyImages()`** — streaming batch image embedding mirroring `streamEmbedMany()`: per-image yields, `onBatch` progress, `batchSize`/`adaptiveBatching`, per-batch AbortSignal checks and retry.
- **`createStorageAdapterConformanceSuite()`** — a framework-agnostic, dependency-free StorageAdapter contract suite (21 cases: full-`Collection` fidelity, document/vector/index ops, close→reopen persistence, SQ8 cross-session fidelity). The factory supplies a `reopen()` handle, so the suite catches adapters that look fine in-session and corrupt on reopen. Adopted by all three external adapters.
- **`createMockRerankerModel()`** — deterministic mock `RerankerModel` (configurable `scores`/`scoreFn`, honors `topK`, abortable `delayMs`, recorded `calls`).
- **`KMeansOptions.random`** — injectable random source for deterministic `kMeansCluster()` runs (default `Math.random`, behavior unchanged).

### Added — @localmode/react

- **8 new hooks (56 → 64)**: `useModelLoad` (provider load lifecycle with normalized 0–1 progress and a warmup-driven status registry), `useRerank`, `useEncryptedVault` (passphrase-locked AES-GCM CRUD over a core `StorageAdapter`, key in memory only), `useProviderFallback` (per-capability Chrome Built-in AI ⇄ Transformers.js resolution), `usePhotoLibrary`, `useKnowledgeBase`, `useObjectUrl`, and `useStreamingTracker` (experimental). All resolve providers by injection or dynamic `import()`, so `packages/react` gained no provider dependency.
- **`useAgent` tool-approval surface** — returns `pendingApproval` plus `approve()`/`deny(reason?)` while the ReAct loop is paused on a gated tool. Ungated runs never surface one.
- **`useChat` additions** — per-turn `usage` + cumulative `totalUsage`, lifecycle `status`, `streamingMessageId`, `setMessages()`, and `regenerate()` with selectable reply variants.
- **`useEmbedManyImages` progress parity** — now streams via `streamEmbedManyImages()`, exposing `progress: { completed, total }` and a `batchSize` option.
- **Additive options and richer returns across existing hooks** — `useSemanticSearch`, `useGenerateText`, `useSynthesizeSpeech`, `useTranscribe`, `useClassifyZeroShot`, `useLiveTranscribe`, `useTurnTaker`, `useStreamSpeech`, `usePipeline`, `useReindex`, `useAuditLog`, `useSemanticCache`, `useVoiceRecorder`, `useCapabilities`, `useStorageQuota`; `useSequentialBatch`/`useBatchOperation` publish results incrementally with per-item errors. Re-exports `getTextContent`/`normalizeContent` from core.

### Added — @localmode/transformers

- **Resilient model-file cache (default on)** — a custom Transformers.js cache over the browser Cache API storage the provider already uses (`transformers-cache`) whose write path can never fail a model load: a failed write serves the fetched response and warns once per URL, and no-`caches` environments keep stock behavior. Kills the intermittent `NetworkError: Cache.add() encountered a network error` failure class. Opt out with `createTransformers({ resilientCache: false })`.

### Added — @localmode/wllama

- **GGUF model discovery** — `searchGGUFModels()` and `listGGUFFiles()` browse the 160,000+ GGUF repos on the anonymous HuggingFace API and list a repo's `.gguf` files with parsed quant labels. Failures surface as a typed `HFApiError` (`rate-limit` / `network` / `not-found`).

### Added — @localmode/langchain

- **`createLangChainKnowledgeBaseEngine()`** — a `kind: 'langchain'` engine implementing the same core `KnowledgeBaseEngine` contract via the real `LocalModeEmbeddings`/`LocalModeVectorStore`/`ChatLocalMode` adapters, result-equivalent to core's engine. Models are injected, so consumers who never toggle LangChain never pull it.

### Added — @localmode/devtools

- **`/react` hooks subpath** — 9 hooks over the bridge snapshots (`useDevToolsBridge`, `useDevToolsStatus`, `useDevToolsQueueStats`, `useDevToolsEvents`, `useDevToolsModelCache`, `useDevToolsPipelineRuns`, `useDevToolsVectorDBs`, `useDevToolsStorage`, `useDevToolsCapabilities`), built on `useSyncExternalStore` with SSR-safe inert values, preserved snapshots after `disableDevTools()`, and late-enable attachment. The main entry stays React-free.

### Added — @localmode/ui

- **`@localmode/ui` registry platform (localmode.ai)** — a single Next.js 16 / React 19 app that is BOTH a shadcn registry endpoint AND a Fumadocs docs site, distributing copy-owned, composable AI UI primitives ("LocalMode Elements"). Not an npm package: components install with the shadcn CLI (`npx shadcn add @localmode/ui/<item>`) and the consumer owns the copied `.tsx`. shadcn/ui CSS-variable theming (Tailwind 4), generated `ui/all` + per-family aggregates, an MCP-readable `/registry.json` catalog, optional token-gating, and a Run-gated `<ComponentPreview>` that downloads no model until clicked.
- **146 registry items** — 106 copy-owned components across 10 families (Conversation 24, Local-First 24, Results & Insights 12, Input Controls 11, Audio 10, Media & Vision 7, Data & Documents 5, Security & Privacy 5, Artifacts & Canvas 4, DevTools 4), 3 internal `ui/lib/*` items (`utils`, `browser-utils`, `use-environment`), and 37 blocks. Primitives are presentational and hook-driven, and install with **zero `@localmode/*` packages**: generic browser helpers come from the copy-owned `ui/lib/browser-utils` item and the navigator-reading hooks from `ui/lib/use-environment`. A consumer-test lane guards the invariant; blocks are the sole carve-out, guarded by an inverse lane.
- **37 composed blocks across 12 route-served gallery categories** — live, full experiences that wire the primitives to real on-device models, served at the public `/blocks` gallery and installable as `registry:block` items. Categories: `chat`, `knowledge` (4), `audio` (6), `vision` (2), `text` (1), `device` (3), `writing-tools` (4), `text-insights` (4), `photo` (4), `image-studio` (3), `privacy` (2), `agents` (2), plus the `devtools-drawer` layout chrome. Blocks are the wiring layer and the ONLY registry items allowed `@localmode/*` dependencies; each gallery block ships as a single self-contained, copy-paste-ready file, and every model load is gated behind an explicit in-block action.
- **Accessibility floor across every block and primitive** — correct roles, accessible names, keyboard operability, WCAG-AA contrast, visible `focus-visible` rings, an ARIA tablist for the Preview/Code tabs, `role="status"` live regions, and `role="alertdialog"` destructive confirms. Block sources are testid-free (E2E selects via role/label/text), and a shared `stripSnippet()` AST transform guarantees every shipped block file has zero `data-testid`, zero QA comments, and a ≤3-line header.
- **Registry dependencies ship as absolute URLs, so "Open in v0" resolves them.** Items are authored with namespaced `registryDependencies` (`@localmode/ui/lib/utils`), which resolve only through a consumer's `components.json` registries map — the shadcn CLI has that map, v0 does not. The final `registry:build` step rewrites every namespaced dependency in the emitted `public/r/**.json` into an absolute `<origin>/r/ui/<item>.json` URL (618 across 153 items); bare shadcn names pass through and the step is idempotent. The origin comes from `NEXT_PUBLIC_REGISTRY_ORIGIN ?? NEXT_PUBLIC_SITE_URL`, so **a deploy must set one at build time**.

### Added — apps/ui

- **Block-page chrome** — a persistent category sidebar (with a mobile disclosure), a breadcrumb, and per-page "Copy page" / "View as Markdown" actions.
- **Markdown export** — docs pages expand previews, type tables, and install tabs into markdown; block pages expose an `/api/blocks-md/<slug>` route with the full block source.
- **PWA (installable + offline)** — a manifest, a Serwist service worker built postbuild (app-shell precache, model/CDN hosts NetworkOnly, `/offline` fallback), an `SWRegistrar`, and generated icons.
- **Cross-origin isolation** — COOP `same-origin` + COEP `credentialless`, unlocking threaded WASM while keeping cross-origin model downloads working.
- **Other chrome** — a `/capabilities` browser-support page, a live NetworkStatus pill on `/blocks`, a console suppressor for known WASM-runtime noise, custom `not-found`/`error` pages, and a new favicon.
- **New env vars** — `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_REGISTRY_ORIGIN`, and optional verification / IndexNow / social vars (inert until set).

### Added — docs

- **New guides** — a Next.js integration guide; "Model Caching & Reliability" (transformers) and "Model Caching & Offline" (LiteRT) sections; `use-with-ai-sdk.mdx` and `bring-your-own-data.mdx`; and launch content for `@localmode/ui`.

### Added — repo tooling

- **ESLint works again** — the repo had no ESLint config and the root `pnpm lint` used the removed `--ext` flag. A flat `eslint.config.mjs` now lints `packages/**` (apps keep their own Next.js configs) with `eslint-plugin-react-hooks` registered. New `pnpm lint:fix`.
- **`pnpm test:types`** — compiles the type-level contracts in `packages/core/tests/**/*.test-d.ts` (Vitest does not run them), guarding `jsonSchema<T>` inference and `ToolDefinition[]` assignability.

### Changed — @localmode/react

- `useModelStatus` de-stubbed — backed by the `useModelLoad` registry and reflecting the real load lifecycle, instead of optimistically reporting `isReady: true` as soon as an instance existed.
- Published load progress is non-decreasing within a load attempt (high-water clamp, reset per `load()`); raw per-file byte counts are unaffected.
- `toAppError()` carries a core `LocalModeError`'s `code` to `AppError.code` and appends its `hint` to the message.
- `useReindex`, `useCalibrateThreshold`, and `useModelRecommendations` expose `error` as `Error | null` (was `{ message: string } | null`).

### Changed — docs

- **Ingest/search examples normalized to the real API** across the core RAG and embeddings guides, getting-started, the adapter quick starts, and blog posts: object-form `ingest()` examples are now valid against the shipped overload, option names are corrected, and `semanticSearch` results read text from `results[].text`.
- **Blocks-world sweep** — the 436 legacy `localmode.ai/<slug>` deep links across 99 content files were rewritten to their absorbing `localmode.ai/blocks/<name>` URLs, and repo guidance updated to describe the blocks world.

### Fixed — @localmode/core

- **`ingest()` → `semanticSearch()` text round-trip** — text extraction never checked the `_text` metadata key `ingest()` writes, so every ingested chunk came back with `text: undefined` and RAG flows building context from `results[].text` injected empty strings (a HIGH-severity real-consumer bug; search itself was never broken). Precedence is now `text`, `content`, `body`, `_text`, `__text`, `pageContent`; `streamSemanticSearch()` inherits the fix.
- **`jsonSchema()` type inference** — `jsonSchema<T>(schema)` now actually infers `T` from the Zod schema instead of collapsing to `unknown`, and `ToolDefinition.execute` uses method syntax so typed tools are assignable to `ToolDefinition[]`.
- **Semantic cache never cached on the streaming path** — `semanticCacheMiddleware()` stored the response only after its `for await` loop, which never completes for consumers that stop at the `done` chunk (every `streamText()`/`useChat` turn), so streaming lookups always missed. The store now fires on `done`; a turn cancelled mid-stream still stores nothing.
- **Agent runs no longer fail on reasoning models** (`Failed to generate valid object after 3 attempts`) — `generateObject()` appends the Qwen3 `/no_think` switch to the user prompt as well as the system prompt, ReAct action generations get an explicit 2048-token budget, and the action parser unwraps a schema-parroted single-element `oneOf`/`anyOf` wrapper.
- `ModelLoadError`'s default message generalized to `Failed to load model: {modelId}` — the class is shared by every model domain, not just embeddings.
- `StorageAdapter.getVector()`/`getAllVectors()` types now match the implementations (`Float32Array | Uint8Array`, the latter for SQ8/PQ payloads).

### Fixed — @localmode/react

- Mid-flight cancellation is now silent for every `useOperation`-based hook, even when the wrapped core function turns an abort into a plain `Error` (e.g. `rerank()`/`classify()` "was cancelled").
- `cancel()` returns a hook to idle immediately — previously the loading state reset only when the promise settled, so a cancelled but non-interruptible in-worker call left the hook stuck loading.
- `useVoiceRecorder` ignored microphone selection — new `deviceId`/`constraints` options are forwarded to `getUserMedia`, and recording now errors when the requested device is unavailable instead of silently falling back.

### Fixed — @localmode/transformers

- **Cross-encoder reranking produced no ranking signal** — `doRerank` scored query and document independently, so the document never influenced the score and single-logit models collapsed to a constant `0`. It now encodes real (query, document) pairs via `AutoTokenizer` `text_pair` + `AutoModelForSequenceClassification`, with sigmoid on single-logit heads.
- **Vision-language models failed to load on WASM** (`ERROR_CODE: 9`) — the hardcoded q4/fp16 multimodal dtype default uses ops onnxruntime-web only implements on WebGPU. The default is now device-aware: WebGPU keeps the q4/fp16 mix, WASM uses fp32 embed/vision with a q4 decoder. An explicit `settings.dtype` still overrides.
- **English-only Whisper checkpoints (`*.en`) failed every transcription** — the force-injected `language: 'en'` / `task: 'transcribe'` defaults now apply only to multilingual checkpoints.

### Fixed — @localmode/wllama

- **Long-context models no longer abort the wasm32 load** — the context length inferred from the catalog or GGUF metadata is capped at 8192 before `n_ctx`; models advertising native windows like 131072 requested a multi-GiB KV cache that cannot fit the wasm32 4GiB heap. An explicit `settings.contextLength` is never capped.
- **Reranking works** — the pinned `@wllama/wllama@3.2.3` ships no rerank API, so every `WllamaRerankerModel` call failed with `createRerank is not a function` after the download. Bumped to `^3.5.1`, and the reranker loads in reranking mode.

### Fixed — @localmode/litert

- `doGenerate()` no longer freezes the tab for the whole generation — it drains `sendMessageStreaming()` (per-token main-thread yields) instead of the synchronous `sendMessage()`.
- CPU-capable models no longer fail to load in WebGPU-less browsers — the provider probes actual device usability and pins the CPU backend when `navigator.gpu` exposes no usable device.

### Fixed — @localmode/dexie, @localmode/idb, @localmode/localforage

- **Full `Collection` persistence — quantization calibration, compression calibration, and drift fingerprints now survive a reopen.** All three adapters cherry-picked `{ id, name, dimensions, createdAt }` on collection write AND read, silently dropping the extended fields core stores, so quantized or compressed vectors round-tripped in-session but decoded as raw bytes after a close→reopen, and drift detection never fired. Collections now round-trip as the full object, and each adapter adopted the conformance suite. Data written with quantization/compression by earlier adapter versions is unrecoverable — clear and re-ingest.
- **SQ8/PQ-compressed vectors now round-trip correctly.** The adapters coerced core's `Uint8Array` payloads to f32 (dexie/idb threw a `RangeError`; localforage returned a `Float32Array` of byte-values). Dexie/idb now persist the typed array itself, localforage adds a `dtype` discriminator, and legacy records keep reading as `Float32Array` (no migration).

### Removed

- **`apps/showcase-nextjs`** — the 34-app Next.js demo showcase, retired and removed from the pnpm workspace. Its user-facing capabilities were absorbed at parity into the `/blocks` gallery, `localmode.ai` now serves the registry + gallery in its place, and all 34 legacy `localmode.ai/<slug>` URLs permanently redirect to their successor blocks. The source remains in git history and can be restored from the last commit that contained it (`git checkout <sha> -- apps/showcase-nextjs`).
- **`@localmode/devtools/widget`** — the built-in DevTools widget UI. The data layer (collectors + bridge) and the `/react` hooks are unchanged; the successor UI is the `ui/devtools` registry family plus the composed `ui/blocks/devtools-drawer`.

### Breaking Changes

- **`@localmode/devtools` 3.0.0** — `import { DevToolsWidget } from '@localmode/devtools/widget'` no longer resolves. The data layer and `/react` hooks are unchanged; migrate to the `ui/devtools` primitives or `ui/blocks/devtools-drawer`.

### Backward Compatibility

- Runtime behavior is unchanged, but two `@localmode/core` **type** signatures moved (hence the 2.3.0 minor, not a major): `StorageAdapter.getVector()`/`getAllVectors()` now return `Float32Array | Uint8Array` (callers assigning straight to `Float32Array` must narrow), and `jsonSchema<T, S>` lost its second type parameter (it never inferred).
- Agent tool approval, the `useAgent` approval surface, `useEncryptedVault`, and the storage-adapter compressed-vector fixes are additive with no migration. `@localmode/ui` is a first release, so it has no prior install commands or routes to preserve — only the retired showcase app's URLs, which redirect.

## [@localmode/wllama@3.0.0] - 2026-05-28

### Added

- **Upgraded to wllama v3** (`@wllama/wllama@^3.2.3`) — migrated from v2's custom API to v3's OAI-compatible API (`createChatCompletion`, `createCompletion`, `createEmbedding`). The public `@localmode/wllama` API remains backward-compatible for existing consumers.
- **Embedding models** — New `WllamaEmbeddingModel` class implementing `EmbeddingModel`. Factory method `wllama.embedding(modelId)`. 3 curated GGUF embedding models: nomic-embed-text-v1.5 (768d, 78MB), mxbai-embed-large-v1 (1024d, 197MB), bge-small-en-v1.5 (384d, 35MB). Dimensions auto-detected from GGUF metadata. New exports: `WllamaEmbeddingModel`, `WllamaEmbeddingSettings`.
- **WebGPU acceleration** — `useWebGPU: boolean | 'auto'` and `nGpuLayers: number` settings. GPU offload with automatic WASM fallback. `gpuAccelerated` property on model instances.
- **Tool calling** — `providerOptions.wllama.tools` and `tool_choice` forwarded to v3's OAI-compatible chat completion. Results include `toolCalls` array. 8 models verified: Qwen 2.5 (0.5B, 1.5B, Coder 1.5B, 3B, Coder 7B), Llama 3.2 (1B, 3B), Phi-4 Mini.
- **Vision / multimodal** — `mmprojUrl` setting loads vision projection GGUF. `supportsVision` auto-detected. Base64 images converted to ArrayBuffer. Holo2 4B/8B catalog entries now include `mmprojUrl`.
- **Jinja chat templates** — Enabled by default. v3's template engine handles chat formatting. Graceful fallback on template errors. Opt-out with `useJinja: false`.
- **Model catalog** expanded from 18 to 30 models (25 language + 3 embedding + 2 reranker). New `WllamaModelEntry` fields: `supportsToolCalling`, `isEmbeddingModel`, `isRerankerModel`, `dimensions`, `mmprojUrl`, `nGpuLayers`.
- **Gemma 4 GGUF models** — `Gemma-4-E2B-IT-Q4_K_M` (3.46GB, 131K context, 5.1B params / 2.3B effective PLE) and `Gemma-4-E4B-IT-Q4_K_M` (5.41GB, 131K context, 8B params / ~4B effective PLE). Vision + tool calling. Uses bartowski for main GGUF, ggml-org Q8_0 for mmproj vision projector files.
- **New catalog models** — Qwen3 (0.6B, 1.7B, 4B), DeepSeek R1 Distill (1.5B, 7B), 2 reranker models (jina-reranker-v2-base-multilingual, bge-reranker-v2-m3).
- **True streaming** — `doStream()` now uses `stream: true` in `createChatCompletion()` for real token-by-token streaming instead of buffered output.
- **Structured output / JSON mode** — `response_format: { type: 'json_object' }` support via `responseFormat` option. Grammar-based JSON constraint via `providerOptions.wllama.grammar` (GBNF).
- **Reranking** — New `WllamaRerankerModel` class implementing `RerankerModel`. Factory method `wllama.reranker(modelId)`. 2 curated reranker models in catalog.
- **Reasoning mode** — `reasoning: boolean`, `reasoningFormat`, and `reasoningBudgetTokens` settings for models with thinking/chain-of-thought capability (e.g., Qwen3, DeepSeek R1).
- **Performance config** — `cacheTypeK`, `cacheTypeV` (KV cache quantization), `flashAttention`, and speculative decoding settings for advanced performance tuning.
- **Grammar sampling** — GBNF grammar support via `providerOptions.wllama.grammar` for constrained output generation.
- **Model management** — `listCachedModels()`, `clearAllModelCache()`, `refreshModel()` for managing downloaded GGUF models in browser storage.
- **LoRA adapters** — Support for loading LoRA adapter files alongside base models.
- **Extended sampling params** — `min_p`, `seed`, and additional sampling parameters via provider options.
- **Audio input (experimental)** — `AudioPart` content support for models with audio capabilities.
- **Showcase app updates** — llm-chat: "Tools" and "Vision" capability badges, embedding models filtered from chat list, WebGPU passthrough, `providerOptions` threading through `useChat` hook. gguf-explorer: "Capabilities" inspect section with badges, new embedding model cards, JSON mode toggle.

### Changed

- Single WASM binary (v3.2.3) replaces dual single-thread/multi-thread binaries. CDN URL: `@wllama/wllama@3.2.3/src/wasm/wllama.wasm`.
- Streaming uses v3's `createChatCompletion({ stream: true })` AsyncIterable instead of the v2 `onNewToken` callback-to-queue bridge.
- Token usage from OAI response `usage` field instead of `tokenize()`.
- Stop sequences as strings via `stop` field instead of token ID lookup.

### Removed

- `outputTokenIds` runtime extension (v3 OAI API does not expose per-token IDs).
- v2 internal APIs: `tokenize()`, `samplingInit()`, `lookupToken()`.

## [@localmode/transformers@4.0.0] - 2026-05-24

### Added

- **Gemma 4 ONNX models** — Added Gemma 4 E2B and E4B to the LLM catalog (16 total, up from 14). New `isGemma4Model()` detection routes Gemma 4 through the VLM loading path with `Gemma4ForConditionalGeneration`.
- **Gemma 4 vision support** — Gemma 4 models are vision-capable, bringing the total to 5 vision-capable ONNX models (up from 3).
- **New blog post** — Comparison article: Gemma 4 LiteRT vs ONNX.
- **`vad()` factory method** — `transformers.vad(modelId)` creates a `VADProvider` for use with `createLiveTranscriber()`. Backed by the Silero ONNX model.
- **Generative OCR** — `transformers.ocr()` now auto-detects and routes GLM-OCR and LightOnOCR-2 models to a vision-language OCR path using `AutoModelForImageTextToText`. Two new catalog entries: `GLM_OCR` and `LIGHTONOCR_2_1B`.
- **Kokoro TTS integration** — When a Kokoro model ID is requested via `transformers.textToSpeech()`, synthesis now routes to a dedicated phonemizer-backed path using `StyleTextToSpeech2Model` from transformers v4 + the `phonemizer` npm package (eSpeak-NG WASM). Dramatically better pronunciation compared to the generic pipeline.
- **29 named English voices** — American English (21) and British English (8). Exposed via `TextToSpeechModel.voices` field and `DoSynthesizeOptions.voice` parameter.
- **Voice catalog export** — `KOKORO_VOICES` constant with metadata (id, name, language, languageLabel, gender), `KOKORO_DEFAULT_VOICE`, `KOKORO_LANG_MAP`, and `KokoroVoice` type — all exported from `@localmode/transformers`.
- **Speed control** — `speed` parameter (0.5–2.0) now forwarded to Kokoro synthesis.
- **Provider options** — `providerOptions.kokoro.dtype` for quantization control (q8/fp16/fp32/q4/q4f16, default q8).
- **New dependency** — `phonemizer` (^1.2.0) added (eSpeak-NG WASM for text→phoneme conversion). Note: `kokoro-js` was NOT used due to v3/v4 version conflict — Kokoro synthesis reimplemented directly using transformers v4.
- **New showcase app** — `voice-studio` — browse all 29 English voices, streaming synthesis with speed control, side-by-side voice comparison.

### Breaking Changes

- **Unified Transformers.js dependency** — Migrated from `@huggingface/transformers@^3.8.1` to `@huggingface/transformers@^4.2.0`. The npm alias `@huggingface/transformers-v4` has been removed entirely. All 26 implementation files now import from a single `@huggingface/transformers` package.

### Changed

- **Audiobook Creator upgraded** — Switched from MMS-TTS (`Xenova/mms-tts-eng`, 30MB) to Kokoro TTS (86MB). Added voice selector dropdown (29 English voices), speed slider (0.5–2.0x), streaming playback via `useStreamSpeech`.
- Kokoro model registry entry updated: 29 English voices, phonemizer-backed, speed control.
- All pipeline-based implementations now pass explicit `dtype: 'fp32'` instead of `undefined` when quantization is disabled, eliminating "dtype not specified" log noise.
- Removed `embedding-v4.ts` experimental benchmark file (no longer needed with unified v4).
- Cleaned up `utils.ts` conditional v3/v4 import branching.
- Removed "experimental" / "preview" labels from language model types, provider, and model catalog.

### Backward Compatibility

- Non-Kokoro TTS models (SpeechT5, MMS-TTS) continue using the generic pipeline unchanged.
- All existing `synthesizeSpeech()` and `streamSynthesizeSpeech()` calls work as before.
- The public API is unchanged for the v3→v4 migration. If you imported `TransformersV4EmbeddingModel` or `createV4EmbeddingModel`, use `TransformersEmbeddingModel` / `createEmbeddingModel` instead. Re-test model outputs — embedding cosine similarity is ≥0.9999 and classification labels/scores are identical in validation testing.

### Fixed

- **ImageTextToText tokenizer crash** — `loadImageTextToText` (GLM-OCR, LightOnOCR-2) now loads an `AutoTokenizer` alongside the processor, fixing a `TypeError` when calling `generateText()` or `streamText()` with a text-only prompt (no images).
- **Kokoro TTS unrecoverable load failure** — If the Kokoro model fails to download (transient network error), the module-level promise is now cleared so subsequent calls can retry instead of permanently returning the cached rejection.

## [@localmode/core@2.2.0] - 2026-05-24

### Added

- **Audit Log** (`core/src/security/`) — Append-only, hash-chained, cryptographically signed, and optionally encrypted audit log for local-first compliance use cases. New exports: `createAuditLog`, `verifyChain`, `exportAuditLog`, `deriveAuditKey`, `generateEphemeralAuditKey`, and `AuditLogError`. Supports key derivation (PBKDF2) via `deriveAuditKey` and ephemeral session keys via `generateEphemeralAuditKey`. Chain integrity verified with `verifyChain`; full log export via `exportAuditLog`. All operations are offline and use the Web Crypto API — no external dependencies. React hook `useAuditLog` added to `@localmode/react`.
- **Live Transcription** (`core/src/audio/`) — Streaming speech-to-text with voice-activity detection (VAD) and a turn-taking orchestrator for real-time conversational AI. New factory exports: `createLiveTranscriber`, `createTurnTaker`. Built-in VAD providers: `EnergyVADProvider` (threshold-based, zero-latency) and `SileroVADProvider` (neural VAD via Silero ONNX model). AudioWorklet helpers: `registerEnergyVADWorklet`, `createScriptProcessorVADNode` (fallback for browsers without AudioWorklet). Capability detection: `isLiveTranscribeSupported`, `isAudioWorkletSupported`, `isMediaCaptureSupported`. Error: `MediaNotSupportedError` (thrown when `getUserMedia` or AudioContext is unavailable). React hooks `useLiveTranscribe` and `useTurnTaker` added to `@localmode/react`.
- **Silero VAD implementation** in `@localmode/transformers` (`silero-vad.ts`) — `TransformersSileroVAD`, `createSileroVAD` factory, and `SileroVADSettings` type. Provides a neural VAD provider backed by the Silero ONNX model via `@huggingface/transformers` for high-accuracy speech boundary detection.
- **Streaming Speech** (`core/src/audio/`) — `streamSynthesizeSpeech`, `playStreamedSpeech`, and `splitIntoClauses` (with `DEFAULT_ABBREVIATIONS`) for clause-by-clause streaming TTS playback. React hook `useStreamSpeech` in `@localmode/react`.
- **Generative OCR `prompt` parameter** — `ExtractTextOptions` and `DoOCROptions` now accept an optional `prompt` for table/formula recognition with generative OCR models.
- **Capability detection** — New `isAudioWorkletSupported()`, `isMediaCaptureSupported()`, and `isLiveTranscribeSupported()` functions. New `LiveTranscribeCapability` type added to `CapabilityReport`.
- **`MediaNotSupportedError`** — New error class thrown when `getUserMedia` or AudioContext is unavailable.
- **`useExtractText` prompt support** — React hook now accepts a `prompt` option for generative OCR models.
- **`AudioPart` content type** — Added to `ContentPart` discriminated union in `packages/core/src/generation/types.ts` — `{ type: 'audio', data: string (base64), mimeType: string }`. Backward-compatible additive change; existing `TextPart | ImagePart` consumers continue to work unchanged via the `type` discriminator.

## [@localmode/mediapipe@2.0.0] - 2026-05-24

### Added

- **New provider package**: `@localmode/mediapipe` wrapping Google's MediaPipe Tasks — `@mediapipe/tasks-vision`, `@mediapipe/tasks-audio`, and `@mediapipe/tasks-text` — as a single unified provider. WASM + WebGL runtime, works in all target browsers (no WebGPU required).
- **New core interfaces** for landmark and gesture tasks: `HandLandmarkModel`, `PoseLandmarkModel`, `FaceDetectionModel`, `FaceLandmarkModel`, `GestureRecognitionModel` in `packages/core/src/vision/`, and `LanguageDetectionModel` in `packages/core/src/translation/` — all interface-only, zero new core dependencies.
- **New core functions**: `detectHands()`, `detectPose()`, `detectFace()`, `detectFaceLandmarks()`, `recognizeGesture()` (vision) and `detectLanguage()` (text).
- **New core constants**: `HAND_CONNECTIONS`, `POSE_CONNECTIONS`, `FACE_CONNECTIONS` (landmark topology for drawing overlays), `GESTURE_CATEGORIES` (8 standard gestures), `SUPPORTED_LANGUAGES` (ISO 639-1 code → name map).
- **MediaPipe model implementations** for new interfaces (hand/pose/face landmarks, face detection, gesture recognition) and existing core interfaces — `ImageClassificationModel`, `ObjectDetectionModel`, `SegmentationModel`, `ImageFeatureModel` (vision), `AudioClassificationModel` (YAMNet, 521 categories), `ClassificationModel` and `EmbeddingModel` (text), `LanguageDetectionModel` (110 languages).
- **Provider-specific streaming API** — `createHandTracker()`, `createPoseTracker()`, `createFaceTracker()`, `createGestureTracker()` run MediaPipe vision tasks in VIDEO mode over a `<video>` element at 30-60fps with a results callback and `start`/`stop`/`close` lifecycle.
- **Curated model catalog** (`MEDIAPIPE_MODELS`) — 13 verified entries from Google's CDN, ranging from 230KB (face detector) to 18.6MB (image classifier).
- **6 new React hooks** in `@localmode/react`: `useDetectHands`, `useDetectPose`, `useDetectFace`, `useDetectFaceLandmarks`, `useRecognizeGesture`, `useDetectLanguage`.
- **New showcase app** — `mediapipe-studio` — a 7-tab studio demonstrating webcam hand/pose/face/gesture tracking, audio classification, and language/text tasks.
- **Lazy task loading + concurrent-load deduplication** following the established provider pattern; each task domain (vision/audio/text) loads its WASM runtime independently from the jsDelivr CDN.

### Status

- `@mediapipe/tasks-*` is pinned to `^0.10.22`.
- **Audio embeddings are not available** — the `@mediapipe/tasks-audio` JS package ships only `AudioClassifier`, not an `AudioEmbedder` class. Audio coverage is limited to classification.
- `@mediapipe/tasks-genai` (LLM inference) is deliberately not wrapped — it duplicates `@localmode/litert`.
- MediaPipe text classification requires a custom-trained model (MediaPipe Model Maker) — `textClassifier()` requires an explicit model path.
- Audio and vision WASM runtimes can conflict if run concurrently in the same thread (MediaPipe GitHub #4737) — use Web Worker isolation for concurrent audio+vision usage.

## [@localmode/litert@2.0.0] - 2026-05-24

### Added

- **New provider package**: `@localmode/litert` wrapping Google's `@litert-lm/core@^0.12.1` — first-party JS/WASM browser bindings for the LiteRT-LM inference engine.
- **`LanguageModel` implementation** with `doGenerate()` and `doStream()`. Runs `.litertlm` models on a WebGPU backend; portable models also run on a CPU WASM backend. Text-in / text-out — the LiteRT-LM JS API does not currently expose vision or audio input.
- **Curated catalog of three models**, all verified end-to-end in real Chrome (Chrome 145, 2026-05-20):
  - `gemma-4-E2B` — Gemma 4 E2B (`gemma-4-E2B-it-web.litertlm`, 2.0 GB, 8K context) — **WebGPU only**
  - `gemma-4-E4B` — Gemma 4 E4B (`gemma-4-E4B-it-web.litertlm`, 3.0 GB, 8K context) — **WebGPU only**
  - `qwen3-0.6B` — Qwen3 0.6B (`Qwen3-0.6B.litertlm`, 614 MB, 4K context) — runs on WebGPU **or** CPU
  The Gemma 4 entries use the web-optimized `*-it-web.litertlm` builds — the files Google publishes as the models officially supported by the LiteRT-LM JS API. These builds are GPU-compiled (their TFLite sections carry a `gpu_artisan` backend constraint) and cannot run on the CPU backend.
- **`requiresWebGPU` catalog flag + WebGPU pre-check** — Gemma 4 entries are flagged `requiresWebGPU: true`. The provider checks WebGPU availability before downloading such a model and throws a clear `ModelLoadError` if WebGPU is unavailable or `backend: 'CPU'` is set, instead of failing deep inside the WASM loader.
- **Flexible model loading** — load any `.litertlm` file via a curated catalog key, a HuggingFace `repo:file` shorthand, or a full URL. Gated Google models (Gemma 3n, Gemma 3 1B, FunctionGemma) load via a resolved `modelUrl` after accepting the Gemma license on HuggingFace.
- **Automatic GPU→CPU fallback** — if `@litert-lm/core` cannot stream-load a portable `.litertlm` file on the GPU backend ("Streaming … is not supported yet"), the provider retries once on the CPU backend. (Skipped for WebGPU-only models, where a CPU retry cannot help.)
- **Cache management** — `isModelCached()`, `preloadModel()`, `deleteModelCache()`, `resolveModelUrl()`.
- **Browser compatibility checker** — `checkLiteRTBrowserCompat()` reports WebGPU support, device RAM, and the recommended backend.
- **Lazy Engine loading + load deduplication** following the `@localmode/wllama` pattern; `unload()` releases WASM memory via `engine.delete()`.
- **Showcase integration** — the `llm-chat` showcase app gains `litert` as a 4th backend alongside `webgpu`, `wasm`, and `onnx` (new "LiteRT" filter tab in the model sidebar).

### Status

- `@litert-lm/core` is at v0.12.1 (early JS release). API surface may change. Pinned to `^0.12.1`.
- Text-only — the LiteRT-LM JS API is text-in / text-out in this preview.
- Gemma 4 E2B/E4B are WebGPU-only (GPU-compiled `-web.litertlm` builds); only Qwen3 0.6B runs on the CPU backend.
- `stopSequences` is not supported (LiteRT-LM uses token IDs, not strings).
- Token usage counts are estimated from text length.

## [@localmode/chrome-ai@2.1.0] - 2026-05-24

### Added

- **`LanguageModel` implementation** — `ChromeAILanguageModel` with `doGenerate()` and `doStream()` via Chrome's Prompt API (`window.LanguageModel` / Gemini Nano). Supports `generateText()`, `streamText()`, and `generateObject()` from `@localmode/core`. Zero-download inference — model ships with Chrome.
- **`isPromptAPISupported()`** utility — checks Prompt API availability before model creation.
- **`warmUp()` / `isReady()` lifecycle** — pre-initialize the language model for faster first inference.
- **`destroy()` method** — release model resources explicitly.
- **New exported types**: `AILanguageModel`, `AILanguageModelAvailability`, `AILanguageModelCreateOptions`, `AILanguageModelFactory`, `AILanguageModelPromptOptions`, `ChromeAILanguageModelSettings`.

### Fixed

- **Dead-code `finishReason` ternary** — Removed the no-op `stopped ? 'stop' : 'stop'` in both `doGenerate` and `doStream`. Chrome's Prompt API does not expose token-limit truncation, so `finishReason` is always `'stop'`. The dead ternary previously made the code appear as if it intended to report `'length'` but never could.

## [@localmode/webllm@2.1.0] - 2026-05-24

### Added

- **Qwen 3.5 models** — Added `Qwen3.5-4B-q4f16_1-MLC` (2.39 GB, 32K context) and `Qwen3.5-9B-q4f16_1-MLC` (5.06 GB, 32K context), bringing catalog to 32 curated models.
- **IndexedDB cache backend** — New `useIndexedDBCache` and `cacheBackend` settings for storing large model downloads in IndexedDB instead of Cache API (useful for Chrome extensions with MV3 restrictions).
- **Custom app config** — New `appConfig` setting to pass a custom WebLLM `AppConfig` for advanced model configuration.
- **Engine reload fallback** — Automatically retries via `engine.reload()` when initial load progress doesn't reach completion.

### Fixed

- **Unrecoverable load failure** — If `CreateMLCEngine` rejects (transient WebGPU context loss, network error), the cached `loadPromise` is now cleared so subsequent calls can retry instead of permanently returning the stale rejected promise.
- **AudioPart treated as image** — `convertContentAsync` now explicitly checks `part.type === 'image'` before routing to the image preprocessor. `AudioPart` content (and other future content types) is silently skipped instead of being corrupted into a malformed `image_url`.

### Changed

- Bumped `@mlc-ai/web-llm` from `^0.2.82` to `^0.2.83`.

## [@localmode/wllama@2.1.0] - 2026-05-24

### Added

- **Holo2 vision-language models** — Added `Holo2-4B-Q4_K_M` (2.8 GB, 256K context) and `Holo2-8B-Q4_K_M` (5.1 GB, 256K context) from the Qwen3-VL family with `vision: true`, bringing catalog to 18 curated models.
- **`vision` field on `WllamaModelEntry`** — Marks models that support multimodal (image + text) input.
- **Chrome MV3 extension support** — WASM binary resolution via `chrome.runtime.getURL()` for bundled extensions instead of CDN-only loading.
- **Raw token ID output** — `outputTokenIds` exposed on generation results for cross-modal consumers (e.g., Orpheus TTS SNAC audio tokens).

## [@localmode/devtools@2.0.1] - 2026-05-24

### Fixed

- **Responsive panel width** — Panel width adapts to viewport (`min(600px, calc(100vw - 32px))`) instead of fixed 600px.
- **Scrollable tab bar** — Tabs now scroll horizontally on narrow viewports.
- **TypeScript fix** — Corrected `eventBuffer` type annotation in events collector.


## [Showcase & Docs] - 2026-05-24

### Added

- **PWA support** — Service Worker via Serwist for offline caching, web app manifest for installability, offline fallback page, and app icons (192x192, 512x512).
- **OCR Scanner upgrade** — Now supports 3 models (TrOCR Small, GLM-OCR, LightOnOCR-2) with a model selector and OCR mode picker (text, table, formula).
- **MediaPipe Studio** showcase app — 7-tab studio demonstrating webcam hand/pose/face/gesture tracking, audio classification, and language/text tasks. (Already mentioned in @localmode/mediapipe@2.0.0 entry.)
- **Voice Studio** showcase app — Browse all 29 English Kokoro voices, streaming synthesis with speed control, side-by-side voice comparison. (Already mentioned in Kokoro TTS entry.)
- **84 new blog posts** organized into 6 subcategories: comparisons (13), browser compatibility (10), model guides (19), task tutorials (18), use cases (14), plus additional root-level posts.
- **New documentation pages** — Core: audit-log, live-transcribe, streaming-speech. Chrome AI: language-model. LiteRT: 3 pages. MediaPipe: 8 pages.

### Changed

- **28 showcase apps** received minor fixes, dependency updates, and UI consistency improvements.

## [2.0.0] - 2026-03-25

Major release expanding LocalMode from an embeddings-and-search toolkit into a comprehensive local-first AI platform. Adds 6 new packages, 8 new core domains, 30 new showcase applications, and full documentation coverage.

### Added

#### New Packages

- **`@localmode/react`** — Complete React integration with 34+ hooks (`useEmbed`, `useGenerateText`, `useClassify`, `useChat`, `useAgent`, `usePipeline`, `useSemanticCache`, `useCalibrateThreshold`, and more), operation utilities (`useOperation`, `useOperationList`, `useSequentialBatch`, `useStreaming`), and helpers (`toAppError`, `readFileAsDataUrl`, `validateFile`, `downloadBlob`)
- **`@localmode/wllama`** — GGUF model provider via llama.cpp WASM with access to 160K+ HuggingFace models, GGUF metadata parser, and universal browser support (no WebGPU required)
- **`@localmode/chrome-ai`** — Chrome Built-in AI provider for zero-download inference via Gemini Nano, with summarization and translation implementations and automatic fallback
- **`@localmode/ai-sdk`** — Vercel AI SDK provider adapter with `LanguageModel` and `EmbeddingModel` adapters for seamless integration with the AI SDK ecosystem
- **`@localmode/devtools`** — In-app DevTools widget for real-time observability of models, inference queue, pipeline execution, events, VectorDB state, and device capabilities across 6 panels
- **`@localmode/langchain`** — LangChain.js adapters including `LocalModeEmbeddings`, `ChatLocalMode`, `LocalModeVectorStore`, and reranker integration

#### `@localmode/core` — New Domains

- **Agent Framework** (`core/src/agents/`) — Local-first ReAct agent loop with `createAgent()`, `runAgent()`, type-safe tool registry via `createToolRegistry()`, and VectorDB-backed conversation memory via `createAgentMemory()`. Supports configurable max steps, timeout, loop detection, and step-level observability callbacks
- **Evaluation SDK** (`core/src/evaluation/`) — Model evaluation orchestrator `evaluateModel()` with built-in metrics: `accuracy`, `precision`, `recall`, `f1Score`, `bleuScore`, `rougeScore`, `cosineDistance`, `mrr`, `ndcg`, and `confusionMatrix`. Supports batch evaluation with progress callbacks and AbortSignal
- **Import/Export Adapters** (`core/src/import-export/`) — Vector data migration with `importFrom()`, `exportToCSV()`, `exportToJSONL()`, and `convertFormat()`. Parses Pinecone, ChromaDB, CSV, and JSONL formats with auto-detection, text-only record re-embedding, and dimension validation
- **WebGPU Vector Distance** (`core/src/hnsw/gpu/`) — GPU-accelerated batch distance computation via WGSL compute shaders for cosine, euclidean, and dot product metrics. Automatic CPU fallback with threshold-based dispatch via `createGPUDistanceComputer()`
- **Pipeline Builder** (`core/src/pipeline/`) — Composable multi-step workflows via `createPipeline()` with chainable `.step()` builder and pre-built step factories: `embedStep`, `embedManyStep`, `chunkStep`, `semanticChunkStep`, `searchStep`, `rerankStep`, `storeStep`, `classifyStep`, `summarizeStep`, `generateStep`. Supports progress callbacks and AbortSignal
- **Inference Queue** (`core/src/queue/`) — Priority-based task scheduling via `createInferenceQueue()` with multi-priority levels (interactive, background, prefetch), concurrency limiting, per-task AbortSignal, and real-time stats events
- **Model Cache** (`core/src/model-cache/`) — Chunked model downloads via `createModelLoader()` with 16MB IndexedDB chunks, HTTP Range resume, LRU eviction, cross-tab Web Lock coordination, exponential backoff retry, and human-readable size config (`'2GB'`, `'512MB'`)
- **Model Registry & Recommendations** (`core/src/capabilities/`) — Curated model catalog with `registerModel()`, `getModelRegistry()`, and device-aware scoring/ranking via `recommendModels()`. Includes `computeOptimalBatchSize()` for adaptive batch sizing across 21 task categories

#### `@localmode/core` — New Features

- **Semantic Cache** (`core/src/cache/`) — VectorDB-backed response caching via `semanticCacheMiddleware` for `LanguageModel`. Near-duplicate query detection using embedding similarity
- **Language Model Middleware** (`core/src/generation/middleware.ts`) — `wrapLanguageModel()` and `composeLanguageModelMiddleware()` for transforming params, wrapping generate, and wrapping stream operations
- **Structured Output** (`core/src/generation/`) — `generateObject()` and `streamObject()` for JSON schema-validated structured generation with Zod integration
- **Multimodal Content** (`core/src/generation/content.ts`) — `normalizeContent()` and `getTextContent()` for `ContentPart[]` (text + image) handling in generation
- **Scalar Vector Quantization (SQ8)** (`core/src/quantization/scalar.ts`) — 4x storage compression with >95% recall via `calibrate()`, `scalarQuantize()`, and `scalarDequantize()`
- **Product Quantization (PQ)** (`core/src/quantization/pq.ts`) — 8-32x compression via k-means codebooks with `trainPQ()`, `pqQuantize()`, `pqDequantize()`, and `kMeansCluster()`
- **Storage Compression** (`core/src/storage/compression.ts`) — `compressVectors()`, `decompressVectors()`, and `getCompressionStats()` for SQ8/delta-SQ8 storage-level compression (4x disk reduction)
- **Differential Privacy** (`core/src/security/dp-*.ts`) — `dpEmbeddingMiddleware` and `dpClassificationMiddleware` with calibrated Gaussian/Laplacian noise, privacy budget tracking via `createPrivacyBudget()`, and sensitivity analysis
- **Multimodal Embeddings** (`core/src/multimodal/`) — `embedImage()` and `MultimodalEmbeddingModel` interface for cross-modal (image + text) embedding via CLIP
- **Embedding Drift Detection** (`core/src/embeddings/reindex.ts`) — `extractFingerprint()`, `fingerprintsMatch()`, `checkModelCompatibility()`, and `reindexCollection()` for model change detection and automatic re-embedding
- **Threshold Calibration** (`core/src/embeddings/calibrate-threshold.ts`) — `calibrateThreshold()` for empirical confidence thresholds from corpus sampling, plus `getDefaultThreshold()` with `MODEL_THRESHOLD_PRESETS` for curated per-model defaults
- **Adaptive Batching** (`core/src/capabilities/batch-size.ts`) — `computeOptimalBatchSize()` for device-aware batch sizing in `streamEmbedMany()` and `ingest()`
- **Semantic Chunking** (`core/src/rag/chunkers/semantic.ts`) — `semanticChunk()` for topic-boundary detection using embedding cosine similarity with auto-threshold computation
- **Typed VectorDB Metadata** — Generic type parameter on `createVectorDB<T>()` for compile-time metadata type safety with Zod schema validation
- **Audio Classification** (`core/src/audio/classify-audio.ts`) — `classifyAudio()` function for audio content classification
- **Depth Estimation** (`core/src/vision/estimate-depth.ts`) — `estimateDepth()` function for monocular depth estimation

#### `@localmode/transformers` — New Implementations

- **Language Model** (`transformers/src/implementations/language-model.ts`) — 14 curated ONNX text generation models via Transformers.js v4, including 3 vision-capable models (Qwen2.5). Uses npm alias `@huggingface/transformers-v4` for v3/v4 coexistence
- **CLIP Embedding** (`transformers/src/implementations/clip-embedding.ts`) — Multimodal embedding implementation for cross-modal image+text search
- **Audio Classifier** (`transformers/src/implementations/audio-classifier.ts`) — Audio classification via Transformers.js
- **Depth Estimator** (`transformers/src/implementations/depth-estimator.ts`) — Monocular depth estimation via Transformers.js

#### `@localmode/webllm` — Enhancements

- Added `models.ts` with curated model list of 23 models including Phi 3.5 vision
- Enhanced provider, model, and type definitions for improved model management

#### Storage Adapters — Enhancements

- **`@localmode/dexie`** — Updated storage implementation with new types and full test coverage
- **`@localmode/idb`** — Updated storage implementation with new types and test suite
- **`@localmode/localforage`** — Updated storage implementation with new types and test suite

#### Showcase Applications (apps/showcase-nextjs)

30 new self-contained demo applications, each with `_components/`, `_hooks/`, `_lib/`, `_services/`, and `page.tsx`:

- **audiobook-creator** — Text-to-speech audiobook generation with chapter management
- **background-remover** — Image segmentation for background removal/replacement
- **cross-modal-search** — CLIP-based image+text search across photo collections
- **data-extractor** — Structured data extraction from documents
- **data-migrator** — Vector data import/export across formats (Pinecone, ChromaDB, CSV, JSONL)
- **document-redactor** — Automatic PII redaction in documents
- **duplicate-finder** — Semantic duplicate detection in datasets
- **email-classifier** — Email categorization (spam, urgent, etc.)
- **encrypted-vault** — Web Crypto encrypted local storage
- **gguf-explorer** — GGUF model browser and chat interface
- **image-captioner** — AI image captioning
- **invoice-qa** — Document question-answering on invoices
- **langchain-rag** — RAG pipeline using LangChain.js adapters
- **meeting-assistant** — Speech-to-text transcription with summarization
- **model-advisor** — Device-aware model recommendation engine
- **model-evaluator** — Threshold calibration and model performance evaluation
- **object-detector** — Real-time object detection visualization
- **ocr-scanner** — Optical character recognition from images
- **photo-enhancer** — Image-to-image upscaling and enhancement
- **product-search** — Semantic product catalog search
- **qa-bot** — Question-answering chatbot on custom documents
- **research-agent** — Multi-step research agent using ReAct loop
- **semantic-search** — Vector search with import/export support
- **sentiment-analyzer** — Text sentiment classification
- **smart-autocomplete** — Fill-mask token prediction
- **smart-gallery** — AI-powered image gallery with semantic tagging
- **smart-writer** — Text generation, translation, and summarization
- **text-summarizer** — Document summarization
- **translator** — Multi-language text translation
- **voice-notes** — Speech-to-text note-taking

#### Documentation (apps/docs)

- **45 new blog posts** covering topics from browser AI architecture to migration guides, GDPR compliance, and practical recipes
- **30+ new Core API pages** — agents, audio, classification, differential privacy, document loaders, document QA, embedding drift, evaluation, fill-mask, import/export, inference queue, model cache, OCR, pipelines, question answering, structured output, summarization, threshold calibration, translation, typed metadata, vision, WebGPU vector search
- **New provider documentation** — ai-sdk, chrome-ai (with fallbacks, summarization, translation), devtools (with panels), dexie, idb, langchain (chat, embeddings, migration, vector store), localforage, wllama (with GGUF models)
- **New React documentation** — advanced patterns, agents, audio, chat, classification, embeddings, generation, import/export, pipelines, utilities, vision

### Changed

- **llm-chat showcase** — Refactored with agent mode, image upload, vision support, and enhanced model selector
- **pdf-search showcase** — Refactored with GPU-accelerated search and improved document handling
- **Showcase home page** — Updated navbar, device stats component, app constants, and type definitions
- **Showcase layout** — Added DevTools widget integration and ONNX Runtime warning suppression
- **Showcase dependencies** — Updated `package.json` and `next.config.ts` for new providers and WASM support
- **Core docs pages** — Updated capabilities, embeddings, events, generation, language model middleware, middleware, multimodal embeddings, RAG, reranking, security, semantic cache, storage, sync, vector DB, and vector quantization pages
- **Transformers docs** — Updated embeddings, index, and reranking pages
- **Docs configuration** — Updated `source.config.ts`, layout shared config, source routing, and home page
- **`@localmode/pdfjs`** — Enhanced PDF text extraction

### Fixed

- Layout and overflow handling for code examples in docs app homepage

---

## [1.0.2] - 2025-12-31

### Changed

- Bumped all published packages to v1.0.2 (`@localmode/core`, `@localmode/transformers`, `@localmode/webllm`, `@localmode/pdfjs`, `@localmode/chrome-ai`)
- Updated README files to include version badges and documentation links for all packages

---

## [1.0.1] - 2025-12-31

### Changed

- Updated package metadata and README files across all packages

---

## [1.0.0] - 2025-12-30

Initial public release of LocalMode — a local-first, privacy-first, offline-first AI toolkit for the browser.

### Added

#### Packages

- **`@localmode/core`** (v1.0.0) — Zero-dependency core package with:
  - **Embeddings** — `embed()`, `embedMany()`, `semanticSearch()`, `EmbeddingModel` interface, embedding model middleware with `wrapEmbeddingModel()`
  - **Classification** — `classify()`, `classifyMany()`, `extractEntities()`, `rerank()` with `ClassificationModel`, `ZeroShotClassificationModel`, `NERModel`, `RerankerModel` interfaces
  - **Generation** — `generateText()`, `streamText()` with `LanguageModel` interface
  - **Translation** — `translate()` with `TranslationModel` interface
  - **Summarization** — `summarize()` with `SummarizationModel` interface
  - **Fill-Mask** — `fillMask()` with `FillMaskModel` interface
  - **Question Answering** — `answerQuestion()` with `QuestionAnsweringModel` interface
  - **OCR** — `recognizeText()` with `OCRModel` interface
  - **Document QA** — `answerDocumentQuestion()` with `DocumentQAModel` and `TableQAModel` interfaces
  - **Audio** — `transcribe()`, `synthesizeSpeech()` with `SpeechToTextModel` and `TextToSpeechModel` interfaces
  - **Vision** — `classifyImage()`, `captionImage()`, `detectObjects()`, `segmentImage()`, `extractFeatures()`, `imageToImage()` with full vision interface set
  - **VectorDB** — HNSW index with cosine, euclidean, and dot product distance metrics, IndexedDB and Memory storage backends
  - **RAG** — `ingest()`, `chunk()` with recursive, markdown, and code chunkers, BM25 scoring, hybrid search
  - **Storage** — `IndexedDBStorage`, `MemoryStorage`, WAL (Write-Ahead Log), migrations, quota management, cleanup utilities
  - **Security** — `encrypt()`, `decrypt()`, `deriveKey()` via Web Crypto API, `redactPII()`, `piiRedactionMiddleware`, `encryptionMiddleware`
  - **Middleware** — `cachingMiddleware`, `loggingMiddleware`, `retryMiddleware`, `validationMiddleware`, VectorDB middleware with before/after hooks
  - **Capabilities** — `detectCapabilities()`, `isWebGPUSupported()`, `isIndexedDBSupported()`, `isCrossOriginIsolated()` feature detection
  - **Events** — `globalEventBus` for cross-component communication
  - **Sync** — `createBroadcaster()`, `createLockManager()` for cross-tab coordination
  - **Providers** — `setGlobalProvider()` for global provider configuration
  - **Testing** — `createMockEmbeddingModel()`, `createMockClassificationModel()`, `createMockStorage()`, `createMockVectorDB()`, `createSeededRandom()`, `createTestVector()` mock utilities
  - **Errors** — Structured error hierarchy (`LocalModeError`, `EmbeddingError`, `StorageError`, `ValidationError`, etc.) with actionable hints

- **`@localmode/transformers`** (v1.0.0) — HuggingFace Transformers.js provider with 21 implementations:
  - embedding, classifier, zero-shot, NER, reranker, translator, summarizer, fill-mask, question-answering, speech-to-text, text-to-speech, image-classifier, captioner, object-detector, segmenter, OCR, document-qa, image-feature, image-to-image, zero-shot-image
  - Model preloading, caching, and progress callbacks

- **`@localmode/webllm`** (v1.0.0) — WebLLM provider for local LLM inference with streaming text generation

- **`@localmode/pdfjs`** (v1.0.0) — PDF text extraction via PDF.js for document loading

- **`@localmode/dexie`** (v1.0.0) — Dexie.js storage adapter (~15KB) implementing the `Storage` interface

- **`@localmode/idb`** (v1.0.0) — idb storage adapter (~3KB) implementing the `Storage` interface

- **`@localmode/localforage`** (v1.0.0) — localForage storage adapter (~10KB) with automatic fallback

#### Applications

- **showcase-nextjs** (v1.0.0) — Next.js 16 showcase application with:
  - **llm-chat** — Local LLM chat interface with model selection and streaming
  - **pdf-search** — PDF document semantic search with RAG pipeline
  - Device capability detection and display
  - Responsive design with Tailwind CSS 4 + daisyUI 5

- **docs** — Documentation site at localmode.dev with getting-started guide and core API reference

