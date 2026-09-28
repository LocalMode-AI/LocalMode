/**
 * The series cool-down (`harness.series.cooldownMs`) and the idle time
 * measured before a run (`harness.series.idleBeforeMs`), and the Compute
 * Pressure summary runs.csv derives from the run's `pressure-change` events.
 * Both fields are optional and additive: validation accepts and bounds them,
 * the digest covers them like the rest of `harness`, and runs.csv exports
 * them beside the pressure fractions.
 */
import { describe, expect, it } from 'vitest';
import { computeRunDigest, verifyRunDigest } from '../src/canonical.js';
import { runsToRunsCSV } from '../src/aggregate.js';
import { pressureStateFractions } from '../src/pressure.js';
import { SERIES_MAX_COOLDOWN_MS, SERIES_MAX_IDLE_BEFORE_MS, validateRunShape } from '../src/validate.js';
import type { BenchRunResult, HarnessInfo, TraceEvent } from '../src/types.js';
import { makeRun } from './helpers.js';
import { makeAnalysisRun, makeSecondAnalysisRun } from './fixtures/analysis-runs.js';

const withSeries = (series: Record<string, unknown>): BenchRunResult => {
  const run = makeRun();
  return { ...run, harness: { ...run.harness, series } as unknown as HarnessInfo };
};

describe('harness.series.cooldownMs and idleBeforeMs validation', () => {
  it('accepts a run 1 with its cool-down and no idle time, and a later run with both', () => {
    expect(validateRunShape(withSeries({ id: 's', index: 1, count: 3, cooldownMs: 60_000 }))).toEqual([]);
    expect(
      validateRunShape(withSeries({ id: 's', index: 2, count: 3, cooldownMs: 60_000, idleBeforeMs: 61_734 })),
    ).toEqual([]);
    expect(validateRunShape(withSeries({ id: 's', index: 2, count: 3, cooldownMs: 0, idleBeforeMs: 0 }))).toEqual([]);
  });

  it('accepts the bounds themselves', () => {
    expect(
      validateRunShape(
        withSeries({ id: 's', index: 2, count: 2, cooldownMs: SERIES_MAX_COOLDOWN_MS, idleBeforeMs: SERIES_MAX_IDLE_BEFORE_MS }),
      ),
    ).toEqual([]);
    expect(SERIES_MAX_COOLDOWN_MS).toBe(3_600_000);
    expect(SERIES_MAX_IDLE_BEFORE_MS).toBe(2_592_000_000);
  });

  it.each([
    ['negative', -1],
    ['fractional', 1.5],
    ['over one hour', SERIES_MAX_COOLDOWN_MS + 1],
    ['a string', '60000'],
    ['null', null],
  ])('rejects a cooldownMs that is %s', (_label, cooldownMs) => {
    expect(validateRunShape(withSeries({ id: 's', index: 1, count: 2, cooldownMs }))).toEqual([
      'harness.series.cooldownMs must be an integer from 0 to 3600000',
    ]);
  });

  it.each([
    ['negative', -5],
    ['fractional', 60_000.5],
    ['over 30 days', SERIES_MAX_IDLE_BEFORE_MS + 1],
    ['a boolean', true],
  ])('rejects an idleBeforeMs that is %s', (_label, idleBeforeMs) => {
    expect(validateRunShape(withSeries({ id: 's', index: 2, count: 2, cooldownMs: 0, idleBeforeMs }))).toEqual([
      'harness.series.idleBeforeMs must be an integer from 0 to 2592000000',
    ]);
  });
});

describe('digest coverage', () => {
  it('covers cooldownMs and idleBeforeMs like the rest of harness', async () => {
    const run = withSeries({ id: 'series-a', index: 2, count: 3, cooldownMs: 60_000, idleBeforeMs: 62_000 });
    run.digest = await computeRunDigest(run);
    expect(await verifyRunDigest(run)).toBe(true);

    const series = run.harness.series!;
    const longerIdle = { ...run, harness: { ...run.harness, series: { ...series, idleBeforeMs: 90_000 } } };
    expect(await verifyRunDigest(longerIdle)).toBe(false);

    const otherCooldown = { ...run, harness: { ...run.harness, series: { ...series, cooldownMs: 0 } } };
    expect(await verifyRunDigest(otherCooldown)).toBe(false);

    const { idleBeforeMs: _dropped, ...withoutIdle } = series;
    expect(await verifyRunDigest({ ...run, harness: { ...run.harness, series: withoutIdle } })).toBe(false);
  });
});

const ev = (t: number, type: TraceEvent['type'], detail?: string): TraceEvent =>
  detail === undefined ? { t, type } : { t, type, detail };

describe('pressureStateFractions', () => {
  it('returns no fractions when the run has no pressure sample', () => {
    expect(pressureStateFractions([ev(0, 'suite-start'), ev(9_000, 'suite-end')])).toEqual({
      samples: 0,
      fractions: null,
    });
  });

  it('leaves the time before a sample that arrives mid-suite in no state', () => {
    const { samples, fractions } = pressureStateFractions([
      ev(1_000, 'suite-start'),
      ev(3_000, 'pressure-change', 'fair'),
      ev(4_000, 'cooldown-start'),
      ev(5_000, 'pressure-change', 'critical'),
      ev(6_000, 'pressure-change', 'nominal'),
      ev(11_000, 'suite-end'),
    ]);
    expect(samples).toBe(3);
    // 10 s suite: 2 s before the first sample, 2 s fair, 1 s critical, 5 s nominal.
    expect(fractions).toEqual({ nominal: 0.5, fair: 0.2, serious: 0, critical: 0.1 });
  });

  it('carries a single sample taken before suite-start over the whole suite', () => {
    expect(
      pressureStateFractions([ev(500, 'pressure-change', 'serious'), ev(1_000, 'suite-start'), ev(3_000, 'suite-end')]),
    ).toEqual({ samples: 1, fractions: { nominal: 0, fair: 0, serious: 1, critical: 0 } });
  });

  it('counts a single mid-suite sample from its timestamp to suite-end', () => {
    expect(
      pressureStateFractions([ev(1_000, 'suite-start'), ev(2_000, 'pressure-change', 'critical'), ev(3_000, 'suite-end')]),
    ).toEqual({ samples: 1, fractions: { nominal: 0, fair: 0, serious: 0, critical: 0.5 } });
  });

  it('sorts events by time and ignores changes at or after suite-end', () => {
    expect(
      pressureStateFractions([
        ev(3_000, 'suite-end'),
        ev(3_500, 'pressure-change', 'critical'),
        ev(2_000, 'pressure-change', 'fair'),
        ev(1_000, 'suite-start'),
        ev(1_000, 'pressure-change', 'nominal'),
      ]),
    ).toEqual({ samples: 3, fractions: { nominal: 0.5, fair: 0.5, serious: 0, critical: 0 } });
  });

  it('returns no fractions without a complete suite span, but still counts the samples', () => {
    expect(pressureStateFractions([ev(0, 'suite-start'), ev(10, 'pressure-change', 'fair')])).toEqual({
      samples: 1,
      fractions: null,
    });
  });
});

describe('runs.csv cool-down and pressure columns', () => {
  const lines = (csv: string) => csv.trimEnd().split('\n');
  const cell = (csv: string, rowIndex: number, name: string) => {
    const [head, ...rows] = lines(csv);
    return rows[rowIndex].split(',')[head.split(',').indexOf(name)];
  };

  it('exports the cool-down, the idle time and the pressure fractions', () => {
    const run = makeAnalysisRun();
    run.harness = { ...run.harness, series: { id: 'series-7f3a', index: 2, count: 10, cooldownMs: 60_000, idleBeforeMs: 61_734 } };
    run.events = [
      ev(0, 'suite-start'),
      ev(3_000, 'pressure-change', 'fair'),
      ev(30_000, 'pressure-change', 'critical'),
      ev(33_000, 'pressure-change', 'serious'),
      ev(40_000, 'pressure-change', 'nominal'),
      ev(90_000.5, 'suite-end'),
    ];
    const csv = runsToRunsCSV([run, makeSecondAnalysisRun()]);
    expect(cell(csv, 0, 'seriesCooldownMs')).toBe('60000');
    expect(cell(csv, 0, 'seriesIdleBeforeMs')).toBe('61734');
    expect(cell(csv, 0, 'pressureSamples')).toBe('4');
    // 90,000.5 ms suite: 27 s fair, 3 s critical, 7 s serious, 50,000.5 ms nominal.
    expect(cell(csv, 0, 'pressureCriticalFraction')).toBe('0.0333');
    expect(cell(csv, 0, 'pressureSeriousFraction')).toBe('0.0778');
    expect(cell(csv, 0, 'pressureFairFraction')).toBe('0.3');
    expect(cell(csv, 0, 'pressureNominalFraction')).toBe('0.5556');

    // The second run: no series, no pressure sample, no suite-end.
    for (const name of [
      'seriesCooldownMs', 'seriesIdleBeforeMs', 'pressureCriticalFraction', 'pressureSeriousFraction',
      'pressureFairFraction', 'pressureNominalFraction',
    ]) {
      expect(cell(csv, 1, name)).toBe('');
    }
    expect(cell(csv, 1, 'pressureSamples')).toBe('0');
  });

  it('leaves the idle time empty on run 1 of a series and keeps a zero cool-down', () => {
    const run = makeAnalysisRun();
    run.harness = { ...run.harness, series: { id: 's', index: 1, count: 2, cooldownMs: 0 } };
    const csv = runsToRunsCSV([run]);
    expect(cell(csv, 0, 'seriesCooldownMs')).toBe('0');
    expect(cell(csv, 0, 'seriesIdleBeforeMs')).toBe('');
  });
});
