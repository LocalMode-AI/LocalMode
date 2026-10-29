/**
 * A pilot-sizing session whose built-in arm lost cells at create: the item
 * count of `itemList.limitedTo` is checked per workload against the cells
 * that completed it, so an error cell (0 items) is data, never a shape error,
 * while a cell that ran fewer items than its workload without an error still
 * fails. The fixture is reduced from a real translate session (24 directions,
 * 10 items each; 21 of the 24 Translator cells failed at create): the q8
 * arm, the driver captures and the summaries are dropped, and every source
 * and output text is replaced by a synthetic one.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeRunDigest, validateRunShape, validateSubmission, type BenchRunResult, type TaskIteration } from '../src/index.js';

const FIXTURE = join(__dirname, 'fixtures', 'task-pilot-sizing-error-cells.json');
const load = (): BenchRunResult => JSON.parse(readFileSync(FIXTURE, 'utf8')) as BenchRunResult;
const cellOf = (run: BenchRunResult, id: string) => {
  const cell = run.cells.find((c) => c.cellId === id);
  if (!cell) throw new Error(`fixture has no cell ${id}`);
  return cell;
};

describe('itemList.limitedTo with error cells', () => {
  it('the fixture is the session as recorded: 21 error cells with no item, 3 Translator cells and 24 fallback cells of 10 items', () => {
    const run = load();
    expect(run.harness.control!.tasks!.itemList.limitedTo).toMatchObject({ count: 240, perDirection: 10 });
    const translator = run.cells.filter((c) => c.model.benchModelId === 'chrome-translator');
    expect(translator.filter((c) => c.status === 'error' && c.iterations.length === 0)).toHaveLength(21);
    expect(translator.filter((c) => c.status === 'ok').map((c) => c.iterations.length)).toEqual([10, 10, 10]);
    expect(run.cells.filter((c) => c.runtimeId === 'transformers-wasm').map((c) => c.iterations.length)).toEqual(Array(24).fill(10));
  });

  it('accepts the session: an error cell counts as 0 items and the planned count comes from the cells that completed its workload', async () => {
    const run = load();
    expect(validateRunShape(run)).toEqual([]);
    run.digest = await computeRunDigest(run);
    const report = validateSubmission(run);
    expect(report.shapeErrors).toEqual([]);
    expect((report.flags ?? []).filter((f) => f.severity === 'reject')).toEqual([]);
  });

  it('refuses a cell that ran fewer items than its workload without an error', () => {
    const run = load();
    const cell = cellOf(run, 'chrome-ai/chrome-translator/translate-en-de-S');
    expect(cell.status).toBe('ok');
    cell.iterations = (cell.iterations as TaskIteration[]).slice(0, 9);
    expect(validateRunShape(run)).toEqual([
      'cells: cells of workload translate-en-de-S ran different item counts without an error: chrome-ai/chrome-translator/translate-en-de-S ran 9, transformers-wasm/opus-mt-en-de@fp32/translate-en-de-S ran 10',
    ]);
  });

  it('refuses a workload every cell of which ran short without an error', () => {
    const run = load();
    for (const cell of run.cells.filter((c) => c.workloadId === 'translate-en-fr-S')) {
      expect(cell.status).toBe('ok');
      cell.iterations = (cell.iterations as TaskIteration[]).slice(0, 9);
    }
    expect(validateRunShape(run)).toEqual(['cells: the workloads ran 239 items; itemList.limitedTo.count is 240']);
  });

  it('refuses an error cell that ran more items than its workload', () => {
    const run = load();
    const failed = cellOf(run, 'chrome-ai/chrome-translator/translate-en-es-S');
    expect(failed.status).toBe('error');
    // Eleven Translator items for the en-es workload, whose fallback cell ran 10.
    const donor = cellOf(run, 'chrome-ai/chrome-translator/translate-en-de-S').iterations as TaskIteration[];
    failed.iterations = [...donor, { ...donor[0], index: 10 }].map((it, i) => ({ ...it, index: i, itemId: `extra/${i}/en-es` }));
    expect(validateRunShape(run)).toEqual(['cells: error cell chrome-ai/chrome-translator/translate-en-es-S ran 11 items, more than the 10 of its workload']);
  });
});
