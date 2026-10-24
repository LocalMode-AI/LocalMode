/**
 * Control runs (`harness.control`, kinds `order-reversed`, `fixed-order`,
 * `wasm-default`, `wasm-q8`, `wasm-threads` and `wllama-compat`): a control experiment for the
 * methodology that runs the same suite with the runtime execution order
 * reversed, in the protocol order as a same-build reference series, or in the
 * protocol order with the Transformers.js WASM lane at the runtime's defaults
 * or with one of those two changes (`wasmLane`). The runner executes real mock adapters through
 * the public `runBenchmarkSuite`, so the asserted order is the order the
 * cells actually ran in (observed through the `onCellStart` hook and the
 * result's cell order), not a re-derivation of it.
 */
import { describe, expect, it } from 'vitest';
import {
  aggregateRuns,
  computeRunDigest,
  CONTROL_KINDS,
  CONTROL_WASM_DTYPE,
  CONTROL_WASM_LANE_SPECS,
  CONTROL_WASM_MAX_THREADS,
  controlRuntimeOrder,
  controlWasmLaneError,
  createHarnessControl,
  EMBED_WORKLOADS,
  isControlRun,
  LLM_WORKLOADS,
  orderCells,
  RUN_POLICIES,
  RUNTIME_EXECUTION_ORDER,
  runBenchmarkSuite,
  runsToRunsCSV,
  validateRunShape,
  validateSubmission,
  verifyRunDigest,
  type BenchModelRef,
  type BenchRunResult,
  type BenchRuntimeId,
  type PlannedCell,
} from '../src/index.js';
import { makeMockEmbedAdapter, makeMockLLMAdapter, makeRun, MODEL_REF } from './helpers.js';

const TEST_POLICY = { ...RUN_POLICIES.quick, cooldownMs: 1, pressureGate: false, measureWarmReload: false };

const llm = (runtimeId: BenchRuntimeId, benchModelId = 'm1'): BenchModelRef => ({
  ...MODEL_REF,
  runtimeId,
  benchModelId,
  providerModelId: `${runtimeId}/${benchModelId}`,
});

/** A suite over five runtimes in catalog order, two models on one runtime to witness within-runtime stability. */
function plannedSuite(): PlannedCell[] {
  const embed: BenchModelRef = { ...llm('transformers-wasm', 'embed'), task: 'embedding' };
  return [
    { model: llm('wllama', 'm1'), workload: LLM_WORKLOADS[0] },
    { model: embed, workload: EMBED_WORKLOADS[0] },
    { model: llm('webllm', 'm1'), workload: LLM_WORKLOADS[0] },
    { model: llm('wllama', 'm2'), workload: LLM_WORKLOADS[0] },
    { model: llm('transformers-webgpu', 'm1'), workload: LLM_WORKLOADS[0] },
    { model: llm('wllama-webgpu', 'm1'), workload: LLM_WORKLOADS[0] },
  ];
}

async function runSuite(harness: BenchRunResult['harness']) {
  const adapter = makeMockLLMAdapter({ chunkCount: 4, chunkDelayMs: 1 });
  const started: string[] = [];
  const result = await runBenchmarkSuite({
    suite: 'custom',
    cells: plannedSuite(),
    policy: TEST_POLICY,
    llmAdapters: new Map<string, typeof adapter>([
      ['wllama', adapter],
      ['webllm', adapter],
      ['transformers-webgpu', adapter],
      ['wllama-webgpu', adapter],
    ]),
    embedAdapters: new Map([['transformers-wasm', makeMockEmbedAdapter()]]),
    harness,
    skipFingerprint: true,
    hooks: { onCellStart: (cellId) => started.push(cellId) },
  });
  return { result, started };
}

describe('controlRuntimeOrder()', () => {
  it('order-reversed is exactly the reverse of RUNTIME_EXECUTION_ORDER, every runtime once', () => {
    const reversed = controlRuntimeOrder('order-reversed');
    expect(reversed).toEqual([
      'wllama',
      'wllama-webgpu',
      'litert',
      'mediapipe',
      'webllm',
      'chrome-ai',
      'transformers-webgpu',
      'transformers-wasm',
    ]);
    expect(reversed).toEqual([...RUNTIME_EXECUTION_ORDER].reverse());
    expect(new Set(reversed).size).toBe(RUNTIME_EXECUTION_ORDER.length);
    expect([...reversed].sort()).toEqual([...RUNTIME_EXECUTION_ORDER].sort());
    // A fresh array each call; the protocol order is untouched.
    reversed.pop();
    expect(controlRuntimeOrder('order-reversed')).toHaveLength(8);
    expect(RUNTIME_EXECUTION_ORDER[0]).toBe('transformers-wasm');
    expect(CONTROL_KINDS).toEqual(['order-reversed', 'fixed-order', 'wasm-default', 'wasm-q8', 'wasm-threads', 'wllama-compat', 'current-releases', 'ort-profile', 'llamacpp-profile']);
  });

  it('fixed-order is exactly RUNTIME_EXECUTION_ORDER, every runtime once, as a fresh array', () => {
    const fixed = controlRuntimeOrder('fixed-order');
    expect(fixed).toEqual([
      'transformers-wasm',
      'transformers-webgpu',
      'chrome-ai',
      'webllm',
      'mediapipe',
      'litert',
      'wllama-webgpu',
      'wllama',
    ]);
    expect(fixed).toEqual([...RUNTIME_EXECUTION_ORDER]);
    expect(fixed).not.toBe(RUNTIME_EXECUTION_ORDER);
    fixed.reverse();
    expect(controlRuntimeOrder('fixed-order')[0]).toBe('transformers-wasm');
    expect(RUNTIME_EXECUTION_ORDER[0]).toBe('transformers-wasm');
    expect(createHarnessControl('fixed-order')).toEqual({ kind: 'fixed-order', runtimeOrder: [...RUNTIME_EXECUTION_ORDER] });
  });

  it('orderCells with the reversed order keeps every cell exactly once and catalog order within a runtime', () => {
    const cells = plannedSuite();
    const ordered = orderCells(cells, controlRuntimeOrder('order-reversed'));
    expect(ordered).toHaveLength(cells.length);
    expect(new Set(ordered)).toEqual(new Set(cells));
    expect(ordered.map((c) => `${c.model.runtimeId}/${c.model.benchModelId}`)).toEqual([
      'wllama/m1',
      'wllama/m2',
      'wllama-webgpu/m1',
      'webllm/m1',
      'transformers-webgpu/m1',
      'transformers-wasm/embed',
    ]);
    // The protocol order is the default and is the runtime-level mirror image.
    expect(orderCells(cells).map((c) => c.model.runtimeId)).toEqual([
      'transformers-wasm',
      'transformers-webgpu',
      'webllm',
      'wllama-webgpu',
      'wllama',
      'wllama',
    ]);
  });
});

describe('runBenchmarkSuite() with harness.control', () => {
  it('executes the cells in the reversed runtime order and records the order it used', async () => {
    const control = createHarnessControl('order-reversed');
    const { result, started } = await runSuite({ name: '@localmode/bench', version: 'test', control });
    const expected = [
      'wllama/m1/chat-pp128-tg128',
      'wllama/m2/chat-pp128-tg128',
      'wllama-webgpu/m1/chat-pp128-tg128',
      'webllm/m1/chat-pp128-tg128',
      'transformers-webgpu/m1/chat-pp128-tg128',
      'transformers-wasm/embed/embed-single',
    ];
    expect(started).toEqual(expected);
    expect(result.cells.map((c) => c.cellId)).toEqual(expected);
    expect(result.cells.every((c) => c.status === 'ok')).toBe(true);
    expect(result.harness.control).toEqual({ kind: 'order-reversed', runtimeOrder: [...RUNTIME_EXECUTION_ORDER].reverse() });
    expect(isControlRun(result)).toBe(true);
    // The record passes the offline validator and digests like any run.
    expect(validateRunShape(result)).toEqual([]);
    expect(validateSubmission(result).shapeErrors).toEqual([]);
    result.digest = await computeRunDigest(result);
    expect(await verifyRunDigest(result)).toBe(true);
  });

  it('fixed-order executes the cells in the protocol order and records the fixed-order marker', async () => {
    const [fixed, protocol] = await Promise.all([
      runSuite({ name: '@localmode/bench', version: 'test', control: createHarnessControl('fixed-order') }),
      runSuite({ name: '@localmode/bench', version: 'test' }),
    ]);
    const expected = [
      'transformers-wasm/embed/embed-single',
      'transformers-webgpu/m1/chat-pp128-tg128',
      'webllm/m1/chat-pp128-tg128',
      'wllama-webgpu/m1/chat-pp128-tg128',
      'wllama/m1/chat-pp128-tg128',
      'wllama/m2/chat-pp128-tg128',
    ];
    expect(fixed.started).toEqual(expected);
    expect(fixed.result.cells.map((c) => c.cellId)).toEqual(expected);
    expect(protocol.started).toEqual(expected);
    expect(fixed.result.cells.every((c) => c.status === 'ok')).toBe(true);
    expect(fixed.result.harness.control).toEqual({ kind: 'fixed-order', runtimeOrder: [...RUNTIME_EXECUTION_ORDER] });
    expect(isControlRun(fixed.result)).toBe(true);
    expect(isControlRun(protocol.result)).toBe(false);
    expect(validateRunShape(fixed.result)).toEqual([]);
    expect(validateSubmission(fixed.result).shapeErrors).toEqual([]);
    fixed.result.digest = await computeRunDigest(fixed.result);
    expect(await verifyRunDigest(fixed.result)).toBe(true);
  });

  it('a protocol run of the same suite runs the same cells, under the same rules, in the protocol order', async () => {
    const [control, protocol] = await Promise.all([
      runSuite({ name: '@localmode/bench', version: 'test', control: createHarnessControl('order-reversed') }),
      runSuite({ name: '@localmode/bench', version: 'test' }),
    ]);
    expect(protocol.result.harness.control).toBeUndefined();
    expect(isControlRun(protocol.result)).toBe(false);
    expect(protocol.started).toEqual([
      'transformers-wasm/embed/embed-single',
      'transformers-webgpu/m1/chat-pp128-tg128',
      'webllm/m1/chat-pp128-tg128',
      'wllama-webgpu/m1/chat-pp128-tg128',
      'wllama/m1/chat-pp128-tg128',
      'wllama/m2/chat-pp128-tg128',
    ]);
    const sameCells = (r: BenchRunResult) =>
      r.cells
        .map((c) => ({ cellId: c.cellId, status: c.status, iterations: c.iterations.length, warmup: c.warmupMs !== undefined }))
        .sort((a, b) => a.cellId.localeCompare(b.cellId));
    expect(sameCells(control.result)).toEqual(sameCells(protocol.result));
    expect(control.result.protocol).toBe(protocol.result.protocol);
    expect(control.result.schemaVersion).toBe(protocol.result.schemaVersion);
    // Same environment capture and the same suite trace events.
    expect(Object.keys(control.result.environment).sort()).toEqual(Object.keys(protocol.result.environment).sort());
    const kinds = (r: BenchRunResult) => r.events.map((e) => e.type).filter((t) => !t.startsWith('wakelock'));
    expect(kinds(control.result)).toEqual(kinds(protocol.result));
  });

  it('refuses a control marker whose order is not the kind\'s canonical order before running anything', async () => {
    const adapter = makeMockLLMAdapter();
    await expect(
      runBenchmarkSuite({
        suite: 'custom',
        cells: [{ model: MODEL_REF, workload: LLM_WORKLOADS[0] }],
        policy: TEST_POLICY,
        llmAdapters: new Map([[adapter.runtimeId, adapter]]),
        embedAdapters: new Map(),
        harness: { name: 'x', version: 'y', control: { kind: 'order-reversed', runtimeOrder: [...RUNTIME_EXECUTION_ORDER] } },
        skipFingerprint: true,
      }),
    ).rejects.toThrow("harness.control.runtimeOrder must be the order-reversed order [wllama, wllama-webgpu, litert, mediapipe, webllm, chrome-ai, transformers-webgpu, transformers-wasm]; use createHarnessControl('order-reversed')");
    expect(adapter.loadCalls).toBe(0);
  });

  it('refuses a fixed-order marker carrying any order but the protocol order, and an unknown kind, before running anything', async () => {
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
    await expect(attempt({ kind: 'fixed-order', runtimeOrder: controlRuntimeOrder('order-reversed') })).rejects.toThrow(
      "harness.control.runtimeOrder must be the fixed-order order [transformers-wasm, transformers-webgpu, chrome-ai, webllm, mediapipe, litert, wllama-webgpu, wllama]; use createHarnessControl('fixed-order')",
    );
    await expect(attempt({ kind: 'fixed-order', runtimeOrder: RUNTIME_EXECUTION_ORDER.slice(1) })).rejects.toThrow(
      'harness.control.runtimeOrder must be the fixed-order order',
    );
    await expect(attempt({ kind: 'order-shuffled', runtimeOrder: [...RUNTIME_EXECUTION_ORDER] })).rejects.toThrow(
      'harness.control.kind must be one of order-reversed, fixed-order, wasm-default, wasm-q8, wasm-threads, wllama-compat, current-releases, ort-profile, llamacpp-profile; got order-shuffled',
    );
    expect(adapter.loadCalls).toBe(0);
  });
});

describe('validateRunShape() on harness.control', () => {
  it('accepts a well-formed control marker and rejects malformed ones', () => {
    const ok = makeRun({ harness: { name: 'n', version: 'v', control: createHarnessControl('order-reversed') } });
    expect(validateRunShape(ok)).toEqual([]);
    const withControl = (control: unknown) =>
      validateRunShape({ ...makeRun(), harness: { name: 'n', version: 'v', control } });
    expect(withControl(null)).toEqual(['harness.control must be an object {kind, runtimeOrder}']);
    expect(withControl(['order-reversed'])).toEqual(['harness.control must be an object {kind, runtimeOrder}']);
    expect(withControl({ kind: 'order-shuffled', runtimeOrder: [] })).toEqual(['harness.control.kind must be one of order-reversed, fixed-order, wasm-default, wasm-q8, wasm-threads, wllama-compat, current-releases, ort-profile, llamacpp-profile']);
    const orderError =
      'harness.control.runtimeOrder must be the order-reversed order [wllama, wllama-webgpu, litert, mediapipe, webllm, chrome-ai, transformers-webgpu, transformers-wasm]';
    expect(withControl({ kind: 'order-reversed', runtimeOrder: [...RUNTIME_EXECUTION_ORDER] })).toEqual([orderError]);
    expect(withControl({ kind: 'order-reversed' })).toEqual([orderError]);
    expect(withControl({ kind: 'order-reversed', runtimeOrder: controlRuntimeOrder('order-reversed').slice(1) })).toEqual([orderError]);
  });

  it('accepts a well-formed fixed-order marker and rejects any other order for it', () => {
    const ok = makeRun({ harness: { name: 'n', version: 'v', control: createHarnessControl('fixed-order') } });
    expect(validateRunShape(ok)).toEqual([]);
    const withControl = (control: unknown) =>
      validateRunShape({ ...makeRun(), harness: { name: 'n', version: 'v', control } });
    const orderError =
      'harness.control.runtimeOrder must be the fixed-order order [transformers-wasm, transformers-webgpu, chrome-ai, webllm, mediapipe, litert, wllama-webgpu, wllama]';
    expect(withControl({ kind: 'fixed-order', runtimeOrder: controlRuntimeOrder('order-reversed') })).toEqual([orderError]);
    expect(withControl({ kind: 'fixed-order' })).toEqual([orderError]);
    expect(withControl({ kind: 'fixed-order', runtimeOrder: [...RUNTIME_EXECUTION_ORDER, 'wllama'] })).toEqual([orderError]);
  });

  it('isControlRun() counts any present marker, malformed included, and nothing else', () => {
    expect(isControlRun(makeRun())).toBe(false);
    expect(isControlRun({ harness: { control: null } })).toBe(true);
    expect(isControlRun({ harness: { control: {} } })).toBe(true);
    expect(isControlRun(null)).toBe(false);
    expect(isControlRun('run')).toBe(false);
  });
});

describe('aggregation of control runs', () => {
  it('a control run contributes to no leaderboard row; runs.csv names its kind and order', () => {
    const protocolRun = makeRun({ runId: 'run-protocol-1' });
    const controlRun = makeRun({
      runId: 'run-control-1',
      harness: { name: '@localmode/bench', version: '0.1.0', control: createHarnessControl('order-reversed') },
    });
    const rows = aggregateRuns([protocolRun, controlRun], 1);
    expect(rows).toHaveLength(1);
    expect(rows[0].submissions).toBe(1);
    expect(aggregateRuns([controlRun], 1)).toEqual([]);

    const csv = runsToRunsCSV([protocolRun, controlRun]).trimEnd().split('\n');
    const header = csv[0].split(',');
    expect(header.slice(-2)).toEqual(['controlKind', 'controlRuntimeOrder']);
    expect(csv[1].endsWith(',,')).toBe(true);
    expect(csv[2].endsWith(
      ',order-reversed,wllama>wllama-webgpu>litert>mediapipe>webllm>chrome-ai>transformers-webgpu>transformers-wasm',
    )).toBe(true);
  });

  it('a fixed-order control run contributes to no leaderboard row; runs.csv names its kind and the protocol order', () => {
    const protocolRun = makeRun({ runId: 'run-protocol-1' });
    const fixedRun = makeRun({
      runId: 'run-fixed-1',
      harness: { name: '@localmode/bench', version: '0.1.0', control: createHarnessControl('fixed-order') },
    });
    const rows = aggregateRuns([protocolRun, fixedRun], 1);
    expect(rows).toHaveLength(1);
    expect(rows[0].submissions).toBe(1);
    expect(aggregateRuns([fixedRun], 1)).toEqual([]);

    const csv = runsToRunsCSV([protocolRun, fixedRun]).trimEnd().split('\n');
    expect(csv[1].endsWith(',,')).toBe(true);
    expect(csv[2].endsWith(
      ',fixed-order,transformers-wasm>transformers-webgpu>chrome-ai>webllm>mediapipe>litert>wllama-webgpu>wllama',
    )).toBe(true);
  });
});

describe('wasm-default control kind', () => {
  const lane = (numThreads: number) => ({ dtype: 'q8', numThreads, simd: true });

  it('keeps the protocol order and records the WASM lane settings it is given', () => {
    expect(controlRuntimeOrder('wasm-default')).toEqual([...RUNTIME_EXECUTION_ORDER]);
    expect(controlRuntimeOrder('wasm-default')).not.toBe(RUNTIME_EXECUTION_ORDER);
    expect(CONTROL_WASM_DTYPE).toBe('q8');
    expect(createHarnessControl('wasm-default', { numThreads: 12 })).toEqual({
      kind: 'wasm-default',
      runtimeOrder: [...RUNTIME_EXECUTION_ORDER],
      wasmLane: { dtype: 'q8', numThreads: 12, simd: true },
    });
    expect(createHarnessControl('wasm-default', { numThreads: 1 }).wasmLane?.numThreads).toBe(1);
    expect(createHarnessControl('wasm-default', { numThreads: CONTROL_WASM_MAX_THREADS }).wasmLane?.numThreads).toBe(1024);
    // The order kinds carry no wasmLane key at all.
    expect('wasmLane' in createHarnessControl('fixed-order')).toBe(false);
    expect('wasmLane' in createHarnessControl('order-reversed')).toBe(false);
  });

  it('createHarnessControl refuses a missing or invalid thread count, and a thread count on another kind', () => {
    const shape =
      "harness.control.wasmLane must be { dtype: 'q8', numThreads: <integer 1-1024>, simd: true } on a wasm-default control run; pass { numThreads: navigator.hardwareConcurrency }";
    expect(() => createHarnessControl('wasm-default')).toThrow(shape);
    for (const bad of [0, -1, 2.5, Number.NaN, 1025]) {
      expect(() => createHarnessControl('wasm-default', { numThreads: bad })).toThrow(shape);
    }
    expect(() => createHarnessControl('fixed-order', { numThreads: 8 })).toThrow(
      "createHarnessControl('fixed-order') takes no numThreads; only wasm-default and wasm-threads set the WASM lane's threads",
    );
    expect(() => createHarnessControl('order-reversed', { numThreads: 8 })).toThrow(TypeError);
  });

  it('controlWasmLaneError: required and exact on wasm-default, absent on the order kinds', () => {
    const order = [...RUNTIME_EXECUTION_ORDER];
    const shape =
      "harness.control.wasmLane must be { dtype: 'q8', numThreads: <integer 1-1024>, simd: true } on a wasm-default control run";
    expect(controlWasmLaneError({ kind: 'wasm-default', wasmLane: lane(8) })).toBeUndefined();
    expect(controlWasmLaneError({ kind: 'wasm-default' })).toBe(shape);
    expect(controlWasmLaneError({ kind: 'wasm-default', wasmLane: null })).toBe(shape);
    expect(controlWasmLaneError({ kind: 'wasm-default', wasmLane: { ...lane(8), dtype: 'q4' } })).toBe(shape);
    expect(controlWasmLaneError({ kind: 'wasm-default', wasmLane: { ...lane(8), simd: false } })).toBe(shape);
    expect(controlWasmLaneError({ kind: 'wasm-default', wasmLane: { ...lane(8), extra: 1 } })).toBe(shape);
    expect(controlWasmLaneError({ kind: 'wasm-default', wasmLane: lane(0) })).toBe(shape);
    expect(controlWasmLaneError({ kind: 'wasm-default', wasmLane: { dtype: 'q8', numThreads: '8', simd: true } })).toBe(shape);
    expect(controlWasmLaneError({ kind: 'fixed-order' })).toBeUndefined();
    expect(controlWasmLaneError({ kind: 'fixed-order', wasmLane: lane(8) })).toBe(
      'harness.control.wasmLane is set only on a wasm-default, wasm-q8 or wasm-threads control run, not on fixed-order',
    );
    expect(validateRunShape(makeRun({ harness: { name: 'n', version: 'v', control: createHarnessControl('wasm-default', { numThreads: 8 }) } }))).toEqual([]);
    const withControl = (control: unknown) => validateRunShape({ ...makeRun(), harness: { name: 'n', version: 'v', control } });
    expect(withControl({ kind: 'wasm-default', runtimeOrder: order })).toEqual([shape]);
    expect(withControl({ kind: 'wasm-default', runtimeOrder: order, wasmLane: { ...lane(8), numThreads: 2000 } })).toEqual([shape]);
    expect(withControl({ kind: 'order-reversed', runtimeOrder: controlRuntimeOrder('order-reversed'), wasmLane: lane(8) })).toEqual([
      'harness.control.wasmLane is set only on a wasm-default, wasm-q8 or wasm-threads control run, not on order-reversed',
    ]);
    expect(withControl({ kind: 'wasm-default', runtimeOrder: controlRuntimeOrder('order-reversed'), wasmLane: lane(8) })).toEqual([
      'harness.control.runtimeOrder must be the wasm-default order [transformers-wasm, transformers-webgpu, chrome-ai, webllm, mediapipe, litert, wllama-webgpu, wllama]',
    ]);
  });

  it('runs the suite in the protocol order, records the marker with its wasmLane, and validates and digests', async () => {
    const control = createHarnessControl('wasm-default', { numThreads: 16 });
    const { result, started } = await runSuite({ name: '@localmode/bench', version: 'test', control });
    expect(started).toEqual([
      'transformers-wasm/embed/embed-single',
      'transformers-webgpu/m1/chat-pp128-tg128',
      'webllm/m1/chat-pp128-tg128',
      'wllama-webgpu/m1/chat-pp128-tg128',
      'wllama/m1/chat-pp128-tg128',
      'wllama/m2/chat-pp128-tg128',
    ]);
    expect(result.cells.every((c) => c.status === 'ok')).toBe(true);
    expect(result.harness.control).toEqual({
      kind: 'wasm-default',
      runtimeOrder: [...RUNTIME_EXECUTION_ORDER],
      wasmLane: { dtype: 'q8', numThreads: 16, simd: true },
    });
    expect(isControlRun(result)).toBe(true);
    expect(validateRunShape(result)).toEqual([]);
    expect(validateSubmission(result).shapeErrors).toEqual([]);
    result.digest = await computeRunDigest(result);
    expect(await verifyRunDigest(result)).toBe(true);
  });

  it('the runner refuses a wasm-default marker without a valid wasmLane, and a wasmLane on another kind, before loading anything', async () => {
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
    const order = [...RUNTIME_EXECUTION_ORDER];
    await expect(attempt({ kind: 'wasm-default', runtimeOrder: order })).rejects.toThrow(
      "harness.control.wasmLane must be { dtype: 'q8', numThreads: <integer 1-1024>, simd: true } on a wasm-default control run; use createHarnessControl('wasm-default')",
    );
    await expect(attempt({ kind: 'wasm-default', runtimeOrder: order, wasmLane: { ...lane(4), dtype: 'fp32' } })).rejects.toThrow(
      'harness.control.wasmLane must be',
    );
    await expect(attempt({ kind: 'fixed-order', runtimeOrder: order, wasmLane: lane(4) })).rejects.toThrow(
      "harness.control.wasmLane is set only on a wasm-default, wasm-q8 or wasm-threads control run, not on fixed-order; use createHarnessControl('fixed-order')",
    );
    expect(adapter.loadCalls).toBe(0);
  });

  it('a wasm-default control run contributes to no leaderboard row; runs.csv names its kind and the protocol order', () => {
    const protocolRun = makeRun({ runId: 'run-protocol-1' });
    const wasmRun = makeRun({
      runId: 'run-wasm-default-1',
      harness: { name: '@localmode/bench', version: '0.1.0', control: createHarnessControl('wasm-default', { numThreads: 8 }) },
    });
    const rows = aggregateRuns([protocolRun, wasmRun], 1);
    expect(rows).toHaveLength(1);
    expect(rows[0].submissions).toBe(1);
    expect(aggregateRuns([wasmRun], 1)).toEqual([]);
    const csv = runsToRunsCSV([protocolRun, wasmRun]).trimEnd().split('\n');
    expect(csv[0].split(',').slice(-2)).toEqual(['controlKind', 'controlRuntimeOrder']);
    expect(csv[1].endsWith(',,')).toBe(true);
    expect(csv[2].endsWith(
      ',wasm-default,transformers-wasm>transformers-webgpu>chrome-ai>webllm>mediapipe>litert>wllama-webgpu>wllama',
    )).toBe(true);
  });
});

describe('wasm-q8 and wasm-threads control kinds: the two halves of wasm-default', () => {
  const order = [...RUNTIME_EXECUTION_ORDER];
  const Q8_SHAPE = "harness.control.wasmLane must be { dtype: 'q8', numThreads: null, simd: true } on a wasm-q8 control run";
  const THREADS_SHAPE =
    "harness.control.wasmLane must be { dtype: 'q4', numThreads: <integer 1-1024>, simd: true } on a wasm-threads control run";

  it('the per-kind spec table is the 2x2 factorial over dtype and thread policy; the order kinds have no entry', () => {
    expect(CONTROL_WASM_LANE_SPECS).toEqual({
      'wasm-default': { dtype: 'q8', threads: 'all-cores' },
      'wasm-q8': { dtype: 'q8', threads: 'runtime-default' },
      'wasm-threads': { dtype: 'q4', threads: 'all-cores' },
    });
    expect(CONTROL_WASM_LANE_SPECS['fixed-order']).toBeUndefined();
    expect(CONTROL_WASM_LANE_SPECS['order-reversed']).toBeUndefined();
  });

  it('both keep the protocol order and record their exact wasmLane', () => {
    for (const kind of ['wasm-q8', 'wasm-threads'] as const) {
      expect(controlRuntimeOrder(kind)).toEqual(order);
      expect(controlRuntimeOrder(kind)).not.toBe(RUNTIME_EXECUTION_ORDER);
    }
    expect(createHarnessControl('wasm-q8')).toEqual({
      kind: 'wasm-q8',
      runtimeOrder: order,
      wasmLane: { dtype: 'q8', numThreads: null, simd: true },
    });
    expect(createHarnessControl('wasm-threads', { numThreads: 12 })).toEqual({
      kind: 'wasm-threads',
      runtimeOrder: order,
      wasmLane: { dtype: 'q4', numThreads: 12, simd: true },
    });
    // The recorded JSON keeps the key order and the explicit null.
    expect(JSON.stringify(createHarnessControl('wasm-q8').wasmLane)).toBe('{"dtype":"q8","numThreads":null,"simd":true}');
    expect(JSON.stringify(createHarnessControl('wasm-threads', { numThreads: 8 }).wasmLane)).toBe(
      '{"dtype":"q4","numThreads":8,"simd":true}',
    );
    // wasm-default's record is unchanged.
    expect(JSON.stringify(createHarnessControl('wasm-default', { numThreads: 8 }))).toBe(
      `{"kind":"wasm-default","runtimeOrder":${JSON.stringify(order)},"wasmLane":{"dtype":"q8","numThreads":8,"simd":true}}`,
    );
  });

  it('createHarnessControl: wasm-q8 refuses a thread count; wasm-threads requires a valid one', () => {
    expect(() => createHarnessControl('wasm-q8', { numThreads: 8 })).toThrow(
      "createHarnessControl('wasm-q8') takes no numThreads; it leaves ONNX Runtime's WASM thread count at the runtime's default",
    );
    expect(() => createHarnessControl('wasm-threads')).toThrow(`${THREADS_SHAPE}; pass { numThreads: navigator.hardwareConcurrency }`);
    for (const bad of [0, -1, 2.5, Number.NaN, 1025]) {
      expect(() => createHarnessControl('wasm-threads', { numThreads: bad })).toThrow(THREADS_SHAPE);
    }
    expect(createHarnessControl('wasm-threads', { numThreads: CONTROL_WASM_MAX_THREADS }).wasmLane?.numThreads).toBe(1024);
  });

  it('controlWasmLaneError and validateRunShape accept exactly each kind\'s recorded shape', () => {
    const q8 = { dtype: 'q8', numThreads: null, simd: true };
    const threads = (n: unknown) => ({ dtype: 'q4', numThreads: n, simd: true });
    expect(controlWasmLaneError({ kind: 'wasm-q8', wasmLane: q8 })).toBeUndefined();
    expect(controlWasmLaneError({ kind: 'wasm-threads', wasmLane: threads(6) })).toBeUndefined();
    // wasm-q8: numThreads must be null, not a number, not absent; dtype q8 only.
    expect(controlWasmLaneError({ kind: 'wasm-q8' })).toBe(Q8_SHAPE);
    expect(controlWasmLaneError({ kind: 'wasm-q8', wasmLane: { ...q8, numThreads: 4 } })).toBe(Q8_SHAPE);
    expect(controlWasmLaneError({ kind: 'wasm-q8', wasmLane: { dtype: 'q8', simd: true } })).toBe(Q8_SHAPE);
    expect(controlWasmLaneError({ kind: 'wasm-q8', wasmLane: { ...q8, dtype: 'q4' } })).toBe(Q8_SHAPE);
    expect(controlWasmLaneError({ kind: 'wasm-q8', wasmLane: { ...q8, simd: false } })).toBe(Q8_SHAPE);
    expect(controlWasmLaneError({ kind: 'wasm-q8', wasmLane: { ...q8, extra: 1 } })).toBe(Q8_SHAPE);
    // wasm-threads: dtype q4 only, an integer thread count, never null.
    expect(controlWasmLaneError({ kind: 'wasm-threads' })).toBe(THREADS_SHAPE);
    expect(controlWasmLaneError({ kind: 'wasm-threads', wasmLane: threads(null) })).toBe(THREADS_SHAPE);
    expect(controlWasmLaneError({ kind: 'wasm-threads', wasmLane: threads(0) })).toBe(THREADS_SHAPE);
    expect(controlWasmLaneError({ kind: 'wasm-threads', wasmLane: threads('8') })).toBe(THREADS_SHAPE);
    expect(controlWasmLaneError({ kind: 'wasm-threads', wasmLane: { ...threads(8), dtype: 'q8' } })).toBe(THREADS_SHAPE);
    // wasm-default never accepts the null thread count of wasm-q8.
    expect(controlWasmLaneError({ kind: 'wasm-default', wasmLane: q8 })).toBe(
      "harness.control.wasmLane must be { dtype: 'q8', numThreads: <integer 1-1024>, simd: true } on a wasm-default control run",
    );

    expect(validateRunShape(makeRun({ harness: { name: 'n', version: 'v', control: createHarnessControl('wasm-q8') } }))).toEqual([]);
    expect(
      validateRunShape(makeRun({ harness: { name: 'n', version: 'v', control: createHarnessControl('wasm-threads', { numThreads: 8 }) } })),
    ).toEqual([]);
    const withControl = (control: unknown) => validateRunShape({ ...makeRun(), harness: { name: 'n', version: 'v', control } });
    // The exported JSON (null survives a round trip) validates too.
    expect(withControl(JSON.parse(JSON.stringify(createHarnessControl('wasm-q8'))))).toEqual([]);
    expect(withControl({ kind: 'wasm-q8', runtimeOrder: order, wasmLane: { ...q8, numThreads: 4 } })).toEqual([Q8_SHAPE]);
    expect(withControl({ kind: 'wasm-threads', runtimeOrder: order, wasmLane: threads(2000) })).toEqual([THREADS_SHAPE]);
    expect(withControl({ kind: 'wasm-threads', runtimeOrder: controlRuntimeOrder('order-reversed'), wasmLane: threads(8) })).toEqual([
      'harness.control.runtimeOrder must be the wasm-threads order [transformers-wasm, transformers-webgpu, chrome-ai, webllm, mediapipe, litert, wllama-webgpu, wllama]',
    ]);
  });

  it('runs the suite in the protocol order and records the marker; the run validates, digests and is a control run', async () => {
    for (const control of [createHarnessControl('wasm-q8'), createHarnessControl('wasm-threads', { numThreads: 16 })]) {
      const { result, started } = await runSuite({ name: '@localmode/bench', version: 'test', control });
      expect(started[0]).toBe('transformers-wasm/embed/embed-single');
      expect(started.at(-1)).toBe('wllama/m2/chat-pp128-tg128');
      expect(result.cells.every((c) => c.status === 'ok')).toBe(true);
      expect(result.harness.control).toEqual(control);
      expect(isControlRun(result)).toBe(true);
      expect(validateRunShape(result)).toEqual([]);
      expect(validateSubmission(result).shapeErrors).toEqual([]);
      result.digest = await computeRunDigest(result);
      expect(await verifyRunDigest(result)).toBe(true);
    }
  });

  it('the runner refuses a wrong wasmLane for either kind before loading anything', async () => {
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
    await expect(attempt({ kind: 'wasm-q8', runtimeOrder: order, wasmLane: { dtype: 'q8', numThreads: 4, simd: true } })).rejects.toThrow(
      `${Q8_SHAPE}; use createHarnessControl('wasm-q8')`,
    );
    await expect(attempt({ kind: 'wasm-threads', runtimeOrder: order })).rejects.toThrow(
      `${THREADS_SHAPE}; use createHarnessControl('wasm-threads')`,
    );
    expect(adapter.loadCalls).toBe(0);
  });

  it('neither contributes to a leaderboard row; runs.csv names each kind and the protocol order', () => {
    const protocolRun = makeRun({ runId: 'run-protocol-1' });
    const q8Run = makeRun({ runId: 'run-wasm-q8-1', harness: { name: '@localmode/bench', version: '0.1.0', control: createHarnessControl('wasm-q8') } });
    const threadsRun = makeRun({
      runId: 'run-wasm-threads-1',
      harness: { name: '@localmode/bench', version: '0.1.0', control: createHarnessControl('wasm-threads', { numThreads: 8 }) },
    });
    const rows = aggregateRuns([protocolRun, q8Run, threadsRun], 1);
    expect(rows).toHaveLength(1);
    expect(rows[0].submissions).toBe(1);
    expect(aggregateRuns([q8Run, threadsRun], 1)).toEqual([]);
    const csv = runsToRunsCSV([protocolRun, q8Run, threadsRun]).trimEnd().split('\n');
    const protocolOrder = 'transformers-wasm>transformers-webgpu>chrome-ai>webllm>mediapipe>litert>wllama-webgpu>wllama';
    expect(csv[1].endsWith(',,')).toBe(true);
    expect(csv[2].endsWith(`,wasm-q8,${protocolOrder}`)).toBe(true);
    expect(csv[3].endsWith(`,wasm-threads,${protocolOrder}`)).toBe(true);
  });
});
