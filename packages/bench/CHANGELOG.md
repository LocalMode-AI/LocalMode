# @localmode/bench

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
  export for paper analysis (`scripts/analyze.ts`).
- Quality-fidelity lane: tinyMMLU-100 (MIT) accuracy + STS-B-100 (CC BY-SA,
  isolated directory) Spearman, temperature 0.
