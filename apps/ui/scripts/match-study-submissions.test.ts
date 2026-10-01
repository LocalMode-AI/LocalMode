/**
 * The study matching tool over a fixture dataset clone
 * (`__fixtures__/study-dataset`): five run files with their index, written by
 * the bench package's own run builder and the submit route's `toIndexEntry()`.
 * Participants: one approved run from Chrome with reported hardware, one
 * participant with two runs (duplicate), one run from Firefox (ineligible
 * browser), one participant with no run, and an organic run without a
 * participant tag. The participant hash is checked against Node's own
 * SHA-256, and the CLI runs as a real process for the table and JSON output.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  matchStudySubmissions,
  participantTag,
  parseCsv,
  readParticipantIds,
  type MatchRow,
} from './match-study-submissions';

const here = dirname(fileURLToPath(import.meta.url));
const TSX = join(here, '..', 'node_modules', '.bin', 'tsx');
const SCRIPT = join(here, 'match-study-submissions.ts');
const DATASET = join(here, '__fixtures__', 'study-dataset');
const EXPORT_CSV = join(DATASET, 'prolific-export.csv');

const nodeTag = (pid: string) => `prolific:${createHash('sha256').update(pid.trim(), 'utf8').digest('hex').slice(0, 12)}`;

function cli(...args: string[]) {
  return spawnSync(TSX, [SCRIPT, ...args], { encoding: 'utf8', timeout: 60_000 });
}

describe('participant ids', () => {
  it('hashes a participant id as the page does (SHA-256 of the trimmed id, first 12 hex)', async () => {
    for (const pid of ['pid-approve-0001', '5f3a1c2b4d6e7f8091a2b3c4', ' padded-id ', 'ünïcode-id']) {
      expect(await participantTag(pid)).toBe(nodeTag(pid));
    }
  });

  it('reads the "Participant id" column of a CSV export, quoted fields and CRLF included', () => {
    expect(readParticipantIds(readFileSync(EXPORT_CSV, 'utf8'))).toEqual([
      'pid-approve-0001',
      'pid-duplicate-0002',
      'pid-firefox-0003',
      'pid-nomatch-0004',
    ]);
    const crlf = '﻿Status,"Participant id"\r\n"APPROVED, late",abc\r\nRETURNED,"x""y"\r\n,\r\n';
    expect(readParticipantIds(crlf)).toEqual(['abc', 'x"y']);
    expect(parseCsv('a,"b,c"\n"d\ne",f')).toEqual([['a', 'b,c'], ['d\ne', 'f']]);
  });

  it('reads another column with --pid-column, and fails when that column is missing', () => {
    expect(readParticipantIds('id,PID\n1,p-1\n2,p-2\n', 'PID', true)).toEqual(['p-1', 'p-2']);
    expect(() => readParticipantIds('id,other\n1,p-1\n', 'PID', true)).toThrow(/no "PID" column/);
  });

  it('reads a plain file as one id per line, skipping blanks and repeats', () => {
    expect(readParticipantIds('pid-a\n\n  pid-b  \r\npid-a\n')).toEqual(['pid-a', 'pid-b']);
  });
});

describe('matchStudySubmissions()', () => {
  it('approves one run, lists every run of a duplicate, flags the ineligible browser, and reports no-match', async () => {
    const ids = readParticipantIds(readFileSync(EXPORT_CSV, 'utf8'));
    const rows = await matchStudySubmissions(ids, DATASET);
    const brief = rows.map((r) => [r.participantId, r.verdict, r.runId ?? null, r.eligibility ?? null]);
    expect(brief).toEqual([
      ['pid-approve-0001', 'approve', 'study-run-approve-1', 'eligible'],
      ['pid-duplicate-0002', 'duplicate', 'study-run-dup-a', 'eligible'],
      ['pid-duplicate-0002', 'duplicate', 'study-run-dup-b', 'eligible'],
      ['pid-firefox-0003', 'approve', 'study-run-firefox', 'ineligible (gecko)'],
      ['pid-nomatch-0004', 'no-match', null, null],
    ]);
    const approve = rows[0];
    expect(approve.participantHash).toBe(nodeTag('pid-approve-0001'));
    expect(approve).toMatchObject({
      createdAt: '2026-10-02T09:00:00.000Z',
      browser: 'Google Chrome',
      engine: 'Blink',
      path: 'runs/2026/10/study-run-approve-1.json',
      userReportedHardware: { gpu: 'NVIDIA GeForce RTX 4060 Laptop GPU', chassis: 'laptop', ramGB: 16, otherAppsRunning: false },
    });
    expect(rows[1].userReportedHardware).toEqual({ gpu: 'AMD Radeon 780M', chassis: 'laptop', ramGB: null });
    expect(rows[3]).toMatchObject({ browser: 'Firefox', engine: 'Gecko' });
    expect(rows[3].userReportedHardware).toBeUndefined();
    // The organic run in the fixture carries no participant tag and matches nobody.
    expect(rows.some((r) => r.runId === 'organic-run-0001')).toBe(false);
  });

  it('reports a run file the index lists but the clone lacks, instead of skipping it', async () => {
    const clone = mkdtempSync(join(tmpdir(), 'study-dataset-'));
    try {
      const index = readFileSync(join(DATASET, 'index', 'summary.json'), 'utf8');
      mkdirSync(join(clone, 'index'));
      writeFileSync(join(clone, 'index', 'summary.json'), index);
      const [row] = await matchStudySubmissions(['pid-approve-0001'], clone);
      expect(row.verdict).toBe('approve');
      expect(row.runId).toBe('study-run-approve-1');
      expect(row.problem).toMatch(/^run file unreadable: ENOENT/);
    } finally {
      rmSync(clone, { recursive: true, force: true });
    }
  });

  it('fails clearly without an index', async () => {
    await expect(matchStudySubmissions(['x'], tmpdir())).rejects.toThrow(/summary\.json not found/);
  });
});

describe('the CLI', () => {
  it('prints the table and the verdict counts', () => {
    const out = cli(EXPORT_CSV, '--dataset', DATASET);
    expect(out.status, out.stderr).toBe(0);
    const lines = out.stdout.trimEnd().split('\n');
    expect(lines[0].split(/\s{2,}/)).toEqual([
      'participant', 'verdict', 'run', 'createdAt', 'browser', 'eligibility', 'reported hardware',
    ]);
    expect(lines[2]).toMatch(/^pid-approve-0001\s+approve\s+study-run-approve-1\s+2026-10-02T09:00:00\.000Z\s+Google Chrome \(Blink\)\s+eligible\s+NVIDIA GeForce RTX 4060 Laptop GPU; laptop; 16 GB; other apps: no$/);
    expect(lines[5]).toMatch(/^pid-firefox-0003\s+approve\s+study-run-firefox\s+.*Firefox \(Gecko\)\s+ineligible \(gecko\)$/);
    expect(lines[6]).toMatch(/^pid-nomatch-0004\s+no-match$/);
    expect(lines[lines.length - 1]).toMatch(/^4 participants: 2 approve, 1 duplicate, 1 no-match \(dataset /);
  }, 60_000);

  it('--json writes the same rows as JSON; a plain id list works too', () => {
    const dir = mkdtempSync(join(tmpdir(), 'study-ids-'));
    try {
      const list = join(dir, 'ids.txt');
      writeFileSync(list, 'pid-duplicate-0002\npid-nomatch-0004\n');
      const out = cli(list, '--dataset', DATASET, '--json');
      expect(out.status, out.stderr).toBe(0);
      const rows = JSON.parse(out.stdout) as MatchRow[];
      expect(rows.map((r) => [r.participantId, r.verdict, r.runId])).toEqual([
        ['pid-duplicate-0002', 'duplicate', 'study-run-dup-a'],
        ['pid-duplicate-0002', 'duplicate', 'study-run-dup-b'],
        ['pid-nomatch-0004', 'no-match', undefined],
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('exits non-zero on a missing --pid-column and without an input file', () => {
    const missing = cli(EXPORT_CSV, '--dataset', DATASET, '--pid-column', 'PROLIFIC_PID');
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('no "PROLIFIC_PID" column');
    const usage = cli('--dataset', DATASET);
    expect(usage.status).toBe(2);
    expect(usage.stderr).toContain('usage:');
  }, 60_000);
});
