/**
 * Self-reported hardware on `environment.userReportedHardware`: the GPU name,
 * chassis, RAM and other-programs answers a paid-study participant gives on
 * the page. Optional and additive; validation accepts it and rejects malformed
 * values, the digest covers it like the rest of `environment`, the publication
 * scrub normalizes the GPU name, and runs.csv exports it after `powerLevel`.
 */
import { describe, expect, it } from 'vitest';
import { computeRunDigest, verifyRunDigest } from '../src/canonical.js';
import { runsToRunsCSV } from '../src/aggregate.js';
import { sanitizeReportedGpu, scrubRunForPublication } from '../src/publication.js';
import { REPORTED_GPU_MAX_LENGTH, REPORTED_RAM_MAX_GB, validateRunShape, validateSubmission } from '../src/validate.js';
import type { BenchRunResult, UserReportedHardware } from '../src/types.js';
import { makeRun } from './helpers.js';
import { makeAnalysisRun, makeSecondAnalysisRun } from './fixtures/analysis-runs.js';

const withHardware = (hardware: unknown): BenchRunResult => {
  const run = makeRun();
  return { ...run, environment: { ...run.environment, userReportedHardware: hardware as UserReportedHardware } };
};

const FULL: UserReportedHardware = {
  gpu: 'NVIDIA GeForce RTX 4060 Laptop GPU',
  chassis: 'laptop',
  ramGB: 16,
  otherAppsRunning: false,
};

describe('environment.userReportedHardware validation', () => {
  it('accepts a full answer set, a partial one, and "Not sure" RAM', () => {
    expect(validateRunShape(withHardware(FULL))).toEqual([]);
    expect(validateSubmission(withHardware(FULL)).shapeErrors).toEqual([]);
    expect(validateRunShape(withHardware({ gpu: 'Apple M2' }))).toEqual([]);
    expect(validateRunShape(withHardware({ chassis: 'desktop', ramGB: null }))).toEqual([]);
    expect(validateRunShape(withHardware({ chassis: 'other', ramGB: REPORTED_RAM_MAX_GB, otherAppsRunning: true }))).toEqual([]);
    expect(validateRunShape(withHardware({ gpu: 'x'.repeat(REPORTED_GPU_MAX_LENGTH) }))).toEqual([]);
    // The length bound applies after trimming.
    expect(validateRunShape(withHardware({ gpu: `  ${'x'.repeat(REPORTED_GPU_MAX_LENGTH)}  ` }))).toEqual([]);
  });

  it('accepts a run that does not carry the field', () => {
    expect(validateRunShape(makeRun())).toEqual([]);
  });

  it.each([
    ['a string', 'RTX 4060'],
    ['null', null],
    ['an array', ['RTX 4060']],
  ])('rejects a field that is %s', (_label, hardware) => {
    expect(validateRunShape(withHardware(hardware))).toEqual([
      'environment.userReportedHardware must be an object {gpu?, chassis?, ramGB?, otherAppsRunning?}',
    ]);
  });

  const GPU_ERROR =
    'environment.userReportedHardware.gpu must be a string of 1 to 64 characters after trimming, without control characters';
  it.each([
    ['empty', ''],
    ['whitespace only', '   '],
    ['65 characters', 'x'.repeat(65)],
    ['a number', 4060],
    ['null', null],
    ['a newline', 'RTX\n4060'],
    ['a tab', 'RTX\t4060'],
    ['a NUL', 'RTX\u00004060'],
    ['DEL', 'RTX\u007f4060'],
    ['a C1 control', 'RTX\u00854060'],
    ['a bidi override', 'RTX ‮0604'],
    ['a bidi isolate', 'RTX ⁦4060'],
  ])('rejects a gpu that is %s', (_label, gpu) => {
    expect(validateRunShape(withHardware({ gpu }))).toEqual([GPU_ERROR]);
  });

  it.each([['notebook'], ['Laptop'], [''], [null], [1]])('rejects chassis %j', (chassis) => {
    expect(validateRunShape(withHardware({ chassis }))).toEqual([
      'environment.userReportedHardware.chassis must be laptop|desktop|other',
    ]);
  });

  it.each([[0], [-8], [1025], [15.5], ['16'], [Number.NaN], [true]])('rejects ramGB %j', (ramGB) => {
    expect(validateRunShape(withHardware({ ramGB }))).toEqual([
      'environment.userReportedHardware.ramGB must be an integer from 1 to 1024, or null',
    ]);
  });

  it.each([['yes'], [1], [null]])('rejects otherAppsRunning %j', (otherAppsRunning) => {
    expect(validateRunShape(withHardware({ otherAppsRunning }))).toEqual([
      'environment.userReportedHardware.otherAppsRunning must be a boolean',
    ]);
  });

  it('reports every malformed answer, one error each', () => {
    const errors = validateRunShape(withHardware({ gpu: '', chassis: 'tower', ramGB: 0, otherAppsRunning: 'no' }));
    expect(errors).toHaveLength(4);
    for (const e of errors) expect(e).toMatch(/^environment\.userReportedHardware\./);
  });
});

describe('digest coverage', () => {
  it('covers environment.userReportedHardware like the rest of environment', async () => {
    const run = withHardware(FULL);
    run.digest = await computeRunDigest(run);
    expect(await verifyRunDigest(run)).toBe(true);

    const otherGpu = { ...run, environment: { ...run.environment, userReportedHardware: { ...FULL, gpu: 'Apple M4' } } };
    expect(await verifyRunDigest(otherGpu)).toBe(false);

    const { userReportedHardware: _dropped, ...withoutHardware } = run.environment;
    expect(await verifyRunDigest({ ...run, environment: withoutHardware })).toBe(false);
  });
});

describe('publication scrub', () => {
  it('normalizes the GPU name: control characters out, whitespace collapsed, trimmed, capped at 64', () => {
    expect(sanitizeReportedGpu('  NVIDIA   GeForce\tRTX 4060 ')).toBe('NVIDIA GeForce RTX 4060');
    expect(sanitizeReportedGpu('AMD\u0000Radeon‮ 780M')).toBe('AMD Radeon 780M');
    expect(sanitizeReportedGpu('\n\t ')).toBe('');
    const long = sanitizeReportedGpu(`Intel ${'y'.repeat(100)}`);
    expect(long).toHaveLength(64);
    expect(long.startsWith('Intel y')).toBe(true);
    // A cut that lands after a space leaves no trailing space.
    expect(sanitizeReportedGpu(`${'a'.repeat(63)} b`)).toBe('a'.repeat(63));
  });

  it.each([
    ['a Windows computer name glued to the clock speed', 'Processador Intel(R) Core(TM) i5-3330S CPU @ 2.7DESKTOP-A1B2C3D', 'Processador Intel(R) Core(TM) i5-3330S CPU @ 2.7'],
    ['a laptop computer name', 'Intel Iris Xe Graphics LAPTOP-AB12CD3', 'Intel Iris Xe Graphics'],
    ['a lowercase computer name with digits', 'desktop-a1b2c3d GTX 1650', 'GTX 1650'],
    ['a Windows Server computer name', 'WIN-ABCDEFGH123 Intel HD Graphics', 'Intel HD Graphics'],
    ['a renamed computer', 'RTX 3060 (OFFICEPC-7F3K2Q)', 'RTX 3060'],
    ['an email address', 'AMD Radeon 780M jane.doe+bench@example.co.uk', 'AMD Radeon 780M'],
    ['a URL with a scheme', 'https://example.com/specs?id=42 Apple M2', 'Apple M2'],
    ['a bare www host', 'www.example.com Apple M2', 'Apple M2'],
    ['only a computer name', 'DESKTOP-A1B2C3D', ''],
  ])('removes %s', (_label, typed, published) => {
    expect(sanitizeReportedGpu(typed)).toBe(published);
    // Idempotent: a published name passes through unchanged.
    expect(sanitizeReportedGpu(published)).toBe(published);
  });

  it.each([
    'NVIDIA GeForce RTX 4060 Ti',
    'AMD Radeon RX 7900 XT',
    'Intel Arc A770',
    'Apple M4 Max',
    'NVIDIA GeForce GTX-1080TI',
    'AMD RX-7900XTX',
    'Intel(R) Core(TM) i5-3330S CPU @ 2.70GHz',
    'Intel Core i7@3.4GHz',
    'Radeon (TM) RX 550 (2 GB), Intel(R) UHD Graphics 620 (128MB)',
    'NVIDIA GeForce RTX 4060 Laptop GPU',
    'desktop-class integrated graphics',
    'RTX A3000 6G',
    '01:00.0 VGA compatible controller: NVIDIA Corporation',
  ])('keeps the product name %s', (name) => {
    expect(sanitizeReportedGpu(name)).toBe(name);
  });

  it('scrubs a computer name out of a run and the recomputed digest verifies', async () => {
    const typed = withHardware({ ...FULL, gpu: 'Intel HD Graphics 2500 DESKTOP-A1B2C3D' });
    typed.digest = await computeRunDigest(typed);
    const scrub = scrubRunForPublication(typed);
    expect(scrub.changed).toBe(true);
    expect(scrub.removed).toContain('environment.userReportedHardware.gpu (normalized)');
    expect(scrub.run.environment.userReportedHardware?.gpu).toBe('Intel HD Graphics 2500');
    expect(JSON.stringify(scrub.run)).not.toContain('DESKTOP-');
    expect(await verifyRunDigest(scrub.run)).toBe(false);
    scrub.run.digest = await computeRunDigest(scrub.run);
    expect(await verifyRunDigest(scrub.run)).toBe(true);
  });

  it('rewrites an unnormalized name and reports the change; leaves a normalized one alone', () => {
    const spaced = withHardware({ ...FULL, gpu: ' NVIDIA  GeForce RTX 4060 ' });
    const scrub = scrubRunForPublication(spaced);
    expect(scrub.changed).toBe(true);
    expect(scrub.removed).toContain('environment.userReportedHardware.gpu (normalized)');
    expect(scrub.run.environment.userReportedHardware).toEqual({ ...FULL, gpu: 'NVIDIA GeForce RTX 4060' });
    // The input is not mutated.
    expect(spaced.environment.userReportedHardware?.gpu).toBe(' NVIDIA  GeForce RTX 4060 ');

    const clean = scrubRunForPublication(withHardware(FULL));
    expect(clean.changed).toBe(false);
    expect(clean.run.environment.userReportedHardware).toEqual(FULL);
  });
});

describe('runs.csv reported-hardware columns', () => {
  it('follows powerLevel with reportedGpu, reportedChassis, reportedRamGB, reportedOtherApps', () => {
    const cols = runsToRunsCSV([makeAnalysisRun()]).split('\n')[0].split(',');
    expect(cols.slice(-6)).toEqual([
      'powerCharging', 'powerLevel', 'reportedGpu', 'reportedChassis', 'reportedRamGB', 'reportedOtherApps',
    ]);
  });

  it('exports the answers, quotes a name with a comma, and leaves the columns empty when absent', () => {
    const reported = makeAnalysisRun();
    reported.environment = { ...reported.environment, userReportedHardware: FULL };
    const unsure = makeAnalysisRun();
    unsure.runId = 'analysis-run-0003';
    unsure.environment = {
      ...unsure.environment,
      userReportedHardware: { gpu: 'AMD Radeon RX 7800 XT, desktop card', chassis: 'desktop', ramGB: null, otherAppsRunning: true },
    };
    const out = runsToRunsCSV([reported, makeSecondAnalysisRun(), unsure]).trimEnd().split('\n');
    expect(out[1].endsWith(',NVIDIA GeForce RTX 4060 Laptop GPU,laptop,16,false')).toBe(true);
    expect(out[2].endsWith(',,,,')).toBe(true);
    expect(out[3].endsWith(',"AMD Radeon RX 7800 XT, desktop card",desktop,,true')).toBe(true);
  });
});
