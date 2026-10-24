/**
 * The llama.cpp build record: the `wllama-compat` control kind (the protocol
 * order, with both llama.cpp lanes loaded through wllama's compatibility
 * build, recorded as `harness.control.wllamaBuild: 'compat'`) and the
 * per-cell `runtimeConfig.wllamaBuild` (`compat` or `memory64`) every
 * llama.cpp cell carries once wllama has started its worker. The runner runs
 * real mock adapters through the public `runBenchmarkSuite`, so the asserted
 * order and record are the ones the run produced.
 */
import { describe, expect, it } from 'vitest';
import {
  aggregateRuns,
  computeRunDigest,
  CONTROL_KINDS,
  CONTROL_WLLAMA_BUILDS,
  controlRuntimeOrder,
  controlWllamaBuildError,
  createHarnessControl,
  isControlRun,
  LLM_WORKLOADS,
  RUN_POLICIES,
  RUNTIME_EXECUTION_ORDER,
  runBenchmarkSuite,
  runsToRunsCSV,
  validateRunShape,
  validateSubmission,
  verifyRunDigest,
  WLLAMA_BUILDS,
  wllamaBuildError,
  type BenchCellResult,
  type BenchModelRef,
  type BenchRunResult,
} from '../src/index.js';
import { makeMockLLMAdapter, makeRun, MODEL_REF } from './helpers.js';

const TEST_POLICY = { ...RUN_POLICIES.quick, cooldownMs: 1, pressureGate: false, measureWarmReload: false };
const ORDER = [...RUNTIME_EXECUTION_ORDER];
const COMPAT_SHAPE = "harness.control.wllamaBuild must be 'compat' on a wllama-compat control run";

/** The fixture's single llama.cpp cell with a given runtimeConfig. */
function cellWith(runtimeConfig: Record<string, string | number | boolean> | undefined, over: Partial<BenchCellResult> = {}) {
  const base = makeRun().cells[0];
  return { ...base, ...(runtimeConfig ? { runtimeConfig } : {}), ...over } as BenchCellResult;
}

function runWith(cells: BenchCellResult[], control?: BenchRunResult['harness']['control']): BenchRunResult {
  return makeRun({ cells, harness: { name: 'n', version: 'v', ...(control ? { control } : {}) } });
}

describe('the wllama-compat control kind', () => {
  it('is listed after the five earlier kinds (before the 0.9.14 kinds) and keeps the protocol order as a fresh array', () => {
    expect(CONTROL_KINDS).toEqual(['order-reversed', 'fixed-order', 'wasm-default', 'wasm-q8', 'wasm-threads', 'wllama-compat', 'current-releases', 'ort-profile', 'llamacpp-profile']);
    const order = controlRuntimeOrder('wllama-compat');
    expect(order).toEqual(ORDER);
    expect(order).not.toBe(RUNTIME_EXECUTION_ORDER);
    expect(CONTROL_WLLAMA_BUILDS).toEqual({ 'wllama-compat': 'compat' });
    expect(WLLAMA_BUILDS).toEqual(['compat', 'memory64']);
  });

  it('createHarnessControl records the kind, the protocol order and wllamaBuild: compat, in that key order', () => {
    const control = createHarnessControl('wllama-compat');
    expect(control).toEqual({ kind: 'wllama-compat', runtimeOrder: ORDER, wllamaBuild: 'compat' });
    expect(JSON.stringify(control)).toBe(`{"kind":"wllama-compat","runtimeOrder":${JSON.stringify(ORDER)},"wllamaBuild":"compat"}`);
    // It changes no Transformers.js WASM setting, so it takes no thread count.
    expect(() => createHarnessControl('wllama-compat', { numThreads: 8 })).toThrow(
      "createHarnessControl('wllama-compat') takes no numThreads; only wasm-default and wasm-threads set the WASM lane's threads",
    );
    // The other kinds carry no wllamaBuild key at all.
    for (const kind of ['order-reversed', 'fixed-order', 'wasm-q8'] as const) {
      expect('wllamaBuild' in createHarnessControl(kind)).toBe(false);
    }
    expect('wllamaBuild' in createHarnessControl('wasm-default', { numThreads: 4 })).toBe(false);
  });

  it('controlWllamaBuildError accepts exactly compat on wllama-compat and nothing on the other kinds', () => {
    expect(controlWllamaBuildError({ kind: 'wllama-compat', wllamaBuild: 'compat' })).toBeUndefined();
    expect(controlWllamaBuildError({ kind: 'wllama-compat' })).toBe(COMPAT_SHAPE);
    expect(controlWllamaBuildError({ kind: 'wllama-compat', wllamaBuild: 'memory64' })).toBe(COMPAT_SHAPE);
    expect(controlWllamaBuildError({ kind: 'wllama-compat', wllamaBuild: 'COMPAT' })).toBe(COMPAT_SHAPE);
    expect(controlWllamaBuildError({ kind: 'fixed-order' })).toBeUndefined();
    expect(controlWllamaBuildError({ kind: 'fixed-order', wllamaBuild: 'compat' })).toBe(
      'harness.control.wllamaBuild is set only on a wllama-compat control run, not on fixed-order',
    );
    expect(controlWllamaBuildError({ kind: 'wasm-default', wllamaBuild: 'compat' })).toBe(
      'harness.control.wllamaBuild is set only on a wllama-compat control run, not on wasm-default',
    );
  });

  it('validateRunShape accepts the marker and rejects a missing, wrong or misplaced wllamaBuild', () => {
    expect(validateRunShape(runWith(makeRun().cells, createHarnessControl('wllama-compat')))).toEqual([]);
    const withControl = (control: unknown) => validateRunShape({ ...makeRun(), harness: { name: 'n', version: 'v', control } });
    expect(withControl(JSON.parse(JSON.stringify(createHarnessControl('wllama-compat'))))).toEqual([]);
    expect(withControl({ kind: 'wllama-compat', runtimeOrder: ORDER })).toEqual([COMPAT_SHAPE]);
    expect(withControl({ kind: 'wllama-compat', runtimeOrder: ORDER, wllamaBuild: 'memory64' })).toEqual([COMPAT_SHAPE]);
    expect(withControl({ kind: 'fixed-order', runtimeOrder: ORDER, wllamaBuild: 'compat' })).toEqual([
      'harness.control.wllamaBuild is set only on a wllama-compat control run, not on fixed-order',
    ]);
    expect(withControl({ kind: 'wllama-compat', runtimeOrder: controlRuntimeOrder('order-reversed'), wllamaBuild: 'compat' })).toEqual([
      'harness.control.runtimeOrder must be the wllama-compat order [transformers-wasm, transformers-webgpu, chrome-ai, webllm, mediapipe, litert, wllama-webgpu, wllama]',
    ]);
    // An unknown kind lists all nine.
    expect(withControl({ kind: 'firefox-compat', runtimeOrder: ORDER })).toEqual([
      'harness.control.kind must be one of order-reversed, fixed-order, wasm-default, wasm-q8, wasm-threads, wllama-compat, current-releases, ort-profile, llamacpp-profile',
    ]);
  });

  it('the runner refuses a wrong wllamaBuild marker before loading anything', async () => {
    const adapter = makeMockLLMAdapter();
    const attempt = (control: unknown) =>
      runBenchmarkSuite({
        suite: 'custom',
        cells: [{ model: MODEL_REF, workload: LLM_WORKLOADS[0] }],
        policy: TEST_POLICY,
        llmAdapters: new Map([[adapter.runtimeId, adapter]]),
        embedAdapters: new Map(),
        harness: { name: 'x', version: 'y', control: control as never },
        skipFingerprint: true,
      });
    await expect(attempt({ kind: 'wllama-compat', runtimeOrder: ORDER })).rejects.toThrow(
      `${COMPAT_SHAPE}; use createHarnessControl('wllama-compat')`,
    );
    await expect(attempt({ kind: 'fixed-order', runtimeOrder: ORDER, wllamaBuild: 'compat' })).rejects.toThrow(
      "harness.control.wllamaBuild is set only on a wllama-compat control run, not on fixed-order; use createHarnessControl('fixed-order')",
    );
    expect(adapter.loadCalls).toBe(0);
  });

  it('runs in the protocol order with the record the adapter reported; the run validates, digests, and stays out of the leaderboard', async () => {
    const wllamaRef = (runtimeId: 'wllama' | 'wllama-webgpu'): BenchModelRef => ({ ...MODEL_REF, runtimeId, providerModelId: `${runtimeId}/m` });
    const lane = (runtimeId: 'wllama' | 'wllama-webgpu') => {
      const base = makeMockLLMAdapter({ chunkCount: 4, chunkDelayMs: 1 });
      return {
        ...base,
        runtimeId,
        async load(...args: Parameters<typeof base.load>) {
          const loaded = await base.load(...args);
          return { ...loaded, resolvedBackend: 'wasm', runtimeConfig: { n_gpu_layers: 0, offloadedLayers: 'unreported', wllamaBuild: 'compat' } };
        },
      };
    };
    const started: string[] = [];
    const control = createHarnessControl('wllama-compat');
    const result = await runBenchmarkSuite({
      suite: 'custom',
      cells: [
        { model: wllamaRef('wllama'), workload: LLM_WORKLOADS[0] },
        { model: wllamaRef('wllama-webgpu'), workload: LLM_WORKLOADS[0] },
      ],
      policy: TEST_POLICY,
      llmAdapters: new Map<string, ReturnType<typeof lane>>([
        ['wllama', lane('wllama')],
        ['wllama-webgpu', lane('wllama-webgpu')],
      ]) as never,
      embedAdapters: new Map(),
      harness: { name: '@localmode/bench', version: 'test', control },
      skipFingerprint: true,
      hooks: { onCellStart: (cellId) => started.push(cellId) },
    });
    // The protocol order runs the WebGPU llama.cpp lane before the CPU one.
    expect(started).toEqual(['wllama-webgpu/test-model/chat-pp128-tg128', 'wllama/test-model/chat-pp128-tg128']);
    expect(result.cells.map((c) => [c.status, c.runtimeConfig?.wllamaBuild])).toEqual([
      ['ok', 'compat'],
      ['ok', 'compat'],
    ]);
    expect(result.harness.control).toEqual(control);
    expect(isControlRun(result)).toBe(true);
    expect(validateRunShape(result)).toEqual([]);
    expect(validateSubmission(result).shapeErrors).toEqual([]);
    result.digest = await computeRunDigest(result);
    expect(await verifyRunDigest(result)).toBe(true);
    expect(aggregateRuns([result], 1)).toEqual([]);
    const csv = runsToRunsCSV([result]).trimEnd().split('\n');
    expect(csv[1].endsWith(`,wllama-compat,${ORDER.join('>')}`)).toBe(true);
  });
});

describe('runtimeConfig.wllamaBuild on llama.cpp cells', () => {
  it('accepts compat and memory64 on either llama.cpp lane, and no record at all', () => {
    expect(wllamaBuildError(cellWith({ wllamaBuild: 'memory64' }))).toBeUndefined();
    expect(wllamaBuildError(cellWith({ wllamaBuild: 'compat' }))).toBeUndefined();
    expect(wllamaBuildError(cellWith({ wllamaBuild: 'compat' }, { runtimeId: 'wllama-webgpu', resolvedBackend: 'webgpu' }))).toBeUndefined();
    // Every run before the record (and a cell whose engine never started) carries none.
    expect(wllamaBuildError(cellWith({ n_gpu_layers: 0 }))).toBeUndefined();
    expect(wllamaBuildError(cellWith(undefined))).toBeUndefined();
  });

  it('rejects any other value, and the field on a cell that is not llama.cpp', () => {
    for (const bad of ['wasm32', 'Compat', '', 'memory-64', 1, true]) {
      expect(wllamaBuildError(cellWith({ wllamaBuild: bad as never }))).toBe(
        `runtimeConfig.wllamaBuild must be "compat" or "memory64", got ${JSON.stringify(bad)}`,
      );
    }
    expect(wllamaBuildError(cellWith({ wllamaBuild: 'compat' }, { runtimeId: 'webllm' }))).toBe(
      'runtimeConfig.wllamaBuild is set only on a llama.cpp cell (wllama, wllama-webgpu), not on webllm',
    );
  });

  it('on a wllama-compat run, a llama.cpp cell must record compat once its engine loaded', () => {
    const compat = { kind: 'wllama-compat', wllamaBuild: 'compat' };
    expect(wllamaBuildError(cellWith({ wllamaBuild: 'compat' }), compat)).toBeUndefined();
    expect(wllamaBuildError(cellWith({ wllamaBuild: 'memory64' }), compat)).toBe(
      'runtimeConfig.wllamaBuild is "memory64" on a wllama-compat control run, which loads every llama.cpp lane through the compatibility build',
    );
    // A cell whose engine loaded (resolvedBackend wasm or webgpu) carries the record on this kind
    // whenever its adapter reports a runtimeConfig; an adapter that reports none is not checked.
    expect(wllamaBuildError(cellWith({ n_gpu_layers: 0 }), compat)).toBe(
      'runtimeConfig.wllamaBuild is missing on a llama.cpp cell of a wllama-compat control run',
    );
    expect(wllamaBuildError(cellWith(undefined), compat)).toBeUndefined();
    // Before the engine loaded there is nothing to record (an error or skipped cell).
    expect(wllamaBuildError(cellWith(undefined, { status: 'error', resolvedBackend: undefined }), compat)).toBeUndefined();
    expect(wllamaBuildError(cellWith({ n_gpu_layers: 0 }, { resolvedBackend: 'unknown' }), compat)).toBeUndefined();
    // A non-llama.cpp cell is not concerned.
    expect(wllamaBuildError(cellWith({ device: 'wasm' }, { runtimeId: 'transformers-wasm' }), compat)).toBeUndefined();
    // Any other kind records whatever build ran.
    expect(wllamaBuildError(cellWith({ wllamaBuild: 'memory64' }), { kind: 'fixed-order' })).toBeUndefined();
  });

  it('validateRunShape runs the check on every cell, with the run marker', () => {
    expect(validateRunShape(runWith([cellWith({ wllamaBuild: 'memory64' })]))).toEqual([]);
    expect(validateRunShape(runWith([cellWith({ wllamaBuild: 'wasm64' })]))).toEqual([
      'cells[0]: runtimeConfig.wllamaBuild must be "compat" or "memory64", got "wasm64"',
    ]);
    expect(validateRunShape(runWith([cellWith({ wllamaBuild: 'memory64' })], createHarnessControl('wllama-compat')))).toEqual([
      'cells[0]: runtimeConfig.wllamaBuild is "memory64" on a wllama-compat control run, which loads every llama.cpp lane through the compatibility build',
    ]);
    expect(validateRunShape(runWith([cellWith({ wllamaBuild: 'compat' })], createHarnessControl('wllama-compat')))).toEqual([]);
  });
});
