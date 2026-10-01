/**
 * "About this computer" on /bench/run: the paid-study hardware answers. The
 * pure parts are tested here (the Run gate's reason, the conversion into the
 * run file's `environment.userReportedHardware`, the stored series copy), and
 * the index entry the submit route builds from a run with and without the
 * answers. The page wiring (form shown only on an eligible study link, Run
 * disabled until answered, answers kept across a series reload) is covered by
 * the bench e2e spec.
 */
import { describe, expect, it } from 'vitest';
import { validateRunShape, type BenchRunResult } from '@localmode/bench';
import { makeRun } from '../../../packages/bench/tests/helpers';
import {
  EMPTY_HARDWARE_ANSWERS,
  RAM_BUCKETS_GB,
  hardwareBlockReason,
  missingHardwareAnswers,
  parseStoredHardware,
  toUserReportedHardware,
  type HardwareAnswers,
} from '../src/lib/bench/study-hardware';
import { toIndexEntry } from '../src/lib/bench/store';

const FILLED: HardwareAnswers = { gpu: 'NVIDIA GeForce RTX 4060', chassis: 'laptop', ram: '16', otherApps: 'no' };

describe('the Run gate', () => {
  it('names every unanswered required question, in form order', () => {
    expect(missingHardwareAnswers(EMPTY_HARDWARE_ANSWERS)).toEqual([
      'graphics card or chip',
      'computer type',
      'memory (RAM)',
    ]);
    expect(hardwareBlockReason(EMPTY_HARDWARE_ANSWERS)).toBe(
      'Answer "About this computer" first: graphics card or chip, computer type and memory (RAM).',
    );
    expect(hardwareBlockReason({ ...EMPTY_HARDWARE_ANSWERS, gpu: 'Apple M2', chassis: 'desktop' })).toBe(
      'Answer "About this computer" first: memory (RAM).',
    );
    expect(hardwareBlockReason({ ...EMPTY_HARDWARE_ANSWERS, ram: 'unsure' })).toBe(
      'Answer "About this computer" first: graphics card or chip and computer type.',
    );
  });

  it('opens once the three required answers are given; the other-programs question is optional', () => {
    expect(hardwareBlockReason({ ...FILLED, otherApps: '' })).toBeNull();
    expect(hardwareBlockReason(FILLED)).toBeNull();
    // "Not sure" is an answer.
    expect(hardwareBlockReason({ ...FILLED, ram: 'unsure' })).toBeNull();
  });

  it('does not count a GPU name of only spaces or control characters as an answer', () => {
    expect(missingHardwareAnswers({ ...FILLED, gpu: '   ' })).toEqual(['graphics card or chip']);
    expect(missingHardwareAnswers({ ...FILLED, gpu: '‮\u0000' })).toEqual(['graphics card or chip']);
  });
});

describe('toUserReportedHardware()', () => {
  it('records the answers in the run file shape, which validation accepts', () => {
    const hw = toUserReportedHardware(FILLED);
    expect(hw).toEqual({ gpu: 'NVIDIA GeForce RTX 4060', chassis: 'laptop', ramGB: 16, otherAppsRunning: false });
    const run = makeRun();
    expect(validateRunShape({ ...run, environment: { ...run.environment, userReportedHardware: hw } })).toEqual([]);
  });

  it('maps every RAM bucket to its number, the top bucket to 128 and "Not sure" to null', () => {
    for (const gb of RAM_BUCKETS_GB) expect(toUserReportedHardware({ ...FILLED, ram: String(gb) })?.ramGB).toBe(gb);
    expect(RAM_BUCKETS_GB[RAM_BUCKETS_GB.length - 1]).toBe(128);
    expect(toUserReportedHardware({ ...FILLED, ram: 'unsure' })?.ramGB).toBeNull();
  });

  it('normalizes the GPU name and leaves out what was not answered', () => {
    expect(toUserReportedHardware({ gpu: '  AMD   Radeon 780M ', chassis: '', ram: '', otherApps: 'yes' })).toEqual({
      gpu: 'AMD Radeon 780M',
      otherAppsRunning: true,
    });
    expect(toUserReportedHardware({ ...FILLED, otherApps: '' })).not.toHaveProperty('otherAppsRunning');
    expect(toUserReportedHardware(EMPTY_HARDWARE_ANSWERS)).toBeUndefined();
    // A bucket the form does not offer is not recorded.
    expect(toUserReportedHardware({ ...EMPTY_HARDWARE_ANSWERS, ram: '20' })).toBeUndefined();
  });
});

describe('the series copy of the answers', () => {
  const stored = (seriesId: string, answers: unknown) => JSON.stringify({ seriesId, answers });

  it('reads back the answers of the same series only', () => {
    expect(parseStoredHardware(stored('s-1', FILLED), 's-1')).toEqual(FILLED);
    expect(parseStoredHardware(stored('s-1', FILLED), 's-2')).toBeNull();
    expect(parseStoredHardware(null, 's-1')).toBeNull();
    expect(parseStoredHardware('{', 's-1')).toBeNull();
  });

  it.each([
    ['a GPU over 64 characters', { ...FILLED, gpu: 'x'.repeat(65) }],
    ['an unknown chassis', { ...FILLED, chassis: 'tower' }],
    ['a RAM value the form does not offer', { ...FILLED, ram: '20' }],
    ['an unknown other-programs answer', { ...FILLED, otherApps: 'maybe' }],
    ['a missing field', { gpu: 'x', chassis: 'laptop', ram: '8' }],
  ])('treats %s as nothing stored', (_label, answers) => {
    expect(parseStoredHardware(stored('s-1', answers), 's-1')).toBeNull();
  });
});

describe('index entries', () => {
  const entryJson = (run: BenchRunResult) => JSON.stringify(toIndexEntry(run, [], false, 'runs/2026/10/x.json'));

  it('a run without the answers yields no reported* key: the entry is byte-identical to one built without the feature', () => {
    const run = makeRun();
    const json = entryJson(run);
    expect(json).not.toMatch(/"reported/);
    // The same entry with the new keys removed by hand is the same bytes.
    const parsed = JSON.parse(json) as Record<string, unknown>;
    for (const key of ['reportedGpu', 'reportedChassis', 'reportedRamGB']) delete parsed[key];
    expect(JSON.stringify(parsed)).toBe(json);
  });

  it('a study run carries reportedGpu, reportedChassis and reportedRamGB; "Not sure" RAM leaves reportedRamGB out', () => {
    const run = makeRun();
    const answered = { ...run, environment: { ...run.environment, userReportedHardware: toUserReportedHardware(FILLED) } };
    const entry = JSON.parse(entryJson(answered)) as Record<string, unknown>;
    expect(entry).toMatchObject({ reportedGpu: 'NVIDIA GeForce RTX 4060', reportedChassis: 'laptop', reportedRamGB: 16 });
    // The keys follow userReportedDevice.
    const keys = Object.keys(entry);
    expect(keys.indexOf('reportedGpu')).toBe(keys.indexOf('flagged') - 3);

    const unsure = { ...run, environment: { ...run.environment, userReportedHardware: { chassis: 'desktop' as const, ramGB: null } } };
    const json = entryJson(unsure);
    expect(json).toContain('"reportedChassis":"desktop"');
    expect(json).not.toContain('reportedRamGB');
    expect(json).not.toContain('reportedGpu');
  });
});
