# @localmode/bench

Cross-runtime benchmark harness for in-browser AI. Measures LLM and embedding
inference across browser ML runtimes - Transformers.js (WebGPU + WASM), WebLLM,
wllama, LiteRT, Chrome Built-in AI, MediaPipe - with MLPerf-Client-compatible
metric definitions, raw per-chunk traces for auditability, versioned integrity
rules for community submissions, and leaderboard aggregation.

The public runner + leaderboard live at **https://localmode.ai/bench**.
The protocol is documented at **https://localmode.ai/bench/methodology**.

## Protocol (`localmode-bench/5`)

Result schema version 3 (`BENCH_SCHEMA_VERSION`), plausibility rule set 2
(`PLAUSIBILITY_RULES_VERSION`). Archived runs stay published under their
version and are never re-scored; the public leaderboard at localmode.ai shows
the protocol versions in `LEADERBOARD_PROTOCOL_VERSIONS` (the current one and
the previous one) in separate rows that never mix (`aggregateRuns()` groups by
`run.protocol` and each row carries it; hosts choose which versions to show).
v5 changes only the llama.cpp lanes: they request half the browser's logical
thread count (at least two) instead of all of it, because a pool over every
logical thread ran at half speed with high variance on hybrid and SMT
processors, and load with a 2,048-token context sized to the workloads (about
700 tokens) instead of the provider's 8,192 default, which shrinks the KV
cache of the 3.46 GB Gemma 4 E2B GGUF on the CPU lane, under the 4 GiB
link-time memory cap of wllama's memory64 build (the compatibility build for
browsers without JSPI or Memory64, such as Safari, is 32-bit; that lane's
Gemma quality cell still fails there on the per-request state allocation,
recorded as an error as under v4); `n_ctx`, `n_threads`,
`multithread` and `n_threads_used` are recorded per cell. v3 split the llama.cpp lane: `wllama` is llama.cpp
WASM on the CPU (`n_gpu_layers: 0`) and `wllama-webgpu` offloads every layer
to WebGPU, over the same GGUF files; under v2 the single `wllama` lane ran on
WebGPU wherever the browser had it while recording `wasm` (wllama 3.5's
default). v4 loads every llama.cpp language model as text only: under v3 the
Gemma 4 E2B pairing also loaded its 557 MB vision projector (the provider's
catalog default), which the text-only workloads never use, did not fit the
CPU lane under that 4 GiB cap, and disabled wllama's model cache for the pair so
the warmup and the warm reload re-downloaded the 3.46 GB weights.

- **TTFT** - first non-empty stream chunk minus stream start (`performance.now()`
  wall clock on a cross-origin-isolated page).
- **Decode rate (tg128)** - `(chars after first chunk) / (last − first chunk time)`;
  first token excluded (MLPerf Client TPS definition); endpoints-based, never
  averaged per-token deltas. Reported as chars/sec (tokenizer-independent);
  exact tok/s is computed post-hoc from the stored generated text.
- **Prefill (pp128 / pp512)** - approx prompt tokens / TTFT, on fixed public prompts.
- **Stream coherence** - TTFT/decode/prefill derive only from genuinely
  incremental streams (>= 2 non-empty chunks spanning >= 20% of the request,
  `STREAM_COHERENCE_MIN_SPAN_RATIO`; `isIncrementalStream()` is the test and
  `CellSummary.streamIncremental` records the verdict). Runtime surfaces that
  flush every chunk in a terminal burst (observed on LiteRT-LM) report the
  end-to-end rate instead, marked `e2e` in the UI.
- **End-to-end rate** - total chars / request wall time (prefill + decode
  conflated); reported for every generation lane as `overallCharsPerSec`
  beside `totalMs`, and bounded by the `overall-rate-envelope` rule.
- **Load** - cold (cache-miss) vs warm (cache-hit) reported separately; the
  provider cache is probed before load. Chrome Built-in AI is the exception:
  Chrome downloads Gemini Nano once, browser-wide, only from a user activation,
  so the host starts that download at the Run click while other lanes run and
  the lane's cold load measures the remaining wait (the localmode.ai runner does
  this; see its `chrome-ai-download.ts`).
- **Run policy** - 1 untimed warmup, 3–5 timed runs, cool-down between cells,
  Compute-Pressure gate on Chromium, wake lock held, visibility-gated validity.
- **Prompt contract** - every runtime receives the fixed prompt as a single
  user turn through its own chat template; cross-request prompt/KV caching is
  disabled in the host adapter where a runtime enables it by default (the
  wllama lane pins `providerOptions.wllama.cache_prompt: false`) so each timed
  iteration pays prefill.
- **Degenerate-output gate** - a timed iteration with fewer than 16 generated
  chars (`MIN_GENERATED_CHARS`) is gated `degenerate-output` and the cell
  marked `invalid` instead of scored; the validator's `degenerate-generation`
  rule rejects an `ok` cell that carries one.
- **Watchdog** - every load, warmup, timed iteration, embedding call, and
  quality lane is guarded (`RunPolicy` `loadStallMs` 3 min, `chunkStallMs`
  2 min, `iterationTimeoutMs` 10 to 15 min, `qualityTimeoutMs` 30 to 45 min):
  a stall or an overrun aborts the call with a `TimeoutError`, the cell is
  retried (`maxAttempts` 2) and then recorded as an error while the run
  continues, so a suite always finishes and can be submitted. Every failed
  attempt stays on the cell in `attempts`; retries are never silent.
- **Hidden tab** - a timed iteration the tab was hidden during (browsers
  throttle background tabs) is set aside on the cell in `discardedIterations`
  and repeated once the tab is visible again (the runner waits up to
  `visibilityWaitMs`, 10 minutes, and up to `maxAttempts` repeats per
  iteration); a tab that stays hidden leaves the cell `invalid`.
- **Runtime configuration** - a cell carries `runtimeConfig` when its adapter
  reports one after load (thread count, GPU layers requested, llama.cpp's
  `offloaded N/M layers` report, device, dtype): the equal-care record per
  cell. `resolvedBackend` is what the runtime did, never what the lane asked.
  On localmode.ai (since site build 2.16.14) the Transformers.js WASM lane's
  cells also record `numThreads`, the WASM thread count ONNX Runtime
  initialised with in the lane's worker (read back from the runtime env, so
  it is ONNX Runtime's own default on a protocol run), and its embedding
  cells record the `dtype` they load at (`fp32`, the provider's default).
  `model.quantization` is the catalog's label for a pairing, not a recorded
  fact: the Transformers.js `bge-small-en` pairing is labelled `q8`, but
  every run before 0.9.8 loaded fp32 on both Transformers.js lanes (the
  provider's default; the harness never passed the label), and on the WASM
  lane its preload fetched the q8 files while the timed model used the fp32
  file, so that pairing's cold-start `load` measures the preload and the fp32
  download falls in the first warmup. `runtimeConfig.dtype` is the recorded
  dtype from 0.9.8 on: every `transformers-wasm` cell, and the
  `transformers-webgpu` language-model cells (there it is the catalog label,
  which the provider's `q4` default matches; the `transformers-webgpu`
  embedding cells record none).
- **Execution order** - deterministic runtime order (`RUNTIME_EXECUTION_ORDER`:
  transformers-wasm, transformers-webgpu, chrome-ai, webllm, mediapipe, litert,
  wllama-webgpu, wllama; `orderCells()` applies it and the runner enforces it;
  the Transformers.js WASM lane goes first because Transformers.js chains every
  ONNX session creation on one uncaught promise, so a failed WebGPU session
  would fail the CPU lane's sessions too) for
  reproducibility, so runtime interleaving is not a confounder across runs. It
  is a reproducibility measure only, not a memory or correctness fix.
- **Error cells** - `error.cause` carries the wrapped provider error's message,
  `error.causeName` its name and `error.causeStack` its stack (capped at 4,000
  characters; a WASM abort names its native frame only there), and
  `memory.atError` a failure-time memory sample; error cells are never data.
- **Skipped cells** - a lane the runtime reports unavailable, a lane the
  submitter switched off, or a build the device cannot run stays in the result
  as a `skipped` cell with the reason (`PlannedCell.skipReason` for the host's
  own decisions), so every result lists every cell its suite defines.
- **Trace events** - visibility, wake lock, GPU device loss, aborts, cool-downs,
  and compute-pressure transitions (recorded on state change only; the gate
  itself reads every one-second sample). Wake lock: `wakelock-acquired` when
  the screen wake lock is granted, `wakelock-released` when it ends, and since
  0.9.2 `wakelock-denied` (detail: the error name, e.g. `NotAllowedError`) when
  the request at the start of the run is refused. WebKit (Safari, every iOS
  browser) grants the lock only on a user interaction, so a run started
  without one (a series run after its reload) is refused there; the recorder
  then requests it again on the next activation-triggering input event and, if
  granted, records `wakelock-acquired` with the detail `user-activation`. A
  run with no wake-lock event predates 0.9.2 or ran where
  `environment.apis.wakeLock` is false.
- **Environment capture** (`captureEnvironment()`) - everything the browser
  discloses, recorded whether or not the current analysis uses it, every probe
  guarded so a missing API records nothing for its key: browser (UA-CH brands
  or UA parse, engine, vendor, `webdriver`), OS (platform, version where
  disclosed, architecture, bitness, model, `navigator.platform`), the raw
  user-agent string, form factor (`device.type` phone/tablet/desktop from UA-CH
  form factors, the UA, and touch points; `deriveDeviceType()`), hardware
  (cores and device memory labeled clamped, JS heap ceiling), WebGPU adapter
  (`adapter.info`, features, limits, subgroup sizes, preferred canvas format),
  WebGL (vendor/renderer, versions, capacity limits, software-renderer flag)
  plus the GPU model parsed out of the renderer string (`parseGpuModel()`,
  e.g. `Apple M4`), the WebAssembly proposal matrix (`detectWasmFeatures()`;
  the wasm-feature-detect 1.9.0 modules inlined: SIMD, relaxed SIMD, threads,
  exceptions and exnref, GC, memory64, multi-memory, tail calls, typed function
  references, JSPI, JS string builtins, ...) with the largest 32-bit memory the
  engine reserves, API availability (WebGPU, WebGL2, WebNN, OPFS, persisted
  storage, IndexedDB, Cache API, workers, OffscreenCanvas, Web Locks, wake lock,
  Compute Pressure, `performance.memory`, WebCodecs, AudioWorklet, WebTransport,
  Chrome Built-in AI verdicts), storage quota + usage, battery, network
  information, display (size, DPR, color depth, orientation, viewport, HDR,
  wide gamut, color scheme), locale and time zone, page origin, and visibility.
  `harness.runtimeVersions` stamps the runtime package versions the host
  bundled and each cell's `runtimeVersion` names the one that produced it.
  Since 0.9.0 a host may also stamp `harness.series` (`{ id, index, count }`,
  the run's place in a consecutive series, one fresh page load per run) and
  `harness.coldStart: 'provider-caches-cleared'` (the run started right after
  the page cleared its providers' model caches; it does not claim a fresh
  browser profile, since a page cannot clear the HTTP disk cache). Since
  0.9.1 `harness.series` may carry `cooldownMs` (the idle wait the host
  configured between the runs of the series, integer, 0 to
  `SERIES_MAX_COOLDOWN_MS` = 1 hour, on every run including run 1) and
  `idleBeforeMs` (the idle time the host measured before this run started,
  integer, 0 to `SERIES_MAX_IDLE_BEFORE_MS` = 30 days; absent on run 1). A
  cool-down is idle time on the page, not a protocol setting: a 7-run
  back-to-back Quick series on a 15 W class laptop showed the llama.cpp CPU
  decode falling from about 135 to about 85 chars/s from run 3 on, so laptop
  and phone series need a recorded pause between runs.
  Since 0.9.4 a host may record `environment.userReportedHardware`
  (`{ gpu?, chassis?, ramGB?, otherAppsRunning? }`): the hardware a paid-study
  participant reports on the page (GPU name, laptop/desktop/other, RAM bucket
  in GB or `null` for "Not sure", other heavy programs running). It is
  self-reported, published with the run, absent on every other run, covered
  by the digest, and validated (`gpu` 1 to 64 characters after trimming
  without control characters, `ramGB` an integer from 1 to 1024 or `null`);
  `scrubRunForPublication` normalizes the GPU name with `sanitizeReportedGpu()`,
  which since 0.9.5 also removes URLs, email addresses and computer names
  (`DESKTOP-XXXXXXX`, `LAPTOP-XXXXXXX`, `WIN-XXXXXXXXXXX`) from it.
  Since 0.9.6 a run may carry `harness.control` (`{ kind, runtimeOrder }`):
  it marks a control run, which is not a protocol run (see Control runs
  below). The kinds are `order-reversed`, whose `runtimeOrder` must be
  exactly the reverse of `RUNTIME_EXECUTION_ORDER`, and (since 0.9.7)
  `fixed-order`, whose `runtimeOrder` must be `RUNTIME_EXECUTION_ORDER`
  itself, and (since 0.9.8) `wasm-default`, whose `runtimeOrder` must be
  `RUNTIME_EXECUTION_ORDER` itself and which also carries
  `wasmLane: { dtype: 'q8', numThreads, simd: true }`: the Transformers.js
  WASM lane settings the run applied (`numThreads` the ONNX Runtime WASM
  thread count the host set, the browser's `navigator.hardwareConcurrency`,
  an integer from 1 to 1024). `wasmLane` is required on `wasm-default` and
  refused on every other kind; the validator rejects any other kind, order
  or `wasmLane`, and the digest covers the field like the rest of `harness`.
- **Statistics** - median headline; mean ± SD, IQR, 95% CI (Student-t), CV;
  CV > 5% ⇒ high-variance flag; geomean only within a device run.
- **Quality-fidelity lane** - tinyMMLU (MIT) accuracy + STS-B Spearman (scores
  CC BY-SA 4.0; see Dataset licenses), temperature 0; measures
  runtime/quantization fidelity, not model capability.
  MMLU: 48-token budget (`MMLU_MAX_TOKENS`), `<think>` blocks stripped before
  parsing (markdown emphasis tolerated; letters are matched case-sensitively
  after a keyword, so "the answer is a bit" is not answer A; "Option C" and
  "choice (B)" are accepted), uniform per-pairing `qualityPromptSuffix` for
  thinking-mode builds, raw per-item `outputs` (capped at 400 chars each,
  `MMLU_OUTPUT_CAP`; the client scores exactly the capped text) + `parseRate`
  stored so scores are recomputable server-side (the `quality-details-mismatch`
  rule rejects disagreement); the parse rate is reported beside the score as
  `qualityParseRate` (a low parse rate = format-limited, not low fidelity).

## Control runs

The protocol executes its cells in the fixed `RUNTIME_EXECUTION_ORDER`, a
reproducibility measure; a lane is therefore tied to its position in the
suite (what ran before it, how long the page has been busy). A control run,
a control experiment for the methodology, runs the same suite in the
runtime order its kind names, so that the lane ratios of two orders can be
compared:

```ts
import { createHarnessControl, runBenchmarkSuite } from '@localmode/bench';

const control = await runBenchmarkSuite({
  ...sameOptionsAsAProtocolRun,
  harness: { ...harness, control: createHarnessControl('order-reversed') },
});
// control.harness.control = { kind: 'order-reversed', runtimeOrder: ['wllama', 'wllama-webgpu', ..., 'transformers-wasm'] }
```

- `order-reversed` runs the runtimes in the exact reverse of
  `RUNTIME_EXECUTION_ORDER` (`controlRuntimeOrder()`); within a runtime the
  catalog order is kept. It also runs the Transformers.js WebGPU lane before
  its WASM lane, which the protocol order avoids; a WebGPU session failure
  that takes the WASM lane with it is recorded as an error, as on any run.
- `fixed-order` (since 0.9.7) runs the runtimes in `RUNTIME_EXECUTION_ORDER`
  itself, exactly as a protocol run does, but marked as a control run. It is
  the same-build, same-day reference series for an order-reversed series:
  the protocol runs on the leaderboard may come from another browser build,
  and a browser update can move a lane on its own, so comparing the two
  orders within one browser build needs a reference recorded beside the
  reversed series and kept out of the leaderboard. Record a `fixed-order`
  series and an `order-reversed` series on the same machine, the same
  browser build and the same day, with the same suite and settings.
- `wasm-default` (since 0.9.8) runs the runtimes in
  `RUNTIME_EXECUTION_ORDER` with the Transformers.js WASM lane at the
  runtime's own defaults instead of the protocol's configuration: its models
  load at dtype `q8` (Transformers.js 4.2's default on the WASM device; the
  protocol loads the language model's `q4` files, which the provider uses on
  both devices, and the embedding model at `fp32`), and ONNX Runtime's WASM
  thread count is set to `navigator.hardwareConcurrency` (ONNX Runtime's own
  default is `min(4, ceil(cores / 2))` on a cross-origin-isolated page).
  Every other lane and every rule is the protocol's. It shows how far the
  protocol's WASM-lane configuration sits from what an application gets by
  default. The run records the settings in `harness.control.wasmLane`, and
  each WASM cell's `runtimeConfig` records the `dtype` and the `numThreads`
  ONNX Runtime ran with (one thread if the page cannot run WASM threads).
  Build the marker with
  `createHarnessControl('wasm-default', { numThreads: navigator.hardwareConcurrency })`;
  the host applies the settings to its WASM lane (the package has no
  runtime to apply them to). On localmode.ai run it on the Standard tier,
  the smallest suite with a Transformers.js WASM language-model cell
  (Qwen3 0.6B):
  `/bench/run?tier=standard&quality=off&runs=6&cooldown=5&cold=off&control=wasm-default`.
- Leave a cool-down between the runs of a series (`cooldown=5` in the
  runner link, five minutes between runs; the parameter is in minutes,
  capped at 30): on a laptop that is still warm from the previous run, the
  Compute Pressure state can reach `serious` or `critical` during the next
  one, and an analysis that excludes runs by their `pressureCriticalFraction`
  would then drop them.
- The runner orders the cells by `harness.control.runtimeOrder` and refuses
  any order that is not the kind's canonical one (and a `wasm-default`
  marker without a valid `wasmLane`, or a `wasmLane` on another kind), so
  the record names the order the run used. Cells, the run policy, validity gates, traces and the
  environment capture are those of a protocol run.
- A control run is not a protocol run: it is never submitted, published or
  scored, which is why the field needed no protocol version. The localmode.ai
  runner offers Export JSON only (`/bench/run?control=order-reversed`,
  `/bench/run?control=fixed-order` or `/bench/run?control=wasm-default`, see
  SETUP.md), the submission route answers 422 `control-run`, and
  `aggregateRuns` leaves control runs out of every leaderboard row.
  `isControlRun(run)` is the check.
- Control runs are kept in the dataset under `controls/`, never indexed (see
  Results dataset). The analysis CLI reads them like any run file:
  `runs.csv` names their kind and order, and `leaderboard.csv` leaves them out.

## Usage (host wiring)

Adapters inject the runtimes; the package has zero runtime dependencies.

```ts
import {
  runBenchmarkSuite, RUN_POLICIES, LLM_WORKLOADS,
  computeRunDigest, validateSubmission,
} from '@localmode/bench';

const result = await runBenchmarkSuite({
  suite: 'quick',
  cells: [{ model: benchModelRef, workload: LLM_WORKLOADS[0] }],
  policy: RUN_POLICIES.quick,
  llmAdapters,      // Map<runtimeId, LLMRuntimeAdapter> - see src/adapter.ts
  embedAdapters,
  harness: { name: '@localmode/bench', version: '0.5.0', runtimeVersions: { '@wllama/wllama': '3.5.1' } },
  abortSignal: controller.signal,
});
result.digest = await computeRunDigest(result);
```

Server-side, validate any submission with `validateSubmission(run)` - it
recomputes every statistic from the raw trace and applies the versioned
plausibility rules (monotonicity, decode-rate and end-to-end-rate envelopes,
stream-coherence gating, the degenerate-generation check, MMLU recomputation
from stored outputs, timer-grid conformance, cross-field environment
consistency, calibration-check sanity).

## Known limitation

The Transformers.js lanes share one ONNX Runtime WASM instance per page, and
its heap never shrinks. Under system memory pressure - a standard suite peaks
near 9 GB of JS heap and a thorough suite above 8 GB, so a 16 GB machine with
other applications open is already at the edge - a large-model session
creation can fail with `std::bad_alloc`, and once one ORT session fails every
later ORT session in the page fails too. Such cells are recorded as errors
with their `error.cause` and `memory.atError` sample, never as data. The
deterministic execution order does not change this. Isolating each
Transformers.js model in its own worker is the structural fix and is future
work.

## What a public run file may carry

The environment capture reads what the browser discloses about the device,
but a public file must not identify a device. Schema 3 therefore
does not capture the time zone, UTC offset or calendar (only the BCP 47
locale tag), the language list, the battery's exact level or time-to-full
(the level is kept to the quarter, plus whether it is charging), or display
preferences. `scrubRunForPublication(run)` is the one rule for this: it
strips the submission nonce and, for a run captured under an earlier schema,
removes those fields (`changed` tells the caller to recompute the digest and
stamp `scrubbedAt`). The run digest covers everything except `digest` and
`nonce`, so a published file verifies without the credential it was
submitted with; `verifyRunDigest` also accepts the pre-schema-3 rule for
files that still carry a nonce.

## Results dataset (GitHub-as-database)

Community submissions are stored in a public GitHub repository:

```
runs/YYYY/MM/<runId>.json    verified submissions (auto-published)
quarantine/YYYY/MM/<runId>.json  flagged submissions (public, hidden from charts)
index/summary.json           aggregated leaderboard rows (rebuilt on write)
controls/<kind>/<YYYY-MM-DD>/<runId>.json  control runs (harness.control), never indexed
```

`controls/` holds control runs (see Control runs), filed by kind and by the
UTC date of `createdAt`. They are never submitted, so the submission API
never writes there: a maintainer files exported control runs into a clone
with `apps/ui/scripts/collect-control-runs.ts` (SETUP.md, section 9). They
never appear in `index/summary.json` and never on the leaderboard.

Environment variables for the submission API (see `apps/ui`):

| Var | Purpose |
| --- | --- |
| `BENCH_GITHUB_REPO` | `owner/name` of the public results repo |
| `BENCH_GITHUB_TOKEN` | fine-grained token, Contents read/write on that repo only |
| `BENCH_NONCE_SECRET` | HMAC secret for the verified-tier session nonce |

Without a token the API answers 503 and the runner still offers local JSON
export - runs are never lost.

## Analysis tooling

```ts
import { aggregateRuns, rowsToCSV, runsToLongCSV, runsToCellsCSV, runsToRunsCSV } from '@localmode/bench';
```

`runsToLongCSV(runs)` emits one row per timed iteration with full device
identity columns - feed it directly to R/pandas. It carries
`overallCharsPerSec` and `streamIncremental` per iteration and leaves TTFT /
decode blank for non-incremental ones; `rowsToCSV(rows)` (leaderboard rows)
carries `overallCharsPerSec` and `qualityParseRate`.

`npx tsx packages/bench/scripts/analyze.ts <runs-dir> [out-dir]` writes all of
them for a clone of the dataset: `leaderboard.csv` (`rowsToCSV`),
`iterations.csv` (`runsToLongCSV`), `cells.csv` (`runsToCellsCSV`),
`runs.csv` (`runsToRunsCSV`) and `validation.txt`. Run files are read in
sorted path order; rows follow run order, then cell order, then iteration
order. A field the record does not carry is an empty string, never zero.

### CSV columns

New columns are only ever appended, so a reader that addresses columns by
name or by position keeps working.

**iterations.csv**, appended after `status` (one row per timed iteration; a
cell without timed iterations keeps one placeholder row):

| Column | Meaning |
| --- | --- |
| `cellId` | `runtime/model/workload`; joins to `cells.csv` with `runId` |
| `chunkCount` | Chunks in the trace, empty chunks included (LLM lanes) |
| `generatedTokensApprox` | `providerUsage.outputTokens`, when the runtime reported usage |
| `generatedTokensFidelity` | `providerUsage.fidelity`: `measured`, `estimated` or `chunk-count` |
| `tokensPerSecApprox` | Chunks after the first visible chunk over the decode window (first visible chunk to last chunk), one chunk counted as one token. The per-iteration value whose median the cell summary reports as `decodeChunksPerSec`; empty unless every iteration of the cell passes the stream-coherence gate, the rule the leaderboard applies |
| `finishReason` | The runtime's finish reason (`length`, `stop`, ...) |
| `gates` | Validity gates that fired during the iteration, joined with `\|` |
| `embedCount` | Texts embedded in the iteration (embedding lanes) |

**cells.csv**, one row per cell, every status:

| Column | Meaning |
| --- | --- |
| `runId`, `protocol`, `cellId`, `runtimeId`, `runtimeVersion`, `benchModelId`, `workloadId`, `workloadKind`, `resolvedBackend`, `status` | Cell identity and outcome |
| `invalidReasons` | Why the cell is invalid or skipped, joined with `\|` |
| `iterationCount`, `discardedIterationCount`, `attemptCount` | Timed iterations kept, iterations discarded for a hidden tab, failed attempts before the recorded outcome |
| `warmupMs` | Untimed warmup duration |
| `loadMs` | Load duration (`load.endT - load.startT`); empty when the cell reused a loaded model |
| `loadCached` | Cache probe before the load: `true` warm, `false` cold, empty when unknown |
| `loadDeclaredBytes` | Catalog-declared download size |
| `loadProgressEvents` | Number of load progress samples recorded |
| `loadProgressSpanMs` | Time from the first to the last progress sample |
| `n_threads`, `n_threads_used`, `multithread`, `n_ctx`, `n_gpu_layers`, `offloadedLayers`, `webgpu_adapter`, `cache_prompt`, `mmproj` | The llama.cpp lanes' `runtimeConfig` (requested threads, the pool built, context size, GPU layers requested and llama.cpp's offload report, ...) |
| `dtype`, `device`, `worker` | The Transformers.js lanes' `runtimeConfig` (the WASM lane's `numThreads` is in the run file only, not a column) |
| `memoryBaseline`, `memoryPostLoad`, `memoryPostRun`, `memoryAtError` | Memory samples in bytes at the protocol points and when the cell errored |
| `memoryApi` | The API that measured them: `uaSpecific`, `legacyHeap` or `none` |
| `qualityTaskId`, `qualityScore`, `qualityN`, `qualityParseRate` | Quality-lane result |
| `errorName`, `errorMessage`, `errorCause` | The error that ended the cell |
| `cellStartedAt`, `cellEndedAt` | Since 0.9.3: when the cell began and ended, as ISO 8601 UTC wall-clock times rounded to the millisecond (`2026-09-25T05:36:10.630Z`). Start and end are the earliest and latest page-relative timestamp the cell records: `load.startT` and `load.endT`, the load progress samples, `load.endT + warmupMs` (a lower bound of the warmup end), `startT` and `endT` of every kept and discarded iteration, and the `at` of every failed attempt. A page time `t` maps to `createdAt - (suiteEnd - t)`, where `suiteEnd` is the `t` of the run's last `suite-end` event: the runner stamps `createdAt` right after recording that event, in the same synchronous step, so the offset between them is below a millisecond. The span never reaches past what the cell recorded, so the first cell of a model group starts at its load, and the untimed tail of a cell (the part of a failed attempt after its last record) is not covered. Both empty on a skipped cell, on a cell that records no timestamp (a quality cell that reuses the model an earlier cell loaded and has no failed attempt: the quality lanes record no timing), and on a run without a `suite-end` event. The mapping assumes `performance.now()` advanced with the wall clock through the run; a device that slept mid-run shifts the cells before the sleep later by the time asleep on browsers that pause `performance.now()` during sleep |

**runs.csv**, one row per run:

| Column | Meaning |
| --- | --- |
| `runId`, `createdAt`, `protocol`, `schemaVersion` | Run identity |
| `harnessName`, `harnessVersion`, `harnessAppVersion`, `harnessCommit` | The build that produced the run |
| `suite` | `quick`, `standard`, `thorough` or `custom` |
| `qualityLane` | Whether the run planned any quality cell |
| `deviceClass`, `deviceSubclass` | As in the leaderboard |
| `browser`, `browserVersion`, `browserEngine`, `os`, `osVersion`, `osArchitecture`, `deviceType` | Browser, OS and form factor |
| `hardwareConcurrency`, `coresClamped`, `deviceMemoryGB`, `deviceMemoryCapped` | CPU and memory signals, with their clamp and cap flags |
| `screenWidth`, `screenHeight`, `screenDpr` | Screen size and pixel ratio |
| `gpuAvailable`, `gpuVendor`, `gpuArchitecture`, `gpuDevice`, `gpuDescription`, `gpuIsFallbackAdapter`, `gpuModel` | WebGPU adapter identity and the GPU model from the WebGL renderer |
| `crossOriginIsolated`, `timerResolutionUs`, `fingerprintMflops` | Page isolation, timer grid, hardware fingerprint |
| `cellsTotal`, `cellsOk`, `cellsInvalid`, `cellsError`, `cellsSkipped` | Cell counts by status |
| `suiteDurationMs` | `suite-end` minus `suite-start` |
| `scrubbedAt` | When the publication scrub rewrote the file, if it did |
| `validationOk`, `validationFlags` | `validateSubmission` verdict and its flags as `severity:code`, joined with `\|` |
| `seriesId`, `seriesIndex`, `seriesCount` | `harness.series` (since 0.9.0): the series the run belongs to and its 1-based position in it; empty on a run outside a series |
| `coldStart` | `harness.coldStart` (since 0.9.0): `provider-caches-cleared` when the run started right after the page cleared its providers' model caches; empty otherwise |
| `seriesCooldownMs`, `seriesIdleBeforeMs` | `harness.series.cooldownMs` and `harness.series.idleBeforeMs` (since 0.9.1): the cool-down configured for the series and the idle time measured before this run, in ms; empty when not recorded (idle time is absent on run 1) |
| `pressureSamples` | Number of `pressure-change` trace events (Compute Pressure state transitions the runner recorded; the observer samples once a second and records only changes); 0 when the browser has no Compute Pressure API |
| `pressureCriticalFraction`, `pressureSeriousFraction`, `pressureFairFraction`, `pressureNominalFraction` | Fraction of the suite wall time (`suite-end` minus `suite-start`) spent in each Compute Pressure state, from `pressureStateFractions()`, rounded to four decimals. The state at `suite-start` is the last change at or before it; time before the first known state counts toward none, so the four sum to less than 1 when the first sample arrived mid-suite. Empty when the run has no sample or no complete suite span |
| `rv_*` | One column per runtime package in `harness.runtimeVersions` across all runs, named by `runtimeVersionColumn()` (`@huggingface/transformers` becomes `rv_huggingface_transformers`), sorted by name |
| `powerCharging` | Since 0.9.3, after the `rv_*` columns: `environment.power.charging`, `true` or `false`; empty when the browser has no Battery API (`batterySupported: false`: Safari, Firefox, every iOS browser) |
| `powerLevel` | Since 0.9.3: `environment.power.level`, the battery level rounded to the quarter (0, 0.25, 0.5, 0.75, 1) that schema 3 keeps; empty without the Battery API |
| `reportedGpu` | Since 0.9.4, after `powerLevel`: `environment.userReportedHardware.gpu`, the graphics card or chip a paid-study participant typed (self-reported, normalized by `sanitizeReportedGpu()`); empty when absent |
| `reportedChassis` | Since 0.9.4: `environment.userReportedHardware.chassis`, `laptop`, `desktop` or `other`; empty when absent |
| `reportedRamGB` | Since 0.9.4: `environment.userReportedHardware.ramGB`, the reported RAM bucket in GB (the top bucket "128 GB or more" is 128); empty when absent or answered "Not sure" (`null`) |
| `reportedOtherApps` | Since 0.9.4: `environment.userReportedHardware.otherAppsRunning`, `true` or `false`; empty when absent |
| `controlKind`, `controlRuntimeOrder` | Since 0.9.6, after `reportedOtherApps`: `harness.control.kind` (`order-reversed`, since 0.9.7 `fixed-order`, since 0.9.8 `wasm-default`) and the runtime order the control run used, joined by `>`; empty on a protocol run. `leaderboard.csv` never includes a control run |

## Dataset licenses

- `src/datasets/tiny-mmlu.ts` - MIT (tinyBenchmarks/tinyMMLU, upstream cais/mmlu).
- `src/datasets/stsb/` - the first 100 rows of the STS Benchmark test split,
  all captions from the Microsoft Research Video Description Corpus. The STS
  Benchmark releases its similarity scores under CC BY-SA 4.0 and leaves each
  sentence under its source corpus's terms (Microsoft Research's for these
  pairs). The file is retained for the protocol's quality-fidelity lane while
  the maintainer confirms the redistribution terms; its notice,
  `src/datasets/stsb/LICENSE-CC-BY-SA.md`, ships in the npm package.
