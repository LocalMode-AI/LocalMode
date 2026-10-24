# @localmode/bench

Cross-runtime benchmark harness for in-browser AI. It measures LLM and
embedding inference across browser ML runtimes (Transformers.js on WebGPU and
WASM, WebLLM, wllama, LiteRT, Chrome Built-in AI, MediaPipe) with
MLPerf-Client-compatible metric definitions, keeps raw per-chunk traces so
every number can be recomputed, applies versioned integrity rules to
community submissions, and aggregates runs into leaderboard rows. Runtimes
are injected through adapters, so the package has zero runtime dependencies.

- Leaderboard and runner: https://localmode.ai/bench
- Methodology: https://localmode.ai/bench/methodology
- Public CC0 dataset: https://github.com/LocalMode-AI/LocalMode-Bench

## Install

```bash
npm install @localmode/bench
# or: pnpm add @localmode/bench
```

## Quick start

Run a suite with your own adapters, digest it, validate it, aggregate it:

```ts
import {
  runBenchmarkSuite, computeRunDigest, validateSubmission,
  aggregateRunsWithErrata, LLM_WORKLOADS, RUN_POLICIES,
} from '@localmode/bench';

const run = await runBenchmarkSuite({
  suite: 'quick',
  cells: [{ model: benchModelRef, workload: LLM_WORKLOADS[0] }],
  policy: RUN_POLICIES.quick,
  llmAdapters,   // Map<runtimeId, LLMRuntimeAdapter>, see src/adapter.ts
  embedAdapters, // Map<runtimeId, EmbeddingRuntimeAdapter>
  harness: { name: '@localmode/bench', version: '0.9.12' },
  abortSignal: controller.signal,
});
run.digest = await computeRunDigest(run);

const report = validateSubmission(run); // { ok, shapeErrors, flags, summaries }
// runs: BenchRunResult[]; errata: the dataset's index/errata.json
const { rows, excludedByErratum } = aggregateRunsWithErrata(runs, { errata });
```

`validateSubmission` recomputes every statistic from the raw trace and
applies the versioned plausibility rules. The localmode.ai submit route
refuses a run with shape errors and files a run with reject-severity flags
under `quarantine/` instead of `runs/`.

## Protocol

The current protocol is `localmode-bench/5` (`BENCH_PROTOCOL_VERSION`),
result schema 3, plausibility rule set 2. Any change to a prompt, budget,
policy number or integrity rule bumps the protocol version; archived runs
stay published under the version they were measured with and are never
re-scored. The leaderboard shows the versions in
`LEADERBOARD_PROTOCOL_VERSIONS` (v5 and v4) in separate rows that never mix.

Metric definitions (TTFT, decode rate, prefill, stream coherence, the
end-to-end rate), run policy, validity gates and statistics are on the
[methodology page](https://localmode.ai/bench/methodology); the results live
in the public CC0 [LocalMode-Bench dataset](https://github.com/LocalMode-AI/LocalMode-Bench).

## API

| Group | Exports |
| --- | --- |
| Protocol | `BENCH_PROTOCOL_VERSION`, `LEADERBOARD_PROTOCOL_VERSIONS`, `BENCH_SCHEMA_VERSION`, `ACCEPTED_SCHEMA_VERSIONS`, `LLM_WORKLOADS`, `EMBED_WORKLOADS`, `QUALITY_WORKLOADS`, `WORKLOADS_BY_ID`, `RUN_POLICIES`, `GENERATION_BUDGET`, `MIN_GENERATED_CHARS`, `RUNTIME_EXECUTION_ORDER`, `orderCells` |
| Runner | `runBenchmarkSuite`, adapter types (`LLMRuntimeAdapter`, `EmbeddingRuntimeAdapter`, `LoadedLLM`, `LoadedEmbedder`, ...), `USAGE_FIDELITY`, `TraceRecorder` |
| Environment | `captureEnvironment`, `parseUserAgent`, `detectEngine`, `deriveDeviceType`, `parseGpuModel`, `resolveGpuModel`, `detectWasmFeatures`, `coarseBatteryLevel`, `runFingerprint`, `sampleMemoryBytes`, `memoryApiAvailable`, `hrNow`, `inferTimerResolutionUs`, `sleep` |
| Validation | `validateSubmission`, `validateRunShape`, `checkPlausibility`, `summarizeCell`, `summarizeRun`, `isIncrementalStream`, `offloadReportError`, `liteRtLoadReportError`, `wllamaBuildError`, `PLAUSIBILITY_RULES_VERSION`, `STREAM_COHERENCE_MIN_SPAN_RATIO` |
| Integrity and publication | `canonicalJson`, `sha256Hex`, `computeRunDigest`, `computeLegacyRunDigest`, `verifyRunDigest`, `scrubRunForPublication`, `sanitizeReportedGpu` |
| Aggregation | `aggregateRuns`, `aggregateRunsWithErrata`, `HEADLINE_MIN_SUBMISSIONS`, `deviceClassOf`, `deviceSubclassOf`, `gpuArchitectureOf`, `refineDeviceClass`, `amdArchitectureFromRenderer`, `pressureStateFractions` |
| Errata | `ERRATA_FILE`, `validateErrata`, `validateErrataShape`, `errataExclusions`, type `ErratumEntry` |
| Control runs | `CONTROL_KINDS`, `CONTROL_WASM_LANE_SPECS`, `CONTROL_WLLAMA_BUILDS`, `WLLAMA_BUILDS`, `CONTROL_CURRENT_RELEASE_PACKAGES`, `CURRENT_RELEASE_LANE_PACKAGES`, `CONTROL_PROFILE_SPECS`, `createHarnessControl`, `controlRuntimeOrder`, `controlWasmLaneError`, `controlWllamaBuildError`, `controlRuntimeVersionsError`, `runtimeVersionCellError`, `cellProfileError`, `summarizeGaps`, profiler types (`BenchCellProfiler`, `BenchCellProfile`, ...), `isControlRun` |
| Statistics and quality | `median`, `mean`, `stddev`, `quantile`, `geomean`, `summarize`, `spearman`, `runMMLUFidelity`, `runSTSQuality`, `parseMMLUAnswer`, `TINY_MMLU`, `STSB_SUBSET` |
| Analysis exports | `rowsToCSV`, `runsToLongCSV`, `runsToCellsCSV`, `runsToRunsCSV`, `runtimeVersionColumn` |

`src/index.ts` is the complete list, including every type.

## Analysis CLI

From a checkout of the LocalMode monorepo, over a clone of the dataset:

```bash
npx tsx packages/bench/scripts/analyze.ts <runs-dir> [out-dir] [--errata <file> | --no-errata]
```

It writes `leaderboard.csv`, `iterations.csv`, `cells.csv`, `runs.csv`,
`validation.txt` and `errata.txt`. The dataset's `index/errata.json` is
applied to `leaderboard.csv` only, and an errata file that fails validation
stops the CLI before anything is written. Column reference:
[NOTES.md, CSV columns](https://github.com/LocalMode-AI/LocalMode/blob/main/packages/bench/NOTES.md#csv-columns).

## Control runs

A control run is a control experiment for the methodology: the same suite as
a protocol run, marked with `harness.control` and never submitted, published
or scored (`aggregateRuns` skips it and the submit route answers 422
`control-run`). Build the marker with `createHarnessControl(kind, options?)`.

| Kind | Runtime order | Transformers.js WASM dtype | WASM threads | llama.cpp build | Since |
| --- | --- | --- | --- | --- | --- |
| (protocol run) | `RUNTIME_EXECUTION_ORDER` | protocol files (`q4` LLM, `fp32` embedding) | ONNX Runtime default | wllama's choice | |
| `order-reversed` | reverse of the protocol order | protocol files | ONNX Runtime default | wllama's choice | 0.9.6 |
| `fixed-order` | protocol order | protocol files | ONNX Runtime default | wllama's choice | 0.9.7 |
| `wasm-default` | protocol order | `q8` | `navigator.hardwareConcurrency` | wllama's choice | 0.9.8 |
| `wasm-q8` | protocol order | `q8` | ONNX Runtime default | wllama's choice | 0.9.9 |
| `wasm-threads` | protocol order | protocol files (`q4`) | `navigator.hardwareConcurrency` | wllama's choice | 0.9.9 |
| `wllama-compat` | protocol order | protocol files | ONNX Runtime default | `compat` in every browser | 0.9.13 |
| `current-releases` | protocol order | protocol files | ONNX Runtime default | wllama's choice | 0.9.14 |
| `ort-profile` | protocol order | protocol files | ONNX Runtime default | wllama's choice | 0.9.14 |
| `llamacpp-profile` | protocol order | protocol files | ONNX Runtime default | wllama's choice | 0.9.14 |

`current-releases` runs the Transformers.js, WebLLM, wllama and LiteRT-LM
lanes on the runtimes' current npm releases instead of the pinned ones
(`harness.control.runtimeVersions`; each of those cells records
`runtimeConfig.runtimeVersion`). `ort-profile` and `llamacpp-profile` add a
per-cell `profile`: an ONNX Runtime Web operator profile from an untimed
pass after each Transformers.js Qwen3 generation cell, or the llama.cpp
token delivery stamps (worker receipt and reply, page send and receipt,
chunk) summarized per request. The host supplies the profiler through
`LoadedLLM.profiler`.

wllama's choice is the memory64 build wherever the browser has JSPI and
Memory64, and on Firefox; the compatibility build elsewhere (Safari). Every
llama.cpp cell records the build its worker started on as
`runtimeConfig.wllamaBuild` (`memory64` or `compat`). The `wasmLane` and
`wllamaBuild` records, the localmode.ai runner links and series guidance
are in [NOTES.md, Control runs](https://github.com/LocalMode-AI/LocalMode/blob/main/packages/bench/NOTES.md#control-runs).

## Errata

A published cell that turns out not to measure what the protocol describes
is excluded, never re-scored. The dataset's `index/errata.json` lists
`{ runId, cellIds, reason, recordedAt, reference }` entries naming `ok`
cells; `validateErrata(errata, runs)` refuses a malformed list or one that
names a run or cell the dataset does not hold, and `aggregateRuns` /
`aggregateRunsWithErrata` leave the listed cells out of every median and
count them in `excludedByErratum`, per row and in total. Errata change no
measurement rule, so they never bump the protocol version.

## Design notes

[NOTES.md](https://github.com/LocalMode-AI/LocalMode/blob/main/packages/bench/NOTES.md)
holds the detailed reference: the protocol's version history, metric
definitions and validity gates, the per-runtime `runtimeConfig` record
(dtype, thread count, llama.cpp offload and LiteRT load reports), model file
pinning, trace events, the environment capture, the quality-fidelity lane,
the publication rule, the known ONNX Runtime heap limitation and every CSV
column.

## Links

- [SETUP.md](https://github.com/LocalMode-AI/LocalMode/blob/main/packages/bench/SETUP.md):
  deploying the leaderboard (results repository, environment variables,
  index rebuild, errata, importing and collecting runs)
- [LocalMode-Bench dataset](https://github.com/LocalMode-AI/LocalMode-Bench):
  every published run, CC0
- [Leaderboard](https://localmode.ai/bench) and
  [runner](https://localmode.ai/bench/run)
- [CHANGELOG.md](https://github.com/LocalMode-AI/LocalMode/blob/main/packages/bench/CHANGELOG.md)

## License

MIT for the code. Bundled datasets:

- `src/datasets/tiny-mmlu.ts` - MIT (tinyBenchmarks/tinyMMLU, upstream cais/mmlu).
- `src/datasets/stsb/` - the first 100 rows of the STS Benchmark test split,
  all captions from the Microsoft Research Video Description Corpus. The STS
  Benchmark releases its similarity scores under CC BY-SA 4.0 and leaves each
  sentence under its source corpus's terms (Microsoft Research's for these
  pairs). The file is retained for the protocol's quality-fidelity lane while
  the maintainer confirms the redistribution terms; its notice,
  `src/datasets/stsb/LICENSE-CC-BY-SA.md`, ships in the npm package.
