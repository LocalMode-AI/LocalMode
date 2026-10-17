/**
 * Control runs (`harness.control`, kinds `order-reversed` and `fixed-order`):
 * a control experiment for the methodology that runs the same suite with the
 * runtime execution order reversed, or in the protocol order as a same-build
 * reference series. The runner executes real mock adapters through
 * the public `runBenchmarkSuite`, so the asserted order is the order the
 * cells actually ran in (observed through the `onCellStart` hook and the
 * result's cell order), not a re-derivation of it.
 */
import { describe, expect, it } from 'vitest';
import {
  aggregateRuns,
  computeRunDigest,
  CONTROL_KINDS,
  controlRuntimeOrder,
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
    expect(CONTROL_KINDS).toEqual(['order-reversed', 'fixed-order']);
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
      'harness.control.kind must be one of order-reversed, fixed-order; got order-shuffled',
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
    expect(withControl({ kind: 'order-shuffled', runtimeOrder: [] })).toEqual(['harness.control.kind must be one of order-reversed, fixed-order']);
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
