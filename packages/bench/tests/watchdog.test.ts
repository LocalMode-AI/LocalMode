/**
 * The runner never hangs. A lane that stops producing (a worker that died,
 * a WebGPU device that was lost, a fetch that never resolves) is aborted by a
 * watchdog, recorded as a timed-out attempt, retried once, and then skipped;
 * the suite finishes and the host can still submit. Retries are never silent:
 * every failed attempt stays in the cell.
 */

import { describe, expect, it } from 'vitest';
import { runBenchmarkSuite } from '../src/runner.js';
import { LLM_WORKLOADS, RUN_POLICIES } from '../src/protocol.js';
import type { LoadedLLM } from '../src/adapter.js';
import { validateRunShape } from '../src/validate.js';
import { MODEL_REF, makeMockLLMAdapter } from './helpers.js';

const HARNESS = { name: '@localmode/bench', version: '0.1.0-test' };
const TEST_POLICY = { ...RUN_POLICIES.quick, cooldownMs: 5, pressureGate: false, measureWarmReload: false };

/** A stream that emits `hangAfter` chunks and then never resolves unless aborted. */
function hangingStreamModel(hangAfter: number, calls: { streams: number; aborted: number }) {
  return {
    modelId: 'wllama:hang',
    provider: 'wllama',
    async *doStream(options: { abortSignal?: AbortSignal }) {
      calls.streams += 1;
      for (let i = 0; i < hangAfter; i++) {
        await new Promise((r) => setTimeout(r, 2));
        yield { text: 'tok ', done: false };
      }
      await new Promise<void>((_, reject) => {
        options.abortSignal?.addEventListener('abort', () => {
          calls.aborted += 1;
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      });
    },
    async doGenerate() {
      return { text: 'ready', finishReason: 'stop' };
    },
  };
}

describe('watchdog and recorded retries', () => {
  it('aborts an iteration that stops streaming, records the timed-out attempt, retries once, then skips', async () => {
    const calls = { streams: 0, aborted: 0 };
    const adapter = makeMockLLMAdapter();
    adapter.load = async (): Promise<LoadedLLM> => ({
      model: hangingStreamModel(2, calls) as unknown as LoadedLLM['model'],
      resolvedBackend: 'wasm',
      dispose: async () => {},
    });
    const retries: string[] = [];
    const result = await runBenchmarkSuite({
      suite: 'custom',
      cells: [{ model: MODEL_REF, workload: LLM_WORKLOADS[0] }],
      policy: { ...TEST_POLICY, warmupRuns: 0, chunkStallMs: 60, iterationTimeoutMs: 5_000, maxAttempts: 2 },
      llmAdapters: new Map([[adapter.runtimeId, adapter]]),
      embedAdapters: new Map(),
      harness: HARNESS,
      skipFingerprint: true,
      hooks: { onCellRetry: (cellId, attempt, error) => retries.push(`${cellId}#${attempt}:${error.name}`) },
    });
    const cell = result.cells[0];
    expect(cell.status).toBe('error');
    expect(cell.error?.name).toBe('TimeoutError');
    expect(cell.error?.message).toMatch(/no stream progress for 60 ms/);
    // Both attempts are on record: the first as a failed attempt, the second as the outcome.
    expect(cell.attempts).toHaveLength(1);
    expect(cell.attempts?.[0].error.name).toBe('TimeoutError');
    expect(calls.streams).toBe(2);
    // The abort reached the provider both times.
    expect(calls.aborted).toBe(2);
    expect(retries).toEqual(['wllama/test-model/chat-pp128-tg128#2:TimeoutError']);
    expect(result.events.some((e) => e.type === 'cell-timeout')).toBe(true);
    expect(validateRunShape(result)).toEqual([]);
  });

  it('a retry that succeeds keeps the failed attempt on the ok cell', async () => {
    let call = 0;
    const adapter = makeMockLLMAdapter({ chunkDelayMs: 1, chunkCount: 4 });
    const original = adapter.load.bind(adapter);
    adapter.load = async (...args): Promise<LoadedLLM> => {
      const loaded = await original(...args);
      const good = loaded.model;
      const flaky = {
        ...good,
        async *doStream(options: { maxTokens?: number; abortSignal?: AbortSignal }) {
          call += 1;
          if (call === 1) throw Object.assign(new Error('device lost'), { name: 'GPUDeviceLostError' });
          yield* good.doStream!(options);
        },
      };
      return { ...loaded, model: flaky as unknown as LoadedLLM['model'] };
    };
    const result = await runBenchmarkSuite({
      suite: 'custom',
      cells: [{ model: MODEL_REF, workload: LLM_WORKLOADS[0] }],
      policy: { ...TEST_POLICY, warmupRuns: 0, maxAttempts: 2 },
      llmAdapters: new Map([[adapter.runtimeId, adapter]]),
      embedAdapters: new Map(),
      harness: HARNESS,
      skipFingerprint: true,
    });
    const cell = result.cells[0];
    expect(cell.status).toBe('ok');
    expect(cell.iterations).toHaveLength(TEST_POLICY.timedRuns);
    expect(cell.attempts).toEqual([
      expect.objectContaining({ error: expect.objectContaining({ name: 'GPUDeviceLostError', message: 'device lost' }) }),
    ]);
  });

  it('aborts a load whose progress stalls, retries it once, and errors the group when it stalls again', async () => {
    const adapter = makeMockLLMAdapter();
    let loads = 0;
    adapter.load = async (_model, { onProgress, abortSignal }): Promise<LoadedLLM> => {
      loads += 1;
      onProgress?.({ pct: 10 });
      await new Promise<void>((_, reject) => {
        abortSignal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
        );
      });
      throw new Error('unreachable');
    };
    const result = await runBenchmarkSuite({
      suite: 'custom',
      cells: [
        { model: MODEL_REF, workload: LLM_WORKLOADS[0] },
        { model: MODEL_REF, workload: LLM_WORKLOADS[1] },
      ],
      policy: { ...TEST_POLICY, loadStallMs: 50, loadTimeoutMs: 5_000, maxAttempts: 2 },
      llmAdapters: new Map([[adapter.runtimeId, adapter]]),
      embedAdapters: new Map(),
      harness: HARNESS,
      skipFingerprint: true,
    });
    expect(loads).toBe(2);
    for (const cell of result.cells) {
      expect(cell.status).toBe('error');
      expect(cell.error?.name).toBe('TimeoutError');
      expect(cell.error?.message).toMatch(/load made no progress for 50 ms/);
      expect(cell.attempts).toHaveLength(1);
    }
  });

  it('reports live activity: every streamed chunk and every load progress event reach the host', async () => {
    const adapter = makeMockLLMAdapter({ chunkDelayMs: 1, chunkCount: 5 });
    const activity: string[] = [];
    await runBenchmarkSuite({
      suite: 'custom',
      cells: [{ model: MODEL_REF, workload: LLM_WORKLOADS[0] }],
      policy: { ...TEST_POLICY, warmupRuns: 1 },
      llmAdapters: new Map([[adapter.runtimeId, adapter]]),
      embedAdapters: new Map(),
      harness: HARNESS,
      skipFingerprint: true,
      hooks: {
        onActivity: (a) => activity.push(`${a.phase}:${a.cellId}:${a.chars ?? ''}:${a.chunks ?? ''}`),
      },
    });
    expect(activity.some((a) => a.startsWith('load:'))).toBe(true);
    expect(activity.some((a) => a.startsWith('warmup:'))).toBe(true);
    // Each timed iteration announces itself (0 chars) and then reports its 5 chunks, chars counting up.
    const iterationEvents = activity.filter((a) => a.startsWith('iteration:'));
    expect(iterationEvents.length).toBe(TEST_POLICY.timedRuns * 6);
    expect(iterationEvents[0]).toBe('iteration:wllama/test-model/chat-pp128-tg128:0:0');
    expect(iterationEvents[5]).toBe('iteration:wllama/test-model/chat-pp128-tg128:30:5');
  });

  it('the shipped policies carry watchdog budgets a slow device can still meet', () => {
    for (const policy of Object.values(RUN_POLICIES)) {
      expect(policy.maxAttempts).toBe(2);
      // A LiteRT terminal burst arrives after 30 to 50 s of silence; the stall budget must exceed it.
      expect(policy.chunkStallMs).toBeGreaterThanOrEqual(120_000);
      // A 3.4 GB GGUF on a slow link: the load budget is stall-based, the absolute cap generous.
      expect(policy.loadStallMs).toBeGreaterThanOrEqual(120_000);
      expect(policy.loadTimeoutMs).toBeGreaterThanOrEqual(30 * 60_000);
      expect(policy.iterationTimeoutMs).toBeGreaterThanOrEqual(10 * 60_000);
    }
  });
});

/** A trace recorder whose visibility the test drives (the runner's `trace` option). */
function drivenTrace() {
  let hidden = false;
  const events: Array<{ t: number; type: string; detail?: string }> = [];
  const trace = {
    async attach() {},
    async dispose() {},
    record(type: string, detail?: string) {
      events.push({ t: performance.now(), type, ...(detail !== undefined ? { detail } : {}) });
    },
    get isHidden() {
      return hidden;
    },
    get pressureState(): string | undefined {
      return undefined;
    },
    get all() {
      return events;
    },
    setHidden(value: boolean) {
      if (value !== hidden) trace.record(value ? 'visibility-hidden' : 'visibility-visible');
      hidden = value;
    },
  };
  return trace;
}

describe('cancellation', () => {
  it('unwinds at once when the current work cannot be interrupted', async () => {
    // A model download or a generation that ignores its abort signal used
    // to hold the cancel until it finished: the watchdog raced the work
    // against its own timeout only, so a cancel during a 30 s download
    // looked like a button that does nothing.
    const calls = { disposed: 0 };
    let releaseLoad: () => void = () => {};
    const adapter = {
      ...makeMockLLMAdapter(),
      async load(): Promise<LoadedLLM> {
        // Ignores the signal on purpose: a fetch that cannot be aborted.
        await new Promise<void>((resolve) => {
          releaseLoad = resolve;
        });
        return {
          model: { modelId: 'wllama:x', provider: 'wllama', async doGenerate() { return { text: 'x', finishReason: 'stop' }; } },
          resolvedBackend: 'wasm',
          dispose: async () => {
            calls.disposed += 1;
          },
        } as unknown as LoadedLLM;
      },
    };
    const controller = new AbortController();
    const started = Date.now();
    const run = runBenchmarkSuite({
      suite: 'custom',
      cells: [{ model: MODEL_REF, workload: LLM_WORKLOADS[0] }],
      policy: TEST_POLICY,
      llmAdapters: new Map([[adapter.runtimeId, adapter]]),
      embedAdapters: new Map(),
      harness: HARNESS,
      skipFingerprint: true,
      abortSignal: controller.signal,
    });
    // Let the run reach the (stuck) load, then cancel.
    await new Promise((r) => setTimeout(r, 50));
    controller.abort(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    // The cancel returned without waiting for the download that never ended.
    expect(Date.now() - started).toBeLessThan(1_000);
    // The late-finishing work is discarded quietly (no unhandled rejection,
    // nothing recorded, the model released when it finally arrives).
    releaseLoad();
    await new Promise((r) => setTimeout(r, 20));
    expect(calls.disposed).toBe(1);
  });
});

describe('a runtime AbortError is not a cancel', () => {
  it('records an AbortError the runtime raised on its own as a cell error and keeps going', async () => {
    // Browsers abort fetches on their own (memory pressure, a download the
    // network stack dropped), and runtimes raise AbortError from timeouts of
    // their own. The runner equated any AbortError with the submitter's
    // cancel, so a phone whose download was aborted mid-suite ended the
    // whole run as "Cancelled" and lost every finished cell.
    let calls = 0;
    const adapter = {
      ...makeMockLLMAdapter(),
      async load(): Promise<LoadedLLM> {
        calls += 1;
        throw Object.assign(new Error('The user aborted a request.'), { name: 'AbortError' });
      },
    };
    const result = await runBenchmarkSuite({
      suite: 'custom',
      cells: [{ model: MODEL_REF, workload: LLM_WORKLOADS[0] }],
      policy: TEST_POLICY,
      llmAdapters: new Map([[adapter.runtimeId, adapter]]),
      embedAdapters: new Map(),
      harness: HARNESS,
      skipFingerprint: true,
    });
    expect(result.cells).toHaveLength(1);
    expect(result.cells[0].status).toBe('error');
    expect(result.cells[0].error?.name).toBe('AbortError');
    expect(result.cells[0].attempts).toHaveLength(1);
    expect(calls).toBe(2);
  });
});

describe('hidden-tab recovery', () => {
  it('repeats an iteration the tab hid during, once the tab is visible again, and keeps the discarded one on record', async () => {
    const trace = drivenTrace();
    const adapter = makeMockLLMAdapter({ chunkDelayMs: 4, chunkCount: 4 });
    const original = adapter.load.bind(adapter);
    let streams = 0;
    adapter.load = async (...args): Promise<LoadedLLM> => {
      const loaded = await original(...args);
      const good = loaded.model;
      const observed = {
        ...good,
        async *doStream(options: { maxTokens?: number; abortSignal?: AbortSignal }) {
          streams += 1;
          // The tab goes to the background in the middle of the second timed
          // iteration (streams: 1 warmup, then timed 1, 2, ...) and comes back
          // shortly after it ends.
          if (streams === 3) {
            setTimeout(() => trace.setHidden(true), 6);
            setTimeout(() => trace.setHidden(false), 40);
          }
          yield* good.doStream!(options);
        },
      };
      return { ...loaded, model: observed as unknown as LoadedLLM['model'] };
    };
    const activity: string[] = [];
    const result = await runBenchmarkSuite({
      suite: 'custom',
      cells: [{ model: MODEL_REF, workload: LLM_WORKLOADS[0] }],
      policy: { ...TEST_POLICY, warmupRuns: 1, timedRuns: 3, visibilityWaitMs: 2_000 },
      llmAdapters: new Map([[adapter.runtimeId, adapter]]),
      embedAdapters: new Map(),
      harness: HARNESS,
      skipFingerprint: true,
      hooks: { onActivity: (a) => activity.push(a.phase) },
      trace: trace as never,
    });
    const cell = result.cells[0];
    expect(cell.status).toBe('ok');
    expect(cell.iterations).toHaveLength(3);
    for (const it of cell.iterations) expect(it.gates).toEqual([]);
    // The hidden iteration is kept, gated, outside the scored iterations.
    expect(cell.discardedIterations).toHaveLength(1);
    expect(cell.discardedIterations?.[0].gates).toContain('hidden-during-run');
    expect(streams).toBe(1 + 3 + 1);
    expect(result.events.some((e) => e.type === 'iteration-redo')).toBe(true);
    expect(activity).toContain('waiting-visible');
  });

  it('waits for a hidden tab before starting an iteration instead of measuring a doomed one', async () => {
    const trace = drivenTrace();
    trace.setHidden(true);
    setTimeout(() => trace.setHidden(false), 60);
    const adapter = makeMockLLMAdapter({ chunkDelayMs: 1, chunkCount: 3 });
    const result = await runBenchmarkSuite({
      suite: 'custom',
      cells: [{ model: MODEL_REF, workload: LLM_WORKLOADS[0] }],
      policy: { ...TEST_POLICY, warmupRuns: 0, timedRuns: 2, visibilityWaitMs: 2_000 },
      llmAdapters: new Map([[adapter.runtimeId, adapter]]),
      embedAdapters: new Map(),
      harness: HARNESS,
      skipFingerprint: true,
      trace: trace as never,
    });
    const cell = result.cells[0];
    expect(cell.status).toBe('ok');
    expect(cell.iterations.every((it) => it.gates.length === 0)).toBe(true);
    expect(cell.discardedIterations ?? []).toHaveLength(0);
  });

  it('gives up honestly when the tab stays hidden: the cell is invalid with the reason, not silently dropped', async () => {
    const trace = drivenTrace();
    trace.setHidden(true);
    const adapter = makeMockLLMAdapter({ chunkDelayMs: 1, chunkCount: 3 });
    const result = await runBenchmarkSuite({
      suite: 'custom',
      cells: [{ model: MODEL_REF, workload: LLM_WORKLOADS[0] }],
      policy: { ...TEST_POLICY, warmupRuns: 0, timedRuns: 2, visibilityWaitMs: 50 },
      llmAdapters: new Map([[adapter.runtimeId, adapter]]),
      embedAdapters: new Map(),
      harness: HARNESS,
      skipFingerprint: true,
      trace: trace as never,
    });
    const cell = result.cells[0];
    expect(cell.status).toBe('invalid');
    expect(cell.invalidReasons?.[0]).toMatch(/hidden/);
  });
});
