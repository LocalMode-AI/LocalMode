/**
 * The publication scrub: the one rule for what a public run file may carry,
 * applied by the server on submission and by the dataset tool on files
 * published under earlier schemas.
 */
import { describe, expect, it } from 'vitest';
import { scrubRunForPublication } from '../src/publication.js';
import { coarseBatteryLevel } from '../src/env.js';
import { BENCH_SCHEMA_VERSION } from '../src/types.js';
import type { BenchRunResult } from '../src/types.js';
import { makeRun } from './helpers.js';

function schema2Run(): BenchRunResult {
  const run = makeRun({ nonce: '1790000000000.abcdef' });
  run.schemaVersion = 2;
  const env = run.environment as unknown as Record<string, unknown>;
  env.locale = { timeZone: 'America/Chicago', timeZoneOffsetMinutes: 300, locale: 'en-US', calendar: 'gregory' };
  env.languages = ['en-US', 'en'];
  env.power = { batterySupported: true, charging: true, level: 0.34, chargingTimeSec: 3951, dischargingTimeSec: undefined };
  env.display = { width: 750, height: 832, dpr: 2.625, prefersReducedMotion: false, prefersColorScheme: 'dark' };
  return run;
}

describe('scrubRunForPublication()', () => {
  it('removes the location, tracking, and preference signals and the nonce, and raises the schema', () => {
    const before = schema2Run();
    const { run, changed, removed } = scrubRunForPublication(before);
    expect(changed).toBe(true);
    expect(run.nonce).toBeUndefined();
    const env = run.environment as unknown as Record<string, Record<string, unknown>>;
    expect(env.locale).toEqual({ locale: 'en-US' });
    expect('languages' in env).toBe(false);
    expect(env.power).toEqual({ batterySupported: true, charging: true, level: 0.25 });
    expect(env.display).toEqual({ width: 750, height: 832, dpr: 2.625 });
    expect(run.schemaVersion).toBe(BENCH_SCHEMA_VERSION);
    expect(removed).toEqual([
      'nonce',
      'environment.locale.timeZone',
      'environment.locale.timeZoneOffsetMinutes',
      'environment.locale.calendar',
      'environment.languages',
      'environment.power.chargingTimeSec',
      'environment.power.dischargingTimeSec',
      'environment.power.level (coarsened)',
      'environment.display.prefersReducedMotion',
      'environment.display.prefersColorScheme',
      'schemaVersion (raised)',
    ]);
    // The input is not mutated.
    expect(before.nonce).toBe('1790000000000.abcdef');
    expect((before.environment as unknown as Record<string, Record<string, unknown>>).locale.timeZone).toBe('America/Chicago');
  });

  it('is a no-op on a run that already carries only what is allowed', () => {
    const clean = scrubRunForPublication(schema2Run()).run;
    const again = scrubRunForPublication(clean);
    expect(again.changed).toBe(false);
    expect(again.removed).toEqual([]);
    expect(again.run).toEqual(clean);
  });

  it('strips the nonce from a clean submission without counting it as a change', () => {
    // Every submission carries a nonce; the digest never covers it, so the
    // client's digest stays valid on the published file.
    const { run, changed, removed } = scrubRunForPublication(makeRun({ nonce: '1790000000000.abcdef' }));
    expect(run.nonce).toBeUndefined();
    expect(changed).toBe(false);
    expect(removed).toEqual(['nonce']);
  });

  it('keeps what the dataset is for: device model, GPU, browser, screen size, runtime configuration', () => {
    const { run } = scrubRunForPublication(schema2Run());
    const env = run.environment as unknown as Record<string, unknown>;
    expect(env.browser).toBeDefined();
    expect(env.gpu).toBeDefined();
    expect((env.display as Record<string, unknown>).width).toBe(750);
    expect(run.cells).toHaveLength(1);
  });
});

describe('coarseBatteryLevel()', () => {
  it('rounds to quarters and drops non-numbers', () => {
    expect(coarseBatteryLevel(0.34)).toBe(0.25);
    expect(coarseBatteryLevel(0.87)).toBe(0.75);
    expect(coarseBatteryLevel(0.9)).toBe(1);
    expect(coarseBatteryLevel(0)).toBe(0);
    expect(coarseBatteryLevel(1)).toBe(1);
    expect(coarseBatteryLevel(Number.NaN)).toBeUndefined();
    expect(coarseBatteryLevel(undefined)).toBeUndefined();
  });
});
