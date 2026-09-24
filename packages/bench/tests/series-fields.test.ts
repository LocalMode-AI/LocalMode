/**
 * Series membership and cold mode on `harness`: `harness.series` names the
 * run's place in a consecutive series (one fresh page load per run) and
 * `harness.coldStart` records that the run began right after the page cleared
 * the provider model caches. Both are optional and additive; validation
 * accepts them, rejects malformed values, the digest covers them like the
 * rest of `harness`, and runs.csv exports them.
 */
import { describe, expect, it } from 'vitest';
import { computeRunDigest, verifyRunDigest } from '../src/canonical.js';
import { runsToRunsCSV } from '../src/aggregate.js';
import { validateRunShape, validateSubmission } from '../src/validate.js';
import type { BenchRunResult, HarnessInfo } from '../src/types.js';
import { makeRun } from './helpers.js';
import { makeAnalysisRun, makeSecondAnalysisRun } from './fixtures/analysis-runs.js';

const withHarness = (patch: Record<string, unknown>): BenchRunResult => {
  const run = makeRun();
  return { ...run, harness: { ...run.harness, ...patch } as HarnessInfo };
};

describe('harness.series and harness.coldStart validation', () => {
  it('accepts a well-formed series and the cold-start marker', () => {
    const run = withHarness({
      series: { id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', index: 2, count: 30 },
      coldStart: 'provider-caches-cleared',
    });
    expect(validateRunShape(run)).toEqual([]);
    expect(validateSubmission(run).shapeErrors).toEqual([]);
  });

  it('accepts a run that carries neither field', () => {
    expect(validateRunShape(makeRun())).toEqual([]);
  });

  it.each([
    ['not an object', 'series-1'],
    ['missing id', { index: 1, count: 2 }],
    ['empty id', { id: '', index: 1, count: 2 }],
    ['id over 64 chars', { id: 'x'.repeat(65), index: 1, count: 2 }],
    ['non-integer index', { id: 's', index: 1.5, count: 2 }],
    ['zero index', { id: 's', index: 0, count: 2 }],
    ['index past count', { id: 's', index: 3, count: 2 }],
    ['zero count', { id: 's', index: 1, count: 0 }],
    ['count over 1000', { id: 's', index: 1, count: 1001 }],
    ['string count', { id: 's', index: 1, count: '2' }],
  ])('rejects a malformed series (%s)', (_label, series) => {
    const errors = validateRunShape(withHarness({ series }));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^harness\.series/);
  });

  it.each([['cold'], [true], ['fresh-profile'], [null]])('rejects coldStart %j', (coldStart) => {
    const errors = validateRunShape(withHarness({ coldStart }));
    expect(errors).toEqual(['harness.coldStart must be "provider-caches-cleared" when present']);
  });
});

describe('digest coverage', () => {
  it('covers harness.series and harness.coldStart like the rest of harness', async () => {
    const run = withHarness({ series: { id: 'series-a', index: 1, count: 3 }, coldStart: 'provider-caches-cleared' });
    run.digest = await computeRunDigest(run);
    expect(await verifyRunDigest(run)).toBe(true);

    const movedIndex = { ...run, harness: { ...run.harness, series: { id: 'series-a', index: 2, count: 3 } } };
    expect(await verifyRunDigest(movedIndex)).toBe(false);

    const { coldStart: _dropped, ...warmHarness } = run.harness;
    const droppedCold = { ...run, harness: warmHarness };
    expect(await verifyRunDigest(droppedCold)).toBe(false);
  });
});

describe('runs.csv series columns', () => {
  const header = (csv: string) => csv.split('\n')[0].split(',');
  const row = (csv: string, i: number) => csv.split('\n')[i].split(',');

  it('places seriesId, seriesIndex, seriesCount and coldStart after validationFlags, before the rv_* columns', () => {
    const cols = header(runsToRunsCSV([makeAnalysisRun()]));
    const at = cols.indexOf('validationFlags');
    expect(cols.slice(at + 1, at + 5)).toEqual(['seriesId', 'seriesIndex', 'seriesCount', 'coldStart']);
    expect(cols[at + 5]).toMatch(/^rv_/);
  });

  it('exports the values of a series run and leaves them empty on a run outside a series', () => {
    const inSeries = makeAnalysisRun();
    inSeries.harness = {
      ...inSeries.harness,
      series: { id: 'series-7f3a', index: 4, count: 30 },
      coldStart: 'provider-caches-cleared',
    };
    const csv = runsToRunsCSV([inSeries, makeSecondAnalysisRun()]);
    const cols = header(csv);
    const get = (i: number, name: string) => row(csv, i)[cols.indexOf(name)];
    expect(get(1, 'seriesId')).toBe('series-7f3a');
    expect(get(1, 'seriesIndex')).toBe('4');
    expect(get(1, 'seriesCount')).toBe('30');
    expect(get(1, 'coldStart')).toBe('provider-caches-cleared');
    for (const name of ['seriesId', 'seriesIndex', 'seriesCount', 'coldStart']) expect(get(2, name)).toBe('');
  });
});
