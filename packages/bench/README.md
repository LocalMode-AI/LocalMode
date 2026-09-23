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
cache of the 3.46 GB Gemma 4 E2B GGUF inside the CPU lane's 4 GB wasm heap
(that lane's Gemma quality cell still fails there on the per-request state
allocation, recorded as an error as under v4); `n_ctx`, `n_threads`,
`multithread` and `n_threads_used` are recorded per cell. v3 split the llama.cpp lane: `wllama` is llama.cpp
WASM on the CPU (`n_gpu_layers: 0`) and `wllama-webgpu` offloads every layer
to WebGPU, over the same GGUF files; under v2 the single `wllama` lane ran on
WebGPU wherever the browser had it while recording `wasm` (wllama 3.5's
default). v4 loads every llama.cpp language model as text only: under v3 the
Gemma 4 E2B pairing also loaded its 557 MB vision projector (the provider's
catalog default), which the text-only workloads never use, did not fit the
CPU lane's 4 GB wasm heap, and disabled wllama's model cache for the pair so
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
  itself reads every one-second sample).
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
- **Statistics** - median headline; mean ± SD, IQR, 95% CI (Student-t), CV;
  CV > 5% ⇒ high-variance flag; geomean only within a device run.
- **Quality-fidelity lane** - tinyMMLU (MIT) accuracy + STS-B (CC BY-SA) Spearman,
  temperature 0; measures runtime/quantization fidelity, not model capability.
  MMLU: 48-token budget (`MMLU_MAX_TOKENS`), `<think>` blocks stripped before
  parsing (markdown emphasis tolerated; letters are matched case-sensitively
  after a keyword, so "the answer is a bit" is not answer A; "Option C" and
  "choice (B)" are accepted), uniform per-pairing `qualityPromptSuffix` for
  thinking-mode builds, raw per-item `outputs` (capped at 400 chars each,
  `MMLU_OUTPUT_CAP`; the client scores exactly the capped text) + `parseRate`
  stored so scores are recomputable server-side (the `quality-details-mismatch`
  rule rejects disagreement); the parse rate is reported beside the score as
  `qualityParseRate` (a low parse rate = format-limited, not low fidelity).

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
```

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
| `dtype`, `device`, `worker` | The Transformers.js lanes' `runtimeConfig` |
| `memoryBaseline`, `memoryPostLoad`, `memoryPostRun`, `memoryAtError` | Memory samples in bytes at the protocol points and when the cell errored |
| `memoryApi` | The API that measured them: `uaSpecific`, `legacyHeap` or `none` |
| `qualityTaskId`, `qualityScore`, `qualityN`, `qualityParseRate` | Quality-lane result |
| `errorName`, `errorMessage`, `errorCause` | The error that ended the cell |

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
| `rv_*` | One column per runtime package in `harness.runtimeVersions` across all runs, named by `runtimeVersionColumn()` (`@huggingface/transformers` becomes `rv_huggingface_transformers`), sorted by name |

## Dataset licenses

- `src/datasets/tiny-mmlu.ts` - MIT (tinyBenchmarks/tinyMMLU, upstream cais/mmlu).
- `src/datasets/stsb/` - CC BY-SA 4.0, isolated with its own license file.
