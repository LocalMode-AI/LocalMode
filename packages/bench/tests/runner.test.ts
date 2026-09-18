import { describe, expect, it } from 'vitest';
import { runBenchmarkSuite } from '../src/runner.js';
import { LLM_WORKLOADS, RUN_POLICIES } from '../src/protocol.js';
import type { LLMIteration } from '../src/types.js';
import { validateRunShape } from '../src/validate.js';
import { MODEL_REF, makeMockLLMAdapter } from './helpers.js';

const HARNESS = { name: '@localmode/bench', version: '0.1.0-test' };

/** Fast policy for tests (structure identical to the shipped policies). */
const TEST_POLICY = { ...RUN_POLICIES.quick, cooldownMs: 5, pressureGate: false };

describe('runBenchmarkSuite()', () => {
  it('produces a shape-valid result with real streamed traces', async () => {
    const adapter = makeMockLLMAdapter({ chunkDelayMs: 3, chunkCount: 6 });
    const result = await runBenchmarkSuite({
      suite: 'custom',
      cells: [{ model: MODEL_REF, workload: LLM_WORKLOADS[0] }],
      policy: TEST_POLICY,
      llmAdapters: new Map([[adapter.runtimeId, adapter]]),
      embedAdapters: new Map(),
      harness: HARNESS,
      skipFingerprint: true,
    });

    expect(validateRunShape({ ...result, fingerprint: result.fingerprint })).toEqual([]);
    expect(result.cells).toHaveLength(1);
    const cell = result.cells[0];
    expect(cell.status).toBe('ok');
    expect(cell.resolvedBackend).toBe('wasm');
    expect(cell.load?.cached).toBe(false);
    expect(cell.warmupMs).toBeGreaterThan(0);
    expect(cell.iterations).toHaveLength(TEST_POLICY.timedRuns);
    for (const iter of cell.iterations as LLMIteration[]) {
      // Real timer gaps: chunk timestamps strictly increase and are >= startT.
      expect(iter.chunks.length).toBeGreaterThan(0);
      let prev = iter.startT;
      for (const c of iter.chunks) {
        expect(c.t).toBeGreaterThanOrEqual(prev);
        prev = c.t;
      }
      expect(iter.endT).toBeGreaterThanOrEqual(prev);
      expect(iter.text.length).toBe(iter.chunks.reduce((a, c) => a + c.c, 0));
      expect(iter.providerUsage?.fidelity).toBe('estimated');
    }
    // Suite-level trace events present.
    expect(result.events.map((e) => e.type)).toContain('suite-start');
    expect(result.events.map((e) => e.type)).toContain('suite-end');
    // Client summaries computed with the shared code.
    expect(result.clientSummaries?.[0].ttftMs?.n).toBe(TEST_POLICY.timedRuns);
  });

  it('loads a model once across its workloads and disposes it after', async () => {
    const adapter = makeMockLLMAdapter();
    await runBenchmarkSuite({
      suite: 'custom',
      cells: [
        { model: MODEL_REF, workload: LLM_WORKLOADS[0] },
        { model: MODEL_REF, workload: LLM_WORKLOADS[1] },
      ],
      policy: { ...TEST_POLICY, measureWarmReload: false },
      llmAdapters: new Map([[adapter.runtimeId, adapter]]),
      embedAdapters: new Map(),
      harness: HARNESS,
      skipFingerprint: true,
    });
    expect(adapter.loadCalls).toBe(1);
    expect(adapter.disposeCalls).toBe(1);
  });

  it('adds a warm-reload cell after a cold load when the policy asks', async () => {
    const adapter = makeMockLLMAdapter({ cached: false });
    const result = await runBenchmarkSuite({
      suite: 'custom',
      cells: [{ model: MODEL_REF, workload: LLM_WORKLOADS[0] }],
      policy: { ...TEST_POLICY, measureWarmReload: true },
      llmAdapters: new Map([[adapter.runtimeId, adapter]]),
      embedAdapters: new Map(),
      harness: HARNESS,
      skipFingerprint: true,
    });
    const warm = result.cells.find((c) => c.workloadId === 'warm-reload');
    expect(warm).toBeDefined();
    expect(warm?.load?.cached).toBe(true);
    expect(adapter.loadCalls).toBe(2);
  });

  it('marks cells skipped when the runtime is unavailable, with the reason', async () => {
    const adapter = makeMockLLMAdapter({ available: { ok: false, reason: 'no WebGPU adapter' } });
    const result = await runBenchmarkSuite({
      suite: 'custom',
      cells: [{ model: MODEL_REF, workload: LLM_WORKLOADS[0] }],
      policy: TEST_POLICY,
      llmAdapters: new Map([[adapter.runtimeId, adapter]]),
      embedAdapters: new Map(),
      harness: HARNESS,
      skipFingerprint: true,
    });
    expect(result.cells[0].status).toBe('skipped');
    expect(result.cells[0].invalidReasons?.[0]).toContain('no WebGPU adapter');
    expect(adapter.loadCalls).toBe(0);
  });

  it('isolates load failures to the model group as error cells', async () => {
    const failing = makeMockLLMAdapter({ failLoad: true });
    const result = await runBenchmarkSuite({
      suite: 'custom',
      cells: [
        { model: MODEL_REF, workload: LLM_WORKLOADS[0] },
        { model: MODEL_REF, workload: LLM_WORKLOADS[1] },
      ],
      policy: TEST_POLICY,
      llmAdapters: new Map([[failing.runtimeId, failing]]),
      embedAdapters: new Map(),
      harness: HARNESS,
      skipFingerprint: true,
    });
    expect(result.cells).toHaveLength(2);
    for (const cell of result.cells) {
      expect(cell.status).toBe('error');
      expect(cell.error?.message).toBe('mock load failure');
    }
  });

  it('honors AbortSignal with an AbortError', async () => {
    const adapter = makeMockLLMAdapter({ chunkDelayMs: 10, chunkCount: 50 });
    const controller = new AbortController();
    const promise = runBenchmarkSuite({
      suite: 'custom',
      cells: [{ model: MODEL_REF, workload: LLM_WORKLOADS[0] }],
      policy: TEST_POLICY,
      llmAdapters: new Map([[adapter.runtimeId, adapter]]),
      embedAdapters: new Map(),
      harness: HARNESS,
      skipFingerprint: true,
      abortSignal: controller.signal,
    });
    setTimeout(() => controller.abort(), 30);
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('runs the fingerprint microbenchmark when not skipped', async () => {
    const adapter = makeMockLLMAdapter({ chunkCount: 2, chunkDelayMs: 1 });
    const result = await runBenchmarkSuite({
      suite: 'custom',
      cells: [{ model: MODEL_REF, workload: LLM_WORKLOADS[0] }],
      policy: TEST_POLICY,
      llmAdapters: new Map([[adapter.runtimeId, adapter]]),
      embedAdapters: new Map(),
      harness: HARNESS,
    });
    expect(result.fingerprint).not.toBeNull();
    expect(result.fingerprint!.mflops).toBeGreaterThan(1);
    expect(result.fingerprint!.iterations).toBeGreaterThan(0);
  }, 30_000);
});
