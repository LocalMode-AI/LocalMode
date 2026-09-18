# @localmode/bench

Cross-runtime benchmark harness for in-browser AI. Measures LLM and embedding
inference across browser ML runtimes - Transformers.js (WebGPU + WASM), WebLLM,
wllama, LiteRT, Chrome Built-in AI, MediaPipe - with MLPerf-Client-compatible
metric definitions, raw per-chunk traces for auditability, versioned integrity
rules for community submissions, and leaderboard aggregation.

The public runner + leaderboard live at **https://localmode.ai/bench**.
The protocol is documented at **https://localmode.ai/bench/methodology**.

## Protocol (`localmode-bench/1`)

- **TTFT** - first non-empty stream chunk minus stream start (`performance.now()`
  wall clock on a cross-origin-isolated page).
- **Decode rate (tg128)** - `(chars after first chunk) / (last − first chunk time)`;
  first token excluded (MLPerf Client TPS definition); endpoints-based, never
  averaged per-token deltas. Reported as chars/sec (tokenizer-independent);
  exact tok/s is computed post-hoc from the stored generated text.
- **Prefill (pp128 / pp512)** - approx prompt tokens / TTFT, on fixed public prompts.
- **Load** - cold (cache-miss) vs warm (cache-hit) reported separately; the
  provider cache is probed before load.
- **Run policy** - 1 untimed warmup, 3–5 timed runs, cool-down between cells,
  Compute-Pressure gate on Chromium, wake lock held, visibility-gated validity.
- **Statistics** - median headline; mean ± SD, IQR, 95% CI (Student-t), CV;
  CV > 5% ⇒ high-variance flag; geomean only within a device run.
- **Quality-fidelity lane** - tinyMMLU (MIT) accuracy + STS-B (CC BY-SA) Spearman,
  temperature 0; measures runtime/quantization fidelity, not model capability.

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
  harness: { name: '@localmode/bench', version: '0.1.0' },
  abortSignal: controller.signal,
});
result.digest = await computeRunDigest(result);
```

Server-side, validate any submission with `validateSubmission(run)` - it
recomputes every statistic from the raw trace and applies the versioned
plausibility rules (monotonicity, decode-rate envelopes, timer-grid
conformance, cross-field environment consistency, calibration-check sanity).

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
identity columns - feed it directly to R/pandas.

## Dataset licenses

- `src/datasets/tiny-mmlu.ts` - MIT (tinyBenchmarks/tinyMMLU, upstream cais/mmlu).
- `src/datasets/stsb/` - CC BY-SA 4.0, isolated with its own license file.
