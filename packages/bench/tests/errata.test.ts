/**
 * Per-cell errata: listed cells are excluded from aggregation and counted,
 * never re-scored; a malformed list, or one naming a run or cell the dataset
 * does not hold, is refused.
 */

import { describe, expect, it } from 'vitest';
import {
  aggregateRuns,
  aggregateRunsWithErrata,
  createHarnessControl,
  errataExclusions,
  rowsToCSV,
  validateErrata,
  validateErrataShape,
  type ErratumEntry,
  type LeaderboardRow,
} from '../src/index.js';
import { MMLU_CELL_ID, errataRuns, runWithMmlu } from './fixtures/errata-runs.js';

const ERRATUM: ErratumEntry = {
  runId: 'errata-run-replaced',
  cellIds: [MMLU_CELL_ID],
  reason: 'loaded the replaced model file: score 0 at parse rate 0 is the empty prompt, not a fidelity reading',
  recordedAt: '2026-10-22',
  reference: 'README.md, Erratum, LiteRT Qwen3 model file',
};

const mmluRow = (rows: LeaderboardRow[]) => {
  const found = rows.filter((r) => r.workloadId === 'quality-mmlu-25');
  expect(found).toHaveLength(1);
  return found[0];
};

describe('aggregateRuns() with errata', () => {
  it('without errata the erratum cell enters the quality median (the defect the errata fix)', () => {
    const row = mmluRow(aggregateRuns(errataRuns()));
    expect(row.submissions).toBe(3);
    expect(row.qualityScore).toBe(0.4);
    expect(row.qualityParseRate).toBe(0.96);
    expect(row.excludedByErratum).toBe(0);
  });

  it('an erratum entry changes the quality median and n, and the row counts the excluded cell', () => {
    const row = mmluRow(aggregateRuns(errataRuns(), undefined, [ERRATUM]));
    expect(row.submissions).toBe(2);
    expect(row.qualityScore).toBe(0.44);
    expect(row.qualityParseRate).toBe(0.98);
    expect(row.excludedByErratum).toBe(1);
  });

  it('reports the total tally, and leaves every other row byte-identical', () => {
    const before = aggregateRunsWithErrata(errataRuns());
    const after = aggregateRunsWithErrata(errataRuns(), { errata: [ERRATUM] });
    expect(before.excludedByErratum).toEqual({ cells: 0, runs: 0 });
    expect(after.excludedByErratum).toEqual({ cells: 1, runs: 1 });
    const others = (rows: LeaderboardRow[]) => rows.filter((r) => r.workloadId !== 'quality-mmlu-25');
    expect(others(after.rows)).toEqual(others(before.rows));
    expect(after.rows).toHaveLength(before.rows.length);
  });

  it('keeps a row whose every cell is excluded, with zero submissions and its count', () => {
    const runs = [runWithMmlu('only-replaced-1', 0, 0), runWithMmlu('only-replaced-2', 0, 0)];
    const errata: ErratumEntry[] = runs.map((r) => ({ ...ERRATUM, runId: r.runId }));
    const { rows, excludedByErratum } = aggregateRunsWithErrata(runs, { errata });
    const row = mmluRow(rows);
    expect(row.submissions).toBe(0);
    expect(row.qualityScore).toBeUndefined();
    expect(row.qualityParseRate).toBeUndefined();
    expect(row.provisional).toBe(true);
    expect(row.excludedByErratum).toBe(2);
    expect(excludedByErratum).toEqual({ cells: 2, runs: 2 });
  });

  it('does not count a listed cell of a control run, which enters no aggregate anyway', () => {
    const runs = errataRuns();
    runs[2].harness.control = createHarnessControl('fixed-order');
    const { rows, excludedByErratum } = aggregateRunsWithErrata(runs, { errata: [ERRATUM] });
    expect(excludedByErratum).toEqual({ cells: 0, runs: 0 });
    expect(mmluRow(rows).excludedByErratum).toBe(0);
    expect(mmluRow(rows).submissions).toBe(2);
  });

  it('rowsToCSV appends excludedByErratum as the last column', () => {
    const csv = rowsToCSV(aggregateRuns(errataRuns(), undefined, [ERRATUM])).trimEnd().split('\n');
    expect(csv[0].endsWith(',provisional,excludedByErratum')).toBe(true);
    const line = csv.find((l) => l.includes(',quality-mmlu-25,'));
    expect(line).toBeDefined();
    expect(line!.split(',').at(-1)).toBe('1');
  });
});

describe('errataExclusions()', () => {
  it('looks up listed (runId, cellId) pairs only', () => {
    const ex = errataExclusions([ERRATUM]);
    expect(ex.size).toBe(1);
    expect(ex.has('errata-run-replaced', MMLU_CELL_ID)).toBe(true);
    expect(ex.has('errata-run-good-1', MMLU_CELL_ID)).toBe(false);
    expect(ex.has('errata-run-replaced', 'litert/qwen3-0.6b/chat-pp128-tg128')).toBe(false);
    expect(errataExclusions().size).toBe(0);
  });
});

describe('validateErrataShape()', () => {
  it('accepts a well-formed list (and an empty one)', () => {
    expect(validateErrataShape([ERRATUM])).toEqual([]);
    expect(validateErrataShape([{ ...ERRATUM, recordedAt: '2026-10-22T05:00:00Z' }])).toEqual([]);
    expect(validateErrataShape([])).toEqual([]);
  });

  it.each([
    ['not an array', { entries: [ERRATUM] }, /not a JSON array/],
    ['an entry that is not an object', ['x'], /errata\[0\]: not an object/],
    ['a missing reason', [{ ...ERRATUM, reason: undefined }], /reason: must be a non-empty string/],
    ['a blank reason', [{ ...ERRATUM, reason: '  ' }], /reason: must be a non-empty string/],
    ['a missing reference', [{ ...ERRATUM, reference: '' }], /reference: must be a non-empty string/],
    ['a missing runId', [{ ...ERRATUM, runId: undefined }], /runId: must be a non-empty string/],
    ['a non-ISO recordedAt', [{ ...ERRATUM, recordedAt: '22 Oct 2026' }], /recordedAt: must be an ISO 8601/],
    ['an impossible date', [{ ...ERRATUM, recordedAt: '2026-13-45' }], /recordedAt: must be an ISO 8601/],
    ['empty cellIds', [{ ...ERRATUM, cellIds: [] }], /cellIds: must be a non-empty array/],
    ['a non-string cell id', [{ ...ERRATUM, cellIds: [42] }], /cellIds\[0\]: must be a non-empty string/],
    ['an unknown field (a score override)', [{ ...ERRATUM, qualityScore: 0.5 }], /unknown field "qualityScore"/],
    ['a cell listed twice', [ERRATUM, { ...ERRATUM }], /listed more than once/],
  ])('rejects %s', (_label, value, message) => {
    const errors = validateErrataShape(value);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join('\n')).toMatch(message);
  });
});

describe('validateErrata() against the dataset', () => {
  const runs = errataRuns();

  it('accepts entries that name ok cells of runs in the dataset', () => {
    expect(validateErrata([ERRATUM], runs)).toEqual([]);
  });

  it('refuses a run that is not in the dataset', () => {
    expect(validateErrata([{ ...ERRATUM, runId: 'no-such-run-0000' }], runs)).toEqual([
      'errata[0]: run no-such-run-0000 is not in the dataset',
    ]);
  });

  it('refuses a cell the run does not have', () => {
    expect(validateErrata([{ ...ERRATUM, cellIds: ['litert/qwen3-0.6b/quality-mmlu-99'] }], runs)).toEqual([
      'errata[0].cellIds[0]: run errata-run-replaced has no cell litert/qwen3-0.6b/quality-mmlu-99',
    ]);
  });

  it('refuses a cell that is not ok (it enters no aggregate, so it needs no entry)', () => {
    const errors = validateErrata([{ ...ERRATUM, cellIds: ['litert/qwen3-0.6b/chat-pp128-tg128'] }], runs);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/is invalid, which enters no aggregate; an erratum names only ok cells/);
  });

  it('returns the shape errors first for a malformed list', () => {
    expect(validateErrata({}, runs)).toEqual(['errata: not a JSON array']);
  });

  it('treats a status-less cell (an index entry cell) as ok', () => {
    expect(validateErrata([ERRATUM], [{ runId: ERRATUM.runId, cells: [{ cellId: MMLU_CELL_ID }] }])).toEqual([]);
  });
});
