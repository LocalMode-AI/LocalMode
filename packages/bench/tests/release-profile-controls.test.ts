/**
 * The three export-only control kinds of bench 0.9.14: `current-releases`
 * (the runtimes at their current npm releases, recorded as
 * `harness.control.runtimeVersions` and per cell as
 * `runtimeConfig.runtimeVersion`), and the profile kinds `ort-profile` and
 * `llamacpp-profile` (a per-cell `profile` the adapter's profiler builds).
 * The runner runs real mock adapters through the public `runBenchmarkSuite`,
 * so the order, the profiler calls and the attached profiles asserted here
 * are the ones a run produced.
 */
import { describe, expect, it } from 'vitest';
import {
  aggregateRuns,
  cellProfileError,
  CONTROL_CURRENT_RELEASE_PACKAGES,
  CONTROL_KINDS,
  CONTROL_PROFILE_SPECS,
  controlRuntimeOrder,
  controlRuntimeVersionsError,
  createHarnessControl,
  CURRENT_RELEASE_LANE_PACKAGES,
  isControlRun,
  LLAMACPP_PROFILE_BIN_EDGES_MS,
  LLM_WORKLOADS,
  PROFILE_MAX_OPERATOR_ROWS,
  RUN_POLICIES,
  RUNTIME_EXECUTION_ORDER,
  runBenchmarkSuite,
  runtimeVersionCellError,
  summarizeGaps,
  validateRunShape,
  type BenchCellProfile,
  type BenchCellProfiler,
  type BenchCellResult,
  type BenchRunResult,
  type LLMRuntimeAdapter,
  type LlamaCppDeliveryProfile,
  type OrtOperatorProfile,
} from '../src/index.js';
import { makeMockLLMAdapter, makeRun, MODEL_REF } from './helpers.js';

const TEST_POLICY = { ...RUN_POLICIES.quick, cooldownMs: 1, pressureGate: false, measureWarmReload: false };
const ORDER = [...RUNTIME_EXECUTION_ORDER];
const VERSIONS = {
  '@huggingface/transformers': '4.3.1',
  '@mlc-ai/web-llm': '0.2.86',
  '@wllama/wllama': '3.8.1',
  '@wllama/wllama-compat': '3.8.1',
  '@litert-lm/core': '0.18.0',
  'onnxruntime-web': '1.31.0-dev.20260914-8d85527a0',
};

function runWith(cells: BenchCellResult[], control?: BenchRunResult['harness']['control']): BenchRunResult {
  return makeRun({ cells, harness: { name: 'n', version: 'v', ...(control ? { control } : {}) } });
}

/** The fixture's wllama cell with overrides. */
function cell(over: Partial<BenchCellResult> = {}): BenchCellResult {
  return { ...makeRun().cells[0], ...over } as BenchCellResult;
}

function gap(values: number[]) {
  return summarizeGaps(values);
}

function deliveryProfile(iterations = 1): LlamaCppDeliveryProfile {
  return {
    kind: 'llamacpp-delivery',
    binEdgesMs: [...LLAMACPP_PROFILE_BIN_EDGES_MS],
    iterations: Array.from({ length: iterations }, () => ({
      tokens: 3,
      chunks: 3,
      messages: 7,
      workerMs: gap([630, 640, 645]),
      roundTripTransitMs: gap([0.6, 0.8, 0.7]),
      pageTurnaroundMs: gap([0.1, 0.1, 0.2, 0.1, 0.1, 0.1]),
      emitGapMs: gap([640, 650]),
      recvGapMs: gap([641, 649]),
      chunkGapMs: gap([642, 648]),
      receiptToChunkMs: gap([0.1, 0.2, 0.2]),
      clockOffsetMs: -0.42,
    })),
  };
}

function ortProfile(rows = 2): OrtOperatorProfile {
  return {
    kind: 'ort-operators',
    pass: { warmupTokens: 4, maxTokens: 128 },
    runs: 129,
    modelRunMs: 3200.5,
    nodeEvents: rows * 10,
    nodeMs: 3000,
    operators: Array.from({ length: rows }, (_, i) => ({
      opType: i === 0 ? 'MatMulNBits' : `Op${i}`,
      kernel: i === 0 ? 'MatMulNBits' : `Op${i}`,
      provider: 'WebGpuExecutionProvider',
      phase: 'decode' as const,
      timing: 'node' as const,
      totalMs: 3000 / rows,
      count: 10,
    })),
  };
}

describe('the current-releases, ort-profile and llamacpp-profile control kinds', () => {
  it('are listed after the six earlier kinds, each in the protocol order as a fresh array', () => {
    expect(CONTROL_KINDS).toEqual([
      'order-reversed', 'fixed-order', 'wasm-default', 'wasm-q8', 'wasm-threads', 'wllama-compat',
      'current-releases', 'ort-profile', 'llamacpp-profile',
    ]);
    for (const kind of ['current-releases', 'ort-profile', 'llamacpp-profile'] as const) {
      const order = controlRuntimeOrder(kind);
      expect(order).toEqual(ORDER);
      expect(order).not.toBe(RUNTIME_EXECUTION_ORDER);
    }
    expect(CONTROL_PROFILE_SPECS).toEqual({
      'ort-profile': { profileKind: 'ort-operators', lanes: ['transformers-webgpu', 'transformers-wasm'] },
      'llamacpp-profile': { profileKind: 'llamacpp-delivery', lanes: ['wllama', 'wllama-webgpu'] },
    });
    expect(CURRENT_RELEASE_LANE_PACKAGES).toEqual({
      'transformers-webgpu': '@huggingface/transformers',
      'transformers-wasm': '@huggingface/transformers',
      webllm: '@mlc-ai/web-llm',
      wllama: '@wllama/wllama',
      'wllama-webgpu': '@wllama/wllama',
      litert: '@litert-lm/core',
    });
  });

  it('createHarnessControl records current-releases with its versions, and refuses missing, wrong or misplaced versions', () => {
    const control = createHarnessControl('current-releases', { runtimeVersions: VERSIONS });
    expect(control).toEqual({ kind: 'current-releases', runtimeOrder: ORDER, runtimeVersions: VERSIONS });
    expect(control.runtimeVersions).not.toBe(VERSIONS);
    expect(() => createHarnessControl('current-releases')).toThrow(
      'harness.control.runtimeVersions must be an object of package name to version on a current-releases control run',
    );
    const { '@litert-lm/core': _drop, ...noLiteRt } = VERSIONS;
    expect(() => createHarnessControl('current-releases', { runtimeVersions: noLiteRt })).toThrow(
      'harness.control.runtimeVersions must give a version for @litert-lm/core on a current-releases control run',
    );
    expect(() => createHarnessControl('current-releases', { runtimeVersions: { ...VERSIONS, '@mediapipe/tasks-text': '0.10.0' } })).toThrow(
      'harness.control.runtimeVersions lists "@mediapipe/tasks-text"',
    );
    expect(() => createHarnessControl('current-releases', { runtimeVersions: { ...VERSIONS, '@mlc-ai/web-llm': 'latest' } })).toThrow(
      'harness.control.runtimeVersions must give a version for @mlc-ai/web-llm',
    );
    expect(() => createHarnessControl('current-releases', { runtimeVersions: VERSIONS, numThreads: 8 })).toThrow('takes no numThreads');
    for (const kind of ['fixed-order', 'ort-profile', 'llamacpp-profile'] as const) {
      expect(() => createHarnessControl(kind, { runtimeVersions: VERSIONS })).toThrow(
        `harness.control.runtimeVersions is set only on a current-releases control run, not on ${kind}`,
      );
      expect(createHarnessControl(kind)).toEqual({ kind, runtimeOrder: ORDER });
    }
    expect(CONTROL_CURRENT_RELEASE_PACKAGES).toEqual(Object.keys(VERSIONS).filter((k) => k !== 'onnxruntime-web'));
    expect(controlRuntimeVersionsError({ kind: 'current-releases', runtimeVersions: VERSIONS })).toBeUndefined();
    expect(controlRuntimeVersionsError({ kind: 'current-releases', runtimeVersions: [] })).toBe(
      'harness.control.runtimeVersions must be an object of package name to version on a current-releases control run',
    );
  });

  it('validateRunShape accepts a current-releases run whose cells record the versions, and flags every disagreement', () => {
    const control = createHarnessControl('current-releases', { runtimeVersions: VERSIONS });
    const ok = cell({ runtimeVersion: '3.8.1', runtimeConfig: { n_gpu_layers: 0, offloadedLayers: 'unreported', runtimeVersion: '3.8.1' } });
    expect(validateRunShape(runWith([ok], control))).toEqual([]);
    // A cell that never loaded (no runtimeConfig) is not checked.
    expect(validateRunShape(runWith([cell({ status: 'error' })], control))).toEqual([]);
    expect(validateRunShape(runWith([cell({ runtimeConfig: { n_gpu_layers: 0 } })], control))).toEqual([
      'cells[0]: runtimeConfig.runtimeVersion is missing on a wllama cell of a current-releases control run',
    ]);
    expect(validateRunShape(runWith([cell({ runtimeConfig: { runtimeVersion: '3.5.1' } })], control))).toEqual([
      'cells[0]: runtimeConfig.runtimeVersion is "3.5.1" but harness.control.runtimeVersions gives @wllama/wllama "3.8.1"',
    ]);
    expect(validateRunShape(runWith([cell({ runtimeVersion: '3.5.1', runtimeConfig: { runtimeVersion: '3.8.1' } })], control))).toEqual([
      'cells[0]: runtimeVersion is "3.5.1" but harness.control.runtimeVersions gives @wllama/wllama "3.8.1"',
    ]);
    // The field belongs to current-releases, on the lanes it changes.
    expect(validateRunShape(runWith([cell({ runtimeConfig: { runtimeVersion: '3.8.1' } })]))).toEqual([
      'cells[0]: runtimeConfig.runtimeVersion is set only on a current-releases control run',
    ]);
    expect(
      runtimeVersionCellError({ runtimeId: 'mediapipe', runtimeConfig: { runtimeVersion: '0.10.0' } }, control),
    ).toBe(
      'runtimeConfig.runtimeVersion is set only on a lane whose runtime current-releases changes (transformers-webgpu, transformers-wasm, webllm, wllama, wllama-webgpu, litert), not on mediapipe',
    );
    // A marker without its versions is a shape error.
    expect(validateRunShape({ ...makeRun(), harness: { name: 'n', version: 'v', control: { kind: 'current-releases', runtimeOrder: ORDER } } })).toEqual([
      'harness.control.runtimeVersions must be an object of package name to version on a current-releases control run',
    ]);
    expect(isControlRun(runWith([ok], control))).toBe(true);
    expect(aggregateRuns([runWith([ok], control)])).toEqual([]);
  });

  it('the runner refuses a current-releases marker without versions before loading anything', async () => {
    const adapter = makeMockLLMAdapter();
    await expect(
      runBenchmarkSuite({
        suite: 'custom',
        cells: [{ model: MODEL_REF, workload: LLM_WORKLOADS[0] }],
        policy: TEST_POLICY,
        llmAdapters: new Map([[adapter.runtimeId, adapter]]),
        embedAdapters: new Map(),
        harness: { name: 'x', version: 'y', control: { kind: 'current-releases', runtimeOrder: ORDER } },
        skipFingerprint: true,
      }),
    ).rejects.toThrow(
      "harness.control.runtimeVersions must be an object of package name to version on a current-releases control run; use createHarnessControl('current-releases')",
    );
    expect(adapter.loadCalls).toBe(0);
  });

  it('the runner opens and closes each cell on the profiler around its requests only, then disposes the model and attaches what collect returns', async () => {
    const calls: string[] = [];
    let open: string | null = null;
    const requestsPerCell = new Map<string, number>();
    let outsideRequests = 0;
    const base = makeMockLLMAdapter({ chunkCount: 4 });
    const adapter: LLMRuntimeAdapter = {
      ...base,
      async load(model, options) {
        const loaded = await base.load(model, options);
        const inner = loaded.model;
        const counted = {
          modelId: inner.modelId,
          provider: inner.provider,
          doGenerate: inner.doGenerate.bind(inner),
          doStream(o: Parameters<NonNullable<typeof inner.doStream>>[0]) {
            if (open) requestsPerCell.set(open, (requestsPerCell.get(open) ?? 0) + 1);
            else outsideRequests++;
            return inner.doStream!(o);
          },
        };
        const profiler: BenchCellProfiler = {
          beginCell({ cellId, workloadKind }) {
            calls.push(`begin ${cellId} ${workloadKind}`);
            open = cellId;
          },
          endCell(cellId) {
            calls.push(`end ${cellId}`);
            open = null;
          },
          async collect() {
            calls.push('collect');
            const out: Record<string, BenchCellProfile> = {};
            for (const [cellId, n] of requestsPerCell) out[cellId] = deliveryProfile(n);
            return { profiles: out };
          },
        };
        return { ...loaded, model: counted, profiler, dispose: async () => { calls.push('dispose'); await loaded.dispose(); } };
      },
    };
    const result = await runBenchmarkSuite({
      suite: 'custom',
      cells: LLM_WORKLOADS.slice(0, 2).map((workload) => ({ model: MODEL_REF, workload })),
      policy: TEST_POLICY,
      llmAdapters: new Map([[adapter.runtimeId, adapter]]),
      embedAdapters: new Map(),
      harness: { name: 'x', version: 'y', control: createHarnessControl('llamacpp-profile') },
      skipFingerprint: true,
    });
    const [a, b] = result.cells.map((c) => c.cellId);
    expect(calls).toEqual([`begin ${a} llm-generate`, `end ${a}`, `begin ${b} llm-generate`, `end ${b}`, 'dispose', 'collect']);
    // The warmup ran outside every cell; each cell saw exactly its timed requests.
    expect(outsideRequests).toBe(TEST_POLICY.warmupRuns);
    expect(result.cells.map((c) => c.iterations.length)).toEqual([TEST_POLICY.timedRuns, TEST_POLICY.timedRuns]);
    expect(result.cells.map((c) => (c.profile as LlamaCppDeliveryProfile).iterations.length)).toEqual([TEST_POLICY.timedRuns, TEST_POLICY.timedRuns]);
    expect(result.cells.every((c) => c.status === 'ok')).toBe(true);
    expect(validateRunShape(result)).toEqual([]);
    expect(isControlRun(result)).toBe(true);
  });

  it('a profiler whose collect fails leaves the cells unprofiled and valid, and records a profile-error trace event', async () => {
    const base = makeMockLLMAdapter({ chunkCount: 3 });
    const adapter: LLMRuntimeAdapter = {
      ...base,
      async load(model, options) {
        const loaded = await base.load(model, options);
        return {
          ...loaded,
          profiler: { beginCell() {}, endCell() {}, collect: async () => { throw new Error('ORT wrote no profile'); } },
        };
      },
    };
    const result = await runBenchmarkSuite({
      suite: 'custom',
      cells: [{ model: MODEL_REF, workload: LLM_WORKLOADS[0] }],
      policy: TEST_POLICY,
      llmAdapters: new Map([[adapter.runtimeId, adapter]]),
      embedAdapters: new Map(),
      harness: { name: 'x', version: 'y', control: createHarnessControl('llamacpp-profile') },
      skipFingerprint: true,
    });
    expect(result.cells[0].status).toBe('ok');
    expect(result.cells[0].profile).toBeUndefined();
    expect(result.events.filter((e) => e.type === 'profile-error').map((e) => e.detail)).toEqual([
      `${result.cells[0].cellId}: ORT wrote no profile`,
    ]);
    expect(validateRunShape(result)).toEqual([]);
  });

  it('a cell the profiler reports as failed gets no profile and a profile-error trace event, the others keep theirs', async () => {
    const base = makeMockLLMAdapter({ chunkCount: 3 });
    const adapter: LLMRuntimeAdapter = {
      ...base,
      async load(model, options) {
        const loaded = await base.load(model, options);
        const seen: string[] = [];
        return {
          ...loaded,
          profiler: {
            beginCell({ cellId }) {
              seen.push(cellId);
            },
            endCell() {},
            collect: async () => ({
              profiles: { [seen[0]]: deliveryProfile(3) },
              errors: { [seen[1]]: 'the profiling pass ran out of memory' },
            }),
          },
        };
      },
    };
    const result = await runBenchmarkSuite({
      suite: 'custom',
      cells: LLM_WORKLOADS.slice(0, 2).map((workload) => ({ model: MODEL_REF, workload })),
      policy: TEST_POLICY,
      llmAdapters: new Map([[adapter.runtimeId, adapter]]),
      embedAdapters: new Map(),
      harness: { name: 'x', version: 'y', control: createHarnessControl('llamacpp-profile') },
      skipFingerprint: true,
    });
    expect(result.cells[0].profile?.kind).toBe('llamacpp-delivery');
    expect(result.cells[1].profile).toBeUndefined();
    expect(result.events.filter((e) => e.type === 'profile-error').map((e) => e.detail)).toEqual([
      `${result.cells[1].cellId}: the profiling pass ran out of memory`,
    ]);
    expect(validateRunShape(result)).toEqual([]);
  });

  it('cellProfileError accepts each profile kind on its own kind and lanes only, in its bounded shape', () => {
    const llamacpp = { kind: 'llamacpp-profile' };
    const ort = { kind: 'ort-profile' };
    expect(cellProfileError({ runtimeId: 'wllama', profile: deliveryProfile() }, llamacpp)).toBeUndefined();
    expect(cellProfileError({ runtimeId: 'wllama-webgpu', profile: deliveryProfile(3) }, llamacpp)).toBeUndefined();
    expect(cellProfileError({ runtimeId: 'transformers-wasm', profile: ortProfile() }, ort)).toBeUndefined();
    expect(cellProfileError({ runtimeId: 'transformers-webgpu', profile: { ...ortProfile(PROFILE_MAX_OPERATOR_ROWS + 4), foldedRows: 12, gpuMs: 40 } }, ort)).toBeUndefined();
    expect(cellProfileError({ runtimeId: 'transformers-webgpu' }, null)).toBeUndefined();

    expect(cellProfileError({ runtimeId: 'wllama', profile: deliveryProfile() }, null)).toBe(
      'profile is set only on a ort-profile or llamacpp-profile control run',
    );
    expect(cellProfileError({ runtimeId: 'wllama', profile: deliveryProfile() }, { kind: 'current-releases' })).toBe(
      'profile is set only on a ort-profile or llamacpp-profile control run',
    );
    expect(cellProfileError({ runtimeId: 'webllm', profile: ortProfile() }, ort)).toBe(
      'profile is set only on a transformers-webgpu or transformers-wasm cell of an ort-profile control run, not on webllm',
    );
    expect(cellProfileError({ runtimeId: 'wllama', profile: ortProfile() }, llamacpp)).toBe(
      'profile.kind must be "llamacpp-delivery" on an llamacpp-profile control run',
    );
    expect(cellProfileError({ runtimeId: 'transformers-wasm', profile: ortProfile(PROFILE_MAX_OPERATOR_ROWS + 5) }, ort)).toBe(
      `profile.operators must be an array of at most ${PROFILE_MAX_OPERATOR_ROWS + 4} rows`,
    );
    const badRow = ortProfile();
    badRow.operators[1] = { ...badRow.operators[1], count: 0 };
    expect(cellProfileError({ runtimeId: 'transformers-wasm', profile: badRow }, ort)).toBe(
      'profile.operators[1] must be { phase: "prefill" | "decode", timing: "node" | "gpu", opType, kernel, provider, totalMs, count }',
    );
    expect(cellProfileError({ runtimeId: 'transformers-wasm', profile: { ...ortProfile(), pass: { warmupTokens: 4, maxTokens: 32, failedMaxTokens: [128, 64] } } }, ort)).toBeUndefined();
    expect(cellProfileError({ runtimeId: 'transformers-wasm', profile: { ...ortProfile(), pass: { warmupTokens: 4, maxTokens: 32, failedMaxTokens: [16] } } }, ort)).toBe(
      'profile.pass.failedMaxTokens must list 1 to 8 token budgets, each above pass.maxTokens',
    );
    expect(cellProfileError({ runtimeId: 'transformers-wasm', profile: { ...ortProfile(), pass: { warmupTokens: 4, maxTokens: 0 } } }, ort)).toBe(
      'profile.pass must be { warmupTokens, maxTokens } (integers, maxTokens at least 1)',
    );
    const badHistogram = deliveryProfile();
    badHistogram.iterations[0].roundTripTransitMs = { ...badHistogram.iterations[0].roundTripTransitMs, n: 4 };
    expect(cellProfileError({ runtimeId: 'wllama', profile: badHistogram }, llamacpp)).toBe(
      'profile.iterations[0].roundTripTransitMs.histogram counts must sum to n',
    );
    const badOffset = deliveryProfile();
    badOffset.iterations[0].clockOffsetMs = Number.NaN;
    expect(cellProfileError({ runtimeId: 'wllama', profile: badOffset }, llamacpp)).toBe(
      'profile.iterations[0].clockOffsetMs must be a number of at most 60000 ms either way when present',
    );
    expect(cellProfileError({ runtimeId: 'wllama', profile: { ...deliveryProfile(), binEdgesMs: [0, 10] } }, llamacpp)).toBe(
      `profile.binEdgesMs must be [${LLAMACPP_PROFILE_BIN_EDGES_MS.join(', ')}]`,
    );
    expect(cellProfileError({ runtimeId: 'wllama', profile: deliveryProfile(65) }, llamacpp)).toBe(
      'profile.iterations must be an array of at most 64 entries',
    );
    // Through the run validator, with the cell's index.
    expect(validateRunShape(runWith([cell({ profile: deliveryProfile() })]))).toEqual([
      'cells[0]: profile is set only on a ort-profile or llamacpp-profile control run',
    ]);
    expect(validateRunShape(runWith([cell({ profile: deliveryProfile() })], createHarnessControl('llamacpp-profile')))).toEqual([]);
  });

  it('summarizeGaps gives nearest-rank percentiles, the mean and a histogram over the fixed edges', () => {
    const s = summarizeGaps([647, 0.5, 3, 647, 2100, 12]);
    expect(s).toEqual({
      n: 6,
      p50: 12,
      p90: 2100,
      p99: 2100,
      max: 2100,
      mean: Math.round(((647 + 0.5 + 3 + 647 + 2100 + 12) / 6) * 1000) / 1000,
      // bins: [0,1) [1,2) [2,5) [5,10) [10,20) [20,50) [50,100) [100,200) [200,500) [500,1000) [1000,2000) [2000,)
      histogram: [1, 0, 1, 0, 1, 0, 0, 0, 0, 2, 0, 1],
    });
    expect(summarizeGaps([])).toEqual({ n: 0, p50: 0, p90: 0, p99: 0, max: 0, mean: 0, histogram: LLAMACPP_PROFILE_BIN_EDGES_MS.map(() => 0) });
    expect(summarizeGaps([-3, Number.NaN, 4]).n).toBe(2);
  });
});
