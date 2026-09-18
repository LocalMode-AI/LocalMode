# @localmode/bench

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
  export for paper analysis (`scripts/analyze.ts`).
- Quality-fidelity lane: tinyMMLU-100 (MIT) accuracy + STS-B-100 (CC BY-SA,
  isolated directory) Spearman, temperature 0.
