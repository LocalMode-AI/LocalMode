# @localmode/bench

## 0.8.0

Protocol `localmode-bench/5`.

- **The llama.cpp lanes change their thread count and context size** (the host adapters carry the settings; the package carries the version and the leaderboard rule). Threads: half the browser's logical thread count, at least two, instead of all of it. Under v4 a pool over every logical thread ran at half speed with high variance on hybrid and SMT processors (natively on an M1 Pro, tg128 178 ± 42 tokens/s at 10 threads against 395 ± 16 at 8; in the browser the M4 Max's 16-thread pool decoded a third as fast as the M1 Pro's 10). Context: 2,048 tokens for the language lanes (the workloads need about 700), which keeps the Gemma 4 E2B KV cache inside the CPU lane's 4 GB wasm heap where the 8,192 default failed the quality cell on every v4 run. Both the requested thread count and the pool the runtime built (`multithread`, `n_threads_used`) and `n_ctx` are recorded per cell. Every other lane measures exactly as under v4.
- feat: `LEADERBOARD_PROTOCOL_VERSIONS` (`['localmode-bench/5', 'localmode-bench/4']`): the protocol versions the public leaderboard shows, newest first. `aggregateRuns` groups by protocol as well as subclass and each `LeaderboardRow` carries `protocol`; `rowsToCSV` and `runsToLongCSV` gain the column. Rows never mix versions; v4 stays beside v5 because only the llama.cpp lanes changed. Archived runs are never re-scored.

## 0.7.1

- feat: `refineDeviceClass(deviceClass, gpuModel)` and `deviceSubclassOf(run)`. The coarse device class (platform + WebGPU vendor-architecture) put every Apple Silicon generation in one `macos/apple-metal-3` row; the subclass splits a class by the GPU model where the browser names a specific part (`macos/apple-m1-pro`, `macos/apple-m4-max`, `android/adreno-650`) and equals the class where it names nothing more specific (WebKit's `Apple GPU`, Windows' generation-less `AMD Radeon(TM) Graphics`, Firefox's masked `..., or similar` buckets) or where there is no WebGPU. `aggregateRuns` groups by subclass and each row carries both; `rowsToCSV` and `runsToLongCSV` gain a `deviceSubclass` column. `deviceClassOf` is unchanged, so archived classes and cross-device rollups keep their meaning.
- fix: iOS runs from Safari 27 no longer report `os.version: "18.7"`. WebKit froze the iOS token in the UA at `18_7` (the way macOS froze at `10_15_7`), so a phone on iOS 27 reads "CPU iPhone OS 18_7" in Safari and in the WebKit-shell browsers without a `Version/` token (Firefox for iOS), while Chrome for iOS still writes the real version. The capture now marks that pairing `unknown-frozen`, as it already does for macOS, Android and desktop Chromium; a Safari that really runs iOS 18 carries a `Version/18.x` token and keeps its version. `browser.version` (Safari 27.0) remains the honest signal for the OS generation. Archived iOS runs are not rewritten: read a Safari or Firefox iOS run whose `os.version` is `18.7` and whose Safari version is 26 or higher as frozen.

## 0.7.0

Result schema 3 (protocol unchanged at `localmode-bench/4`: nothing measured changes).

- **The environment capture no longer reads what could identify a device** Dropped: `locale.timeZone`, `timeZoneOffsetMinutes`, `calendar` (a city-sized location; only the BCP 47 `locale` tag stays), `languages`, `power.chargingTimeSec` / `dischargingTimeSec`, `display.prefersReducedMotion` / `prefersColorScheme`; `power.level` is rounded to the quarter (`coarseBatteryLevel()`, exported). The device model, GPU, browser, screen size, storage quota, network type, and runtime configuration stay: they are the dataset.
- feat: `scrubRunForPublication(run)`, the one rule for what a public file may carry. Strips the submission nonce and, for a run captured under an earlier schema, removes the fields above; `changed` tells the caller to recompute the digest and stamp `scrubbedAt` (new optional field on `BenchRunResult`). The localmode.ai server applies it on every submission; the dataset repository's tool applies it to files published earlier.
- **The run digest no longer covers the nonce** (`computeRunDigest` omits `digest` and `nonce`), so a published file, which never contains the nonce, verifies as submitted. `verifyRunDigest` falls back to the pre-schema-3 rule (`computeLegacyRunDigest`, exported) for files that still carry a nonce.
- `validateRunShape` accepts schema versions 2 and 3 (`ACCEPTED_SCHEMA_VERSIONS`), so a page built before the change still submits; its payload is scrubbed to schema 3 on the server.

## 0.6.1

- fix: only the submitter's abort signal is a cancel. The runner treated every `AbortError` as the cancel, so an AbortError a runtime raised on its own (a fetch the browser dropped, an internal timeout) ended the whole run as cancelled and discarded every finished cell; an Android phone lost every attempt this way. Such an error is now a cell error like any other, recorded with its message, retried once, and the run continues.
- fix: a cancel unwinds at once. The watchdog raced each unit of work only against its own timeout, so a cancel during work that ignores its abort signal (a model download in flight, a generation inside a runtime with no stop) waited for that work to finish; a "Cancel run" click during a 30 s download looked like a button that does nothing. The parent abort now rejects the watchdog immediately, the late outcome of the abandoned work is discarded quietly (no unhandled rejection), and a model that finishes loading after its cell was cancelled or timed out is released instead of leaking a runtime.

## 0.6.0

Protocol bump to `localmode-bench/4`.

- **llama.cpp lanes load language models as text only.** The host adapters now pass the wllama provider's new `vision: false`, so a GGUF that ships a vision projector in the provider catalog (Gemma 4 E2B) loads without it. Under v3 the projector rode along on both llama.cpp lanes: the text-only workloads never used it, its 557 MB download and CLIP warmup ran inside the untimed warmup, the provider disabled wllama's model cache for the multi-file source (so the warmup and the warm reload re-downloaded the 3.46 GB weights), and on the CPU lane the pair did not fit the 4 GB wasm32 heap (`clip_model_loader::warmup` aborted with "insufficient memory", three error cells on every Thorough run). Only the wllama Gemma 4 E2B cells measured differently under v3; the version is bumped anyway so no leaderboard row mixes the two configurations. wllama lanes record `mmproj: false` in `runtimeConfig`.
- fix: warm-reload cells read `resolvedBackend` and `runtimeConfig` before the reloaded instance is disposed (they were read after it, so an adapter that reports lazily off a provider which forgets its load report on unload would have recorded stale values). Note that wllama warm-reload cells legitimately carry `offloadedLayers: "unreported"` and the lane's requested backend: the warm reload measures the provider's preload path, an OPFS cache probe, and llama.cpp itself loads in the untimed warmup of the timed cells.
- fix: a group that ran nothing pays no cooldown. Every model group, including the ones whose cells were all skipped (a lane the submitter switched off, a runtime the browser lacks), was followed by the policy cooldown and the pressure gate; a Thorough run with most lanes switched off spent minutes cooling down after nothing.
- Schema version stays 2 and plausibility rules stay 2.

## 0.5.0

Protocol bump to `localmode-bench/3`.

- **The wllama lane ran on WebGPU while labelled WASM.** wllama 3.5 offloads every layer to WebGPU by default (`n_gpu_layers` 99999) wherever the browser exposes `navigator.gpu`, and the host adapter never pinned it; llama.cpp's own load log on the pilot machine reads "offloaded 31/31 layers to GPU" while every v2 run file records `resolvedBackend: "wasm"` for the lane. On an Apple M4 the mislabelled "WASM" SmolLM2 decode was 612 chars/s where the CPU path measures 279 (TTFT 71 ms vs 668 ms). v3 defines `wllama` as llama.cpp on the CPU (`n_gpu_layers: 0`) and adds the `wllama-webgpu` runtime lane (every layer offloaded) over the same GGUF files; `BenchRuntimeId` gains `'wllama-webgpu'`, `RUNTIME_EXECUTION_ORDER` runs it just before `wllama`, `USAGE_FIDELITY` covers it. Archived v2 runs stay published as v2; read their wllama cells as WebGPU wherever `environment.gpu.available` is true.
- feat: `runtimeConfig` on cells. Adapters may return `runtimeConfig` (a flat record: thread count, GPU layers requested, llama.cpp's offload report, dtype, device, ...) from `load()`, and the runner copies it onto every cell of the group and onto warm-reload cells: the per-cell equal-care record the methodology asks for. The localmode.ai adapters read the wllama backend from llama.cpp's offload report, never from the lane's request.
- `RUNTIME_EXECUTION_ORDER` now runs `transformers-wasm` before `transformers-webgpu`. Transformers.js 4.2 serializes every ONNX session creation on one promise chain (`webInitChain = webInitChain.then(load)`) and never catches a rejection on it, so the first session that fails to create fails every later Transformers.js session in the page with the same error; an iPhone on iOS 18.7 (run d0568952) lost all six Transformers.js cells to one WebGPU `webgpuInit is not a function`, and the earlier "ORT heap exhaustion cascade" on the 16 GB Mac has the same shape. The WASM lane now measures before any WebGPU failure can poison the chain; the upstream bug is reported separately.
- feat: the runner never hangs. Every load, warmup, timed iteration, embedding call, and quality lane runs under a watchdog (`RunPolicy.loadStallMs`/`loadTimeoutMs`/`chunkStallMs`/`iterationTimeoutMs`/`qualityTimeoutMs`): a stream that delivers nothing for 2 minutes, a load that reports no progress for 3, or a call that outlives its absolute budget is aborted with a `TimeoutError` (recorded as a `cell-timeout` trace event), the cell is retried up to `RunPolicy.maxAttempts` (2), and then recorded as an error while the run moves on. Failed attempts stay on the cell in `attempts` (`cell-retry` trace event); nothing is retried silently. The stall check compares progress timestamps when a timer fires, so a main thread blocked by WASM compute is judged on the progress it reports once it yields.
- feat: `RunnerHooks.onActivity` reports every observable step (phase starts, load progress, each streamed chunk with running character and chunk counts, each quality item) and `RunnerHooks.onCellRetry` every retry, so a host can show at a glance whether a run is alive.
- feat: hidden-tab recovery. A timed iteration the tab was hidden during used to invalidate the whole cell and the run moved on. Browsers deprioritize background tabs (throttled timers, lower process priority, throttled GPU work, suspended tabs on iOS), so such an iteration measures browser scheduling, not the runtime; it is now kept on the cell in `discardedIterations` with its gates, the runner waits for the tab to be visible again (`RunPolicy.visibilityWaitMs`, 10 minutes; a `waiting-visible` activity tells the host), and repeats the iteration, up to `maxAttempts` times per iteration (`iteration-redo` trace event). Before any timed iteration starts on a hidden tab the runner waits the same way. A tab that stays hidden leaves the cell `invalid` with the reason, as before. `RunSuiteOptions.trace` lets tests inject a trace recorder with driven visibility.
- Schema version stays 2 (additive fields) and plausibility rules stay 2 (no rule changed).

## 0.4.0

- feat: `PlannedCell.skipReason`. A planned cell carrying a reason is recorded as `skipped` with that reason and never touches the adapter, so a host can keep every cell a suite defines in the result (lanes the submitter switched off, or builds the device cannot run) instead of dropping them; the model still loads once for the group's remaining cells. Run 97863956 (a "thorough" run holding only the three Gemini Nano cells) is the case this closes.
- feat: `RunnerHooks.onEnvironment(environment)` fires after the environment capture and before the fingerprint and the first cell, so a host can persist progress from the start of the run (the localmode.ai runner writes the environment and every finished cell to IndexedDB, and a tab that dies mid-suite leaves an exportable partial record).
- feat: error cells keep the wrapped provider error's `causeName` and `causeStack` (capped at 4,000 characters) beside `cause`. A WASM runtime abort (wllama's `RuntimeError` "(ABORT) ") names its failing native frame only in the decoded stack; run 7eb25b61 (Dell XPS, Linux, Chrome 144) recorded the empty message and nothing else.
- fix: `pressure-change` trace events are recorded only when the Compute Pressure state actually changes. The observer samples every second, so a 10-minute thorough run (51876c89) carried 1,662 events, 1,090 of them repeating "nominal"; the pressure gate still reads every sample.

## 0.3.1

- fix: `gpuModel` no longer degrades to a bare vendor token. WebKit fills the WebGPU adapter `description` with just "apple", which 0.3.0 preferred over the WebGL renderer string (the first iPhone run under 0.3.0, c5b06059, recorded `gpuModel: "apple"` instead of "Apple GPU"). `resolveGpuModel()` (exported) now uses the description only when it differs from the adapter's vendor and architecture tokens, and otherwise parses the WebGL renderer string.

## 0.3.0

- feat: extended environment capture. Every run now records everything the browser discloses about the device, whether or not the leaderboard uses it yet (additive optional fields on `EnvironmentCapture`; schema version and protocol unchanged, archived runs stay valid): the raw user-agent string, rendering engine, `navigator.vendor`/`webdriver`/`platform`, UA-CH `wow64` + form factors, a derived form factor (`device.type` phone/tablet/desktop/xr/tv via `deriveDeviceType()`, with touch points unmasking iPads that report as Macs), touch/pointer/hover/display-mode signals, the JS heap ceiling and idle usage, WebGPU subgroup sizes, preferred canvas format and WGSL language features plus seven more adapter limits, a full WebGL block (vendor, renderer, GL/GLSL versions, capacity limits, extension count, software-renderer flag) and `gpuModel` parsed from the renderer string (`parseGpuModel()`: `Apple M4`, `NVIDIA GeForce RTX 4070`, `Mali-G78 MP20`, ...), the WebAssembly proposal matrix (`detectWasmFeatures()`, the wasm-feature-detect 1.9.0 detection modules inlined, plus the largest 32-bit memory the engine reserves), API availability presence checks (WebGPU, WebGL2, WebNN, OPFS, persisted storage, IndexedDB, Cache API, service/web workers, OffscreenCanvas, Web Locks, BroadcastChannel, wake lock, Compute Pressure, `performance.memory`, `measureUserAgentSpecificMemory`, `scheduler.yield`, WebCodecs, AudioWorklet, media devices, WebTransport, and the Chrome Built-in AI `availability()` verdicts), storage usage details, battery charging/discharging times, Network Information, a detailed display block (avail size, color depth, orientation, viewport, HDR, wide gamut, extended displays, reduced motion, color scheme), locale/time zone, `secureContext`, page origin and visibility state.
- feat: `HarnessInfo.runtimeVersions` (package name -> version of every runtime the host bundled, stamped at build time) and `HarnessInfo.commit`; hosts should also set each adapter's `runtimeVersion` so cells name the runtime that produced them. `detectEngine()`, `deriveDeviceType()`, `parseGpuModel()`, `detectWasmFeatures()` are exported and unit-tested (`tests/env-capture.test.ts`).

## 0.2.1

- fix: the UA-parse fallback (every WebKit browser, which has no UA Client Hints) now names Chrome for iOS (`CriOS/`) and Firefox for iOS (`FxiOS/`) instead of reporting `unknown`, and records the iOS version the UA carries (`OS 26_0 like Mac OS X` -> `26.0`) instead of `unknown-frozen`. The first iPhone submissions had arrived as browser `unknown` / OS version `unknown-frozen`. Environment capture only; no protocol or scoring change. `parseUserAgent()` is exported and unit-tested (`tests/env.test.ts`).

## 0.2.0

Protocol bump to `localmode-bench/2`. Three thorough-suite pilots on real
Chrome (runs fde0323d, be2330f1, 76cd73f9, 2026-09-18) surfaced measurement
defects; every change below was verified by a subsequent pilot, and the third
pilot ran all 51 cells green.

- **Stream-coherence gating** (`isIncrementalStream()`, threshold
  `STREAM_COHERENCE_MIN_SPAN_RATIO`): TTFT/decode/prefill derive only from
  traces with >= 2 non-empty chunks spanning >= 20% of the request
  (`CellSummary.streamIncremental` records the verdict). LiteRT-LM's surface
  flushed all 128 chunks within 0.8 ms of a 30 s request, which v1 scored as a
  693,902 chars/s decode rate (the envelope rule correctly quarantined it). New
  `totalMs` / `overallCharsPerSec` summaries report the end-to-end rate for
  every generation lane; an `overall-rate-envelope` plausibility rule bounds it.
- **Quality lane rebuilt**: v1's 8-token budget scored thinking-mode builds
  (Qwen3) at 0 for format reasons, not fidelity. Now `MMLU_MAX_TOKENS = 48`,
  `<think>` blocks stripped before parsing (markdown emphasis tolerated;
  letters matched case-sensitively after a keyword so "the answer is a bit" is
  not answer A; "Option C" / "choice (B)" accepted), uniform per-pairing
  `qualityPromptSuffix` (catalog-driven, e.g. ` /no_think`), raw per-item
  `outputs` (capped at 400 chars each, `MMLU_OUTPUT_CAP`; the client scores the
  capped text) + `parseRate` stored with server-side score recomputation
  (`quality-details-mismatch` rejection), and `qualityParseRate` surfaced in
  summaries, index rows, leaderboard rows, and CSV so a format-limited score (Gemma 4
  on wllama emits untagged chain-of-thought: 0.04 with 8% parsed) is never
  mistaken for low fidelity.
- **Degenerate-generation gate** (`MIN_GENERATED_CHARS = 16`): a timed
  iteration that generates fewer than 16 characters is gated
  `degenerate-output` and the cell marked invalid; the validator rejects an
  `ok` cell carrying one. Surfaced by SmolLM2 on wllama producing 0-8
  characters under an untemplated prompt.
- **Uniform user-turn contract, documented**: every runtime receives the
  fixed prompt as a single user turn through its own chat template. The
  wllama provider previously bypassed the template for bare prompts (fixed in
  `@localmode/wllama` 3.2.0); the bench's wllama lane (the host adapter in
  `apps/ui/src/lib/bench/adapters.ts`) additionally pins
  `cache_prompt: false` so a repeated prompt pays prefill every iteration
  (llama.cpp's default prompt-KV reuse made TTFT drop from 1018 ms to 24 ms
  from the second iteration on).
- **Error cause preserved**: cell errors record the wrapped provider cause
  (`error.cause`), so an opaque `ModelLoadError` no longer hides the ORT
  `std::bad_alloc` underneath; error cells also carry a failure-time memory
  sample (`memory.atError`) so failures can be correlated with heap size.

**Known limitation (documented, not fixed):** the Transformers.js lanes share
one ONNX Runtime WASM instance per page, and its heap never shrinks. Under
system memory pressure - a standard suite peaks near 9 GB of JS heap and a
thorough suite above 8 GB, so a 16 GB machine with other applications open is
already at the edge - a large-model session creation can fail with
`std::bad_alloc`, and once one ORT session fails every later ORT session in the
page fails too. Such cells are recorded as errors with their cause and memory
sample, never as data. Isolating each Transformers.js model in its own worker
is the structural fix and is future work.
- **Deterministic runtime execution order** (`RUNTIME_EXECUTION_ORDER`,
  enforced via `orderCells()`): a reproducibility measure so runtime
  interleaving is not a confounder. It is not a correctness fix - the
  transformers failures that motivated it were primarily a session leak in
  `@localmode/transformers` `preloadModel()` (fixed in 4.1.2), independent
  of order; the shared ORT heap itself remains fragile under system memory
  pressure (see the known limitation below).

`BENCH_SCHEMA_VERSION` is 2; `PLAUSIBILITY_RULES_VERSION` is 2. Archived v1
runs stay published as v1 and are never re-scored. Long-format CSV adds
`overallCharsPerSec` / `streamIncremental` columns and blanks TTFT/decode for
non-incremental iterations; the leaderboard CSV (`rowsToCSV`) adds
`overallCharsPerSec` / `qualityParseRate`. New exports:
`RUNTIME_EXECUTION_ORDER`, `orderCells`, `MIN_GENERATED_CHARS`,
`STREAM_COHERENCE_MIN_SPAN_RATIO`, `isIncrementalStream`, `MMLU_MAX_TOKENS`,
`MMLU_OUTPUT_CAP`.

## 0.1.0

Initial release - protocol `localmode-bench/1`.

- Cross-runtime benchmark runner: (runtime × model × workload) cells with
  cache-probed cold/warm loads, 1 untimed warmup, 3–5 timed runs, cool-downs,
  Compute-Pressure gating, wake lock, and visibility-based validity gates.
- MLPerf-Client-compatible metrics: TTFT, decode throughput excluding the
  first token (endpoints-based), pp128/pp512 prefill, single vs batch-32
  embedding lanes, protocol-point memory sampling.
- Raw per-chunk timestamp traces + generated text stored in every result;
  all statistics recomputable from the trace (`summarizeRun`).
- Environment capture with honest provenance (UA-CH vs frozen-UA parsing,
  clamped-field labeling, WebGPU `adapter.info`, timer-grid inference).
- Versioned integrity rules (`validateSubmission`): monotonicity, decode-rate
  envelopes, text/chunk agreement, timer-grid conformance, cross-field
  environment checks, software/virtual-renderer detection (GPU-lane results
  from SwiftShader/WARP-class adapters are rejected; WASM/CPU-only runs are
  annotated), deterministic matmul calibration check.
- Canonical JSON + SHA-256 run digests; leaderboard aggregation with
  median-of-medians and min-3-submission provisional flags; long-format CSV
  export for offline analysis (`scripts/analyze.ts`).
- Quality-fidelity lane: tinyMMLU-100 (MIT) accuracy + STS-B-100 (CC BY-SA,
  isolated directory) Spearman, temperature 0.
