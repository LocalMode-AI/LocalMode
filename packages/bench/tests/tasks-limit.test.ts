/**
 * Pilot-sizing sessions: the first n items of a pinned list (or n per
 * translation direction), recorded as `itemList.limitedTo` beside the full
 * list's count and digest, only with the `pilot-sizing` phase.
 */
import { describe, expect, it } from 'vitest';
import { validateRunShape, type BenchRunResult, type TaskIteration } from '../src/index.js';
import { makeTaskRun } from './fixtures/task-runs.js';

const limited = (limitedTo: unknown, phase = 'pilot-sizing', keep = 2): BenchRunResult => {
  const run = makeTaskRun();
  const tasks = run.harness.control!.tasks! as unknown as Record<string, unknown>;
  tasks.phase = phase;
  (tasks.itemList as Record<string, unknown>).limitedTo = limitedTo;
  for (const cell of run.cells) cell.iterations = (cell.iterations as TaskIteration[]).slice(0, keep);
  return run;
};

describe('itemList.limitedTo', () => {
  it('accepts a pilot-sizing run of the first items with the full list digest kept', () => {
    expect(validateRunShape(limited({ count: 2, sha256: 'c'.repeat(64), limit: 2 }))).toEqual([]);
    expect(validateRunShape(limited({ count: 2, sha256: 'c'.repeat(64), perDirection: 1 }))).toEqual([]);
  });
  it('refuses a limit outside pilot-sizing, pilot-sizing without a limit, and a malformed limit', () => {
    expect(validateRunShape(limited({ count: 2, sha256: 'c'.repeat(64), limit: 2 }, 'latency')).join()).toMatch(/limitedTo is set only on a pilot-sizing session/);
    const run = makeTaskRun();
    (run.harness.control!.tasks! as unknown as Record<string, unknown>).phase = 'pilot-sizing';
    expect(validateRunShape(run).join()).toMatch(/pilot-sizing session needs itemList.limitedTo/);
    expect(validateRunShape(limited({ count: 2, sha256: 'c'.repeat(64) })).join()).toMatch(/limit or perDirection/);
    expect(validateRunShape(limited({ count: 4, sha256: 'c'.repeat(64), limit: 4 }, 'pilot-sizing', 3)).join()).toMatch(/at most itemList.count/);
  });
  it('refuses an arm that ran more or fewer items than the limit', () => {
    expect(validateRunShape(limited({ count: 2, sha256: 'c'.repeat(64), limit: 2 }, 'pilot-sizing', 3)).join()).toMatch(/limitedTo.count is 2/);
    expect(validateRunShape(limited({ count: 2, sha256: 'c'.repeat(64), limit: 2 }, 'pilot-sizing', 1)).join()).toMatch(/limitedTo.count is 2/);
  });
});
