/**
 * tasks/1 additions without a version change: the fallback input-truncation
 * record on a task item (inside the digest), the two sets served only as full
 * lists, the secondary Transformers.js lane (`transformers-wasm-current`), and
 * a load span a system reports when it was created before the session
 * reached its cell.
 */
import { describe, expect, it } from 'vitest';
import {
  computeRunDigest,
  controlTasksError,
  createHarnessControl,
  runTaskSession,
  sha256HexSync,
  taskSystemOrder,
  validateRunShape,
  validateSubmission,
  type BenchRunResult,
  type LoadedTaskSystem,
  type TaskIteration,
  type TaskSystemAdapter,
} from '../src/index.js';
import { makeDetectRun, makeTaskRun, tasksRecord } from './fixtures/task-runs.js';

function withTruncation(run: BenchRunResult, cellIndex: number, fields: Partial<TaskIteration>): BenchRunResult {
  run.cells[cellIndex].iterations = (run.cells[cellIndex].iterations as TaskIteration[]).map((it) => ({ ...it, ...fields }));
  return run;
}

describe('the input-truncation record', () => {
  it('accepts a fallback item that names its token count, the model limit and whether the input was cut', () => {
    const run = withTruncation(makeTaskRun(), 1, { inputTruncated: true, inputTokens: 1323, modelMaxTokens: 1024 });
    withTruncation(run, 0, { inputTruncated: null, inputTokens: null, modelMaxTokens: null });
    expect(validateRunShape(run)).toEqual([]);
  });
  it('refuses a flag that disagrees with the counts, a partial record, and counts on a built-in item', () => {
    expect(validateRunShape(withTruncation(makeTaskRun(), 1, { inputTruncated: false, inputTokens: 1323, modelMaxTokens: 1024 })).join()).toMatch(/inputTruncated must be inputTokens > modelMaxTokens/);
    expect(validateRunShape(withTruncation(makeTaskRun(), 1, { inputTruncated: false, inputTokens: 12 })).join()).toMatch(/all three/);
    expect(validateRunShape(withTruncation(makeTaskRun(), 0, { inputTruncated: false, inputTokens: 12, modelMaxTokens: 1024 })).join()).toMatch(/null on a chrome-ai item/);
    expect(validateRunShape(withTruncation(makeDetectRun(), 1, { inputTruncated: false, inputTokens: 3, modelMaxTokens: 512 })).join()).toMatch(/null on a mediapipe item/);
  });
  it('is inside the digest', async () => {
    const a = withTruncation(makeTaskRun(), 1, { inputTruncated: false, inputTokens: 900, modelMaxTokens: 1024 });
    const b = withTruncation(makeTaskRun(), 1, { inputTruncated: false, inputTokens: 901, modelMaxTokens: 1024 });
    expect(await computeRunDigest(a)).not.toBe(await computeRunDigest(b));
  });
});

describe('sets and the secondary Transformers.js lane', () => {
  it('accepts cnndm-reserve for summarize and wili-test for detect-language', () => {
    expect(controlTasksError(createHarnessControl('chrome-ai-tasks', { tasks: tasksRecord({ set: 'cnndm-reserve', subset: 'full' }) }))).toBeUndefined();
    expect(() => createHarnessControl('chrome-ai-tasks', { tasks: tasksRecord({ set: 'wili-test' }) })).toThrow(/does not serve/);
  });
  it('orders the transformers-wasm-current arm after the primary fallback lanes', () => {
    expect(
      taskSystemOrder(['transformers-wasm-current/distilbart-cnn-6-6@q8', 'transformers-wasm/distilbart-cnn-6-6@fp32', 'chrome-ai/chrome-summarizer'], 'fixed'),
    ).toEqual(['chrome-ai/chrome-summarizer', 'transformers-wasm/distilbart-cnn-6-6@fp32', 'transformers-wasm-current/distilbart-cnn-6-6@q8']);
    const control = createHarnessControl('chrome-ai-tasks', {
      tasks: tasksRecord({ systemOrder: ['chrome-ai/chrome-summarizer', 'transformers-wasm/distilbart-cnn-6-6@fp32', 'transformers-wasm-current/distilbart-cnn-6-6@q8'] }),
    });
    expect(control.runtimeOrder).toEqual(['chrome-ai', 'transformers-wasm', 'transformers-wasm-current']);
  });
});

describe('runTaskSession() with a load span and a truncation record', () => {
  it('times a system created earlier by its own span and writes the truncation fields onto each item', async () => {
    const text = 'An article.';
    const items = [{ id: 'cnn/0', text, sha256: sha256HexSync(text) }];
    const createdAt = performance.now();
    const loaded = (truncation: unknown): LoadedTaskSystem => ({
      api: 'x',
      resolvedBackend: 'wasm',
      loadSpan: { startT: createdAt, endT: createdAt + 7 },
      async runItem() {
        return { mode: 'none', text: 'Summary.', truncation } as never;
      },
      async dispose() {},
    });
    const adapter = (truncation: unknown): TaskSystemAdapter => ({ load: async () => loaded(truncation) });
    const tasks = tasksRecord({ subset: 'pilot', phase: 'pilot', processCold: false, itemList: { id: 'p', count: 1, sha256: 'e'.repeat(64) } });
    const run = await runTaskSession({
      harness: { name: '@localmode/bench', version: '0.10.0', control: createHarnessControl('chrome-ai-tasks', { tasks }) },
      cells: [
        { model: { benchModelId: 'chrome-summarizer', runtimeId: 'chrome-ai', providerModelId: 'Summarizer', displayName: 'S', task: 'task' }, workloadId: 'summarize-cnndm-pilot', items },
        { model: { benchModelId: 'distilbart-cnn-6-6@q8', runtimeId: 'transformers-wasm', providerModelId: 'x', displayName: 'D', task: 'task' }, workloadId: 'summarize-cnndm-pilot', items },
      ],
      adapters: new Map([
        ['chrome-ai/chrome-summarizer', adapter(null)],
        ['transformers-wasm/distilbart-cnn-6-6@q8', adapter({ inputTruncated: false, inputTokens: 3, modelMaxTokens: 1024 })],
      ]),
      skipFingerprint: true,
      memorySampleTimeoutMs: 10,
    });
    expect(run.cells[0].load).toMatchObject({ startT: createdAt, endT: createdAt + 7 });
    expect(run.cells[0].iterations[0]).toMatchObject({ inputTruncated: null, inputTokens: null, modelMaxTokens: null });
    expect(run.cells[1].iterations[0]).toMatchObject({ inputTruncated: false, inputTokens: 3, modelMaxTokens: 1024 });
    expect(validateSubmission(run).shapeErrors).toEqual([]);
  });
});
