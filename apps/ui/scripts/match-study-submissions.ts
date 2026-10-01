/**
 * Match the participants of a paid study against a LocalMode Bench dataset
 * clone. Each participant id is hashed exactly as /bench/run hashes the
 * `PROLIFIC_PID` it reads (`parseStudySession`), and the hash is looked up in
 * `environment.userReportedDevice` (`prolific:<hash>`) through the clone's
 * `index/summary.json`; each matched run file is then read for the browser
 * identity and the hardware the participant reported.
 *
 * Verdicts: `approve` when exactly one run carries the hash, `duplicate` when
 * more than one does (every run is listed), `no-match` when none does. The
 * eligibility column recomputes the study's browser rule (`studyEligibility`)
 * from the run file's user agent and UA-CH brands, so a run from an
 * ineligible browser stands out for review.
 *
 * Input: the study's participant export as CSV (the column named by
 * `--pid-column`, default "Participant id"), or a plain file with one
 * participant id per line.
 *
 * Usage (from apps/ui):
 *   pnpm exec tsx scripts/match-study-submissions.ts <export.csv|ids.txt> [--dataset <clone>] [--pid-column <name>] [--json]
 */

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BenchRunResult, UserReportedHardware } from '@localmode/bench';
import { studyEligibility } from '../src/lib/bench/study-eligibility';
import { parseStudySession } from '../src/lib/bench/study-session';
import type { RunIndexEntry } from '../src/lib/bench/store';

/** Dataset clone the tool reads when `--dataset` is not given: a sibling of this repository. */
export const DEFAULT_DATASET = resolve(dirname(fileURLToPath(import.meta.url)), '..', '../../../LocalMode-Bench');

/** Participant-id column of the study platform's export. */
export const DEFAULT_PID_COLUMN = 'Participant id';

export type MatchVerdict = 'approve' | 'no-match' | 'duplicate';

/** One output row: a participant with no run, or one of the participant's runs. */
export interface MatchRow {
  participantId: string;
  /** `prolific:<hash>` as the run file records it. */
  participantHash: string;
  verdict: MatchVerdict;
  runId?: string;
  path?: string;
  createdAt?: string;
  browser?: string;
  engine?: string;
  /** `eligible`, or `ineligible (webkit|gecko|other)`; `unknown` when the run file has no user agent. */
  eligibility?: string;
  userReportedHardware?: UserReportedHardware;
  /** Set when the index lists the run but its file could not be read. */
  problem?: string;
}

/** Split CSV text into rows of fields (RFC 4180: quoted fields, doubled quotes, CRLF or LF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

/**
 * Read participant ids from an export. A file whose first CSV row has the
 * participant-id column is read as CSV; any other file as one id per line.
 * Blank ids are skipped, duplicates kept once, order preserved.
 *
 * @param text - File contents.
 * @param pidColumn - Header of the id column.
 * @param requireColumn - Fail instead of falling back to one id per line (set when `--pid-column` was given).
 * @returns The participant ids.
 * @throws {Error} When `requireColumn` is set and the header has no such column.
 */
export function readParticipantIds(text: string, pidColumn = DEFAULT_PID_COLUMN, requireColumn = false): string[] {
  const rows = parseCsv(text);
  const header = rows[0]?.map((h) => h.trim()) ?? [];
  const col = header.indexOf(pidColumn);
  let ids: string[];
  if (col >= 0) ids = rows.slice(1).map((r) => (r[col] ?? '').trim());
  else if (requireColumn) throw new Error(`no "${pidColumn}" column in the header (${header.join(', ')})`);
  else ids = text.replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trim());
  return [...new Set(ids.filter((id) => id !== ''))];
}

/**
 * Hash a participant id as /bench/run does.
 *
 * @param participantId - The id as the study platform exports it.
 * @returns `prolific:<first 12 hex of SHA-256>`, the value the run file records.
 */
export async function participantTag(participantId: string): Promise<string> {
  const session = await parseStudySession(
    `?${new URLSearchParams({ PROLIFIC_PID: participantId }).toString()}`,
    { eligible: true },
  );
  if (!session) throw new Error(`participant id ${JSON.stringify(participantId)} is empty`);
  return `prolific:${session.participantHash}`;
}

function describeEligibility(run: BenchRunResult): string {
  const env = run.environment;
  if (!env.userAgent) return 'unknown';
  const verdict = studyEligibility({ userAgent: env.userAgent, brands: env.browser.brands ?? null });
  return verdict.eligible ? 'eligible' : `ineligible (${verdict.reason})`;
}

/**
 * Match participants against a dataset clone.
 *
 * @param participantIds - Ids from the export.
 * @param datasetDir - Root of the dataset clone (holds `index/summary.json`).
 * @returns One row per participant without a run, and one per run otherwise.
 * @throws {Error} When the clone has no readable index.
 */
export async function matchStudySubmissions(participantIds: readonly string[], datasetDir: string): Promise<MatchRow[]> {
  const indexPath = join(datasetDir, 'index', 'summary.json');
  if (!existsSync(indexPath)) throw new Error(`${indexPath} not found; pass --dataset <clone>`);
  const index = JSON.parse(readFileSync(indexPath, 'utf8')) as RunIndexEntry[];
  if (!Array.isArray(index)) throw new Error(`${indexPath} is not a JSON array`);
  const byTag = new Map<string, RunIndexEntry[]>();
  for (const entry of index) {
    const tag = entry.userReportedDevice;
    if (!tag?.startsWith('prolific:')) continue;
    byTag.set(tag, [...(byTag.get(tag) ?? []), entry]);
  }

  const rows: MatchRow[] = [];
  for (const participantId of participantIds) {
    const participantHash = await participantTag(participantId);
    const entries = [...(byTag.get(participantHash) ?? [])].sort(
      (a, b) => a.createdAt.localeCompare(b.createdAt) || a.path.localeCompare(b.path),
    );
    if (entries.length === 0) {
      rows.push({ participantId, participantHash, verdict: 'no-match' });
      continue;
    }
    const verdict: MatchVerdict = entries.length > 1 ? 'duplicate' : 'approve';
    for (const entry of entries) {
      const row: MatchRow = {
        participantId,
        participantHash,
        verdict,
        runId: entry.runId,
        path: entry.path,
        createdAt: entry.createdAt,
        browser: entry.browser,
        engine: entry.engine,
      };
      try {
        const run = JSON.parse(readFileSync(join(datasetDir, entry.path), 'utf8')) as BenchRunResult;
        row.browser = run.environment.browser.name;
        row.engine = run.environment.browser.engine;
        row.eligibility = describeEligibility(run);
        if (run.environment.userReportedHardware) row.userReportedHardware = run.environment.userReportedHardware;
      } catch (error) {
        row.problem = `run file unreadable: ${(error as Error).message}`;
      }
      rows.push(row);
    }
  }
  return rows;
}

function hardwareText(hw: UserReportedHardware | undefined): string {
  if (!hw) return '';
  const ram = hw.ramGB === undefined ? '' : hw.ramGB === null ? 'RAM not sure' : `${hw.ramGB} GB`;
  const apps = hw.otherAppsRunning === undefined ? '' : hw.otherAppsRunning ? 'other apps: yes' : 'other apps: no';
  return [hw.gpu, hw.chassis, ram, apps].filter(Boolean).join('; ');
}

/** Render rows as an aligned plain-text table. */
export function formatMatchTable(rows: readonly MatchRow[]): string {
  const header = ['participant', 'verdict', 'run', 'createdAt', 'browser', 'eligibility', 'reported hardware'];
  const body = rows.map((r) => [
    r.participantId,
    r.verdict,
    r.runId ?? '',
    r.createdAt ?? '',
    r.browser ? `${r.browser}${r.engine ? ` (${r.engine})` : ''}` : '',
    r.problem ?? r.eligibility ?? '',
    hardwareText(r.userReportedHardware),
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...body.map((b) => b[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd();
  return [line(header), line(widths.map((w) => '-'.repeat(w))), ...body.map(line)].join('\n');
}

async function main(argv: string[]): Promise<number> {
  const valueOf = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const flags = new Set(['--dataset', '--pid-column']);
  const positional = argv.filter((a, i) => !a.startsWith('--') && !flags.has(argv[i - 1]));
  const input = positional[0];
  if (!input) {
    console.error(
      'usage: tsx scripts/match-study-submissions.ts <export.csv|ids.txt> [--dataset <clone>] [--pid-column <name>] [--json]',
    );
    return 2;
  }
  const pidColumnArg = valueOf('--pid-column');
  const datasetDir = resolve(valueOf('--dataset') ?? DEFAULT_DATASET);
  let ids: string[];
  try {
    ids = readParticipantIds(readFileSync(input, 'utf8'), pidColumnArg ?? DEFAULT_PID_COLUMN, pidColumnArg !== undefined);
  } catch (error) {
    console.error(`[match-study-submissions] ${input}: ${(error as Error).message}`);
    return 1;
  }
  let rows: MatchRow[];
  try {
    rows = await matchStudySubmissions(ids, datasetDir);
  } catch (error) {
    console.error(`[match-study-submissions] ${(error as Error).message}`);
    return 1;
  }
  if (argv.includes('--json')) {
    console.log(JSON.stringify(rows, null, 2));
    return 0;
  }
  console.log(formatMatchTable(rows));
  const count = (v: MatchVerdict) => new Set(rows.filter((r) => r.verdict === v).map((r) => r.participantId)).size;
  console.log(
    `\n${ids.length} participants: ${count('approve')} approve, ${count('duplicate')} duplicate, ${count('no-match')} no-match (dataset ${datasetDir})`,
  );
  return 0;
}

function isDirectRun(): boolean {
  const invoked = process.argv[1];
  if (!invoked) return false;
  try {
    return realpathSync(invoked) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  void main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
