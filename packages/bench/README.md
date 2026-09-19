# @localmode/bench

Cross-runtime benchmark harness for in-browser AI. Measures LLM and embedding
inference across browser ML runtimes - Transformers.js (WebGPU + WASM), WebLLM,
wllama, LiteRT, Chrome Built-in AI, MediaPipe - with MLPerf-Client-compatible
metric definitions, raw per-chunk traces for auditability, versioned integrity
rules for community submissions, and leaderboard aggregation.

The public runner + leaderboard live at **https://localmode.ai/bench**.
The protocol is documented at **https://localmode.ai/bench/methodology**.

## Protocol (`localmode-bench/2`)

Result schema version 2 (`BENCH_SCHEMA_VERSION`), plausibility rule set 2
(`PLAUSIBILITY_RULES_VERSION`). Archived v1 runs stay published as v1 and are
never re-scored; the public leaderboard at localmode.ai aggregates only runs
measured under the current protocol (`aggregateRuns()` in this package does
not filter, so hosts partition by `run.protocol` themselves).

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
  provider cache is probed before load.
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
- **Execution order** - deterministic runtime order (`RUNTIME_EXECUTION_ORDER`:
  transformers-webgpu, transformers-wasm, chrome-ai, webllm, mediapipe, litert,
  wllama; `orderCells()` applies it and the runner enforces it) for
  reproducibility, so runtime interleaving is not a confounder across runs. It
  is a reproducibility measure only, not a memory or correctness fix.
- **Error cells** - `error.cause` carries the wrapped provider error's message
  and `memory.atError` a failure-time memory sample; error cells are never
  data.
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
  harness: { name: '@localmode/bench', version: '0.3.0', runtimeVersions: { '@wllama/wllama': '3.5.1' } },
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

## Paper tooling

```ts
import { aggregateRuns, rowsToCSV, runsToLongCSV } from '@localmode/bench';
```

`runsToLongCSV(runs)` emits one row per timed iteration with full device
identity columns - feed it directly to R/pandas. It carries
`overallCharsPerSec` and `streamIncremental` per iteration and leaves TTFT /
decode blank for non-incremental ones; `rowsToCSV(rows)` (leaderboard rows)
carries `overallCharsPerSec` and `qualityParseRate`.

## Dataset licenses

- `src/datasets/tiny-mmlu.ts` - MIT (tinyBenchmarks/tinyMMLU, upstream cais/mmlu).
- `src/datasets/stsb/` - CC BY-SA 4.0, isolated with its own license file.
