/**
 * Rewrite one participant-reported field of a published run in a LocalMode
 * Bench dataset clone, for when a submission carried something a public file
 * must not (a computer name typed into the GPU answer, say). The run goes
 * through the same steps the submit route applies before publishing:
 * `scrubRunForPublication`, `scrubbedAt` stamped, digest recomputed with
 * `computeRunDigest`. The file is written back in the layout it was read in
 * (the dataset's compact JSON with no trailing newline), and the run's entry
 * in `index/summary.json` is updated from `toIndexEntry`, the function the
 * submit route and the index rebuild tool use: only the entry fields that the
 * edit changes are rewritten.
 *
 * Only the participant's own answers may be edited:
 * `environment.userReportedHardware.{gpu,chassis,ramGB,otherAppsRunning}` and
 * `environment.userReportedDevice`. Every other path is refused, because
 * every other field is a measurement or a capture.
 *
 * Usage (from apps/ui):
 *   pnpm exec tsx scripts/scrub-run-field.ts --dataset <clone> --run <runId> --field environment.userReportedHardware.gpu --sanitize
 *   pnpm exec tsx scripts/scrub-run-field.ts --dataset <clone> --run <runId> --field <path> --value "<new value>"
 *   pnpm exec tsx scripts/scrub-run-field.ts --dataset <clone> --run <runId> --field <path> --delete
 *   (add --dry-run to print the change without writing)
 */

import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  computeRunDigest,
  sanitizeReportedGpu,
  scrubRunForPublication,
  validateSubmission,
  verifyRunDigest,
  type BenchRunResult,
} from '@localmode/bench';
import { toIndexEntry, type RunIndexEntry } from '../src/lib/bench/store';

/** Dataset-relative path of the index. */
export const INDEX_FILE = 'index/summary.json';

/** The fields this tool may edit: the participant's own answers. */
export const EDITABLE_FIELDS = [
  'environment.userReportedHardware.gpu',
  'environment.userReportedHardware.chassis',
  'environment.userReportedHardware.ramGB',
  'environment.userReportedHardware.otherAppsRunning',
  'environment.userReportedDevice',
] as const;

export type EditableField = (typeof EDITABLE_FIELDS)[number];

/** How the field changes. */
export type FieldEdit =
  | { kind: 'value'; value: string }
  | { kind: 'sanitize' }
  | { kind: 'delete' };

export class ScrubFieldError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScrubFieldError';
  }
}

/** The layouts a run file may be stored in. */
type Layout = 'compact' | 'compact+newline' | 'indent2' | 'indent2+newline';

function detectLayout(raw: string, parsed: unknown): Layout {
  const compact = JSON.stringify(parsed);
  const indented = JSON.stringify(parsed, null, 2);
  if (raw === compact) return 'compact';
  if (raw === `${compact}\n`) return 'compact+newline';
  if (raw === indented) return 'indent2';
  if (raw === `${indented}\n`) return 'indent2+newline';
  throw new ScrubFieldError(
    'the run file is not in a JSON layout this tool can reproduce byte for byte (compact or 2-space, optional trailing newline)',
  );
}

function serialize(value: unknown, layout: Layout): string {
  const body = layout.startsWith('indent2') ? JSON.stringify(value, null, 2) : JSON.stringify(value);
  return layout.endsWith('+newline') ? `${body}\n` : body;
}

/**
 * Find a run file by run id under `runs/` and `quarantine/`.
 *
 * @returns The dataset-relative path.
 * @throws {ScrubFieldError} When no file, or more than one, is named `<runId>.json`.
 */
export function findRunFile(datasetDir: string, runId: string): string {
  const hits: string[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.isFile() && ent.name === `${runId}.json`) hits.push(relative(datasetDir, p).split(sep).join('/'));
    }
  };
  walk(join(datasetDir, 'runs'));
  walk(join(datasetDir, 'quarantine'));
  if (hits.length === 0) throw new ScrubFieldError(`no run file named ${runId}.json under runs/ or quarantine/`);
  if (hits.length > 1) throw new ScrubFieldError(`more than one run file named ${runId}.json: ${hits.join(', ')}`);
  return hits[0];
}

function assertEditable(field: string): asserts field is EditableField {
  if (!(EDITABLE_FIELDS as readonly string[]).includes(field)) {
    throw new ScrubFieldError(
      `refusing to edit ${field}: only the participant's answers may be edited (${EDITABLE_FIELDS.join(', ')})`,
    );
  }
}

function readField(run: BenchRunResult, field: EditableField): unknown {
  const env = run.environment as unknown as Record<string, unknown>;
  if (field === 'environment.userReportedDevice') return env.userReportedDevice;
  const hardware = env.userReportedHardware as Record<string, unknown> | undefined;
  return hardware?.[field.slice('environment.userReportedHardware.'.length)];
}

function parseValue(field: EditableField, value: string): unknown {
  if (field === 'environment.userReportedHardware.ramGB') {
    if (value === 'null') return null;
    const n = Number(value);
    if (!Number.isFinite(n)) throw new ScrubFieldError(`${field} takes a number or null, not "${value}"`);
    return n;
  }
  if (field === 'environment.userReportedHardware.otherAppsRunning') {
    if (value !== 'true' && value !== 'false') throw new ScrubFieldError(`${field} takes true or false, not "${value}"`);
    return value === 'true';
  }
  return value;
}

/** Return a copy of `run` with the field set (or removed); every other field is shared, not copied. */
function withField(run: BenchRunResult, field: EditableField, next: unknown, remove: boolean): BenchRunResult {
  const env = { ...(run.environment as unknown as Record<string, unknown>) };
  if (field === 'environment.userReportedDevice') {
    if (remove) delete env.userReportedDevice;
    else env.userReportedDevice = next;
  } else {
    const key = field.slice('environment.userReportedHardware.'.length);
    const hardware = { ...((env.userReportedHardware as Record<string, unknown> | undefined) ?? {}) };
    if (remove) delete hardware[key];
    else hardware[key] = next;
    if (Object.keys(hardware).length === 0) delete env.userReportedHardware;
    else env.userReportedHardware = hardware;
  }
  return { ...run, environment: env as unknown as BenchRunResult['environment'] };
}

/** What a scrub did, for the printed diff and for tests. */
export interface ScrubFieldResult {
  path: string;
  field: EditableField;
  before: unknown;
  after: unknown;
  digestBefore?: string;
  digestAfter: string;
  scrubbedAt: string;
  /** Run-file paths the publication scrub reported, beyond the edited field. */
  scrubRemoved: string[];
  /** Index entry fields that changed, with their old and new values. */
  indexChanges: Array<{ key: string; before: unknown; after: unknown }>;
  /** True when nothing was written. */
  dryRun: boolean;
}

export interface ScrubFieldOptions {
  datasetDir: string;
  runId: string;
  field: string;
  edit: FieldEdit;
  dryRun?: boolean;
  /** Time stamped as `scrubbedAt`; the current time when omitted. */
  now?: Date;
}

/**
 * Rewrite one participant-reported field of a run file and its index entry.
 *
 * @param options - Dataset clone, run id, field path, the edit, and `dryRun`.
 * @returns The before/after of the field, the digests, and the index changes.
 * @throws {ScrubFieldError} For a field outside the participant's answers, an
 *   edit that changes nothing, a result the validator rejects, a run missing
 *   from the index, or a file layout the tool cannot reproduce.
 */
export async function scrubRunField(options: ScrubFieldOptions): Promise<ScrubFieldResult> {
  const { datasetDir, runId, field, edit, dryRun = false } = options;
  assertEditable(field);
  if (edit.kind === 'sanitize' && field !== 'environment.userReportedHardware.gpu') {
    throw new ScrubFieldError('--sanitize applies to environment.userReportedHardware.gpu only; pass --value or --delete');
  }

  const path = findRunFile(datasetDir, runId);
  const raw = readFileSync(join(datasetDir, path), 'utf8');
  const original = JSON.parse(raw) as BenchRunResult;
  const layout = detectLayout(raw, original);
  if (original.runId !== runId) throw new ScrubFieldError(`${path} carries runId ${original.runId}`);

  const before = readField(original, field);
  let edited: BenchRunResult;
  if (edit.kind === 'delete') {
    if (before === undefined) throw new ScrubFieldError(`${field} is absent; nothing to delete`);
    edited = withField(original, field, undefined, true);
  } else {
    if (edit.kind === 'sanitize' && typeof before !== 'string') throw new ScrubFieldError(`${field} is not a string`);
    const next = edit.kind === 'sanitize' ? sanitizeReportedGpu(before as string) : parseValue(field, edit.value);
    edited = withField(original, field, next, false);
  }

  // The submit route's publication path.
  const scrub = scrubRunForPublication(edited);
  const after = readField(scrub.run, field);
  if (JSON.stringify(after) === JSON.stringify(before) && !scrub.changed) {
    throw new ScrubFieldError(`${field} would not change (${JSON.stringify(before)}); nothing written`);
  }
  if (edit.kind !== 'delete' && field === 'environment.userReportedHardware.gpu' && after === '') {
    throw new ScrubFieldError(`${field} would be empty after the edit; pass --delete to remove the answer`);
  }
  const scrubbedAt = (options.now ?? new Date()).toISOString();
  const published: BenchRunResult = { ...scrub.run, scrubbedAt };
  published.digest = await computeRunDigest(published);

  const report = validateSubmission(published, { anyProtocol: true });
  if (report.shapeErrors.length > 0) {
    throw new ScrubFieldError(`the edited run fails validation: ${report.shapeErrors.slice(0, 3).join('; ')}`);
  }
  if (!(await verifyRunDigest(published))) throw new ScrubFieldError('the recomputed digest does not verify');

  // The index entry: rewrite only the fields the edit changes, as
  // `toIndexEntry` derives them from the run before and after.
  const indexPath = join(datasetDir, INDEX_FILE);
  const indexRaw = readFileSync(indexPath, 'utf8');
  const index = JSON.parse(indexRaw) as RunIndexEntry[];
  const indexLayout = detectLayout(indexRaw, index);
  const at = index.findIndex((e) => e.runId === runId);
  if (at < 0) throw new ScrubFieldError(`${INDEX_FILE} has no entry for ${runId}; run the index rebuild tool first`);
  const current = index[at];
  const flagged = path.startsWith('quarantine/');
  const originalReport = validateSubmission(original, { anyProtocol: true });
  const entryBefore = toIndexEntry(original, originalReport.summaries, flagged, path) as unknown as Record<string, unknown>;
  const entryAfter = toIndexEntry(published, report.summaries, flagged, path) as unknown as Record<string, unknown>;
  const next = { ...(current as unknown as Record<string, unknown>) };
  const indexChanges: ScrubFieldResult['indexChanges'] = [];
  for (const key of new Set([...Object.keys(entryBefore), ...Object.keys(entryAfter)])) {
    if (JSON.stringify(entryBefore[key]) === JSON.stringify(entryAfter[key])) continue;
    indexChanges.push({ key, before: next[key], after: entryAfter[key] });
    if (entryAfter[key] === undefined) delete next[key];
    else next[key] = entryAfter[key];
  }
  const nextIndex = [...index];
  nextIndex[at] = next as unknown as RunIndexEntry;

  if (!dryRun) {
    writeFileSync(join(datasetDir, path), serialize(published, layout));
    writeFileSync(indexPath, serialize(nextIndex, indexLayout));
  }

  return {
    path,
    field,
    before,
    after,
    digestBefore: original.digest,
    digestAfter: published.digest,
    scrubbedAt,
    scrubRemoved: scrub.removed.filter((p) => !p.startsWith(field)),
    indexChanges,
    dryRun,
  };
}

/** The printed before/after. */
export function formatScrubResult(r: ScrubFieldResult): string {
  const lines = [
    `run file: ${r.path}`,
    `- ${r.field}: ${JSON.stringify(r.before)}`,
    `+ ${r.field}: ${JSON.stringify(r.after)}`,
    `- digest: ${r.digestBefore ?? '(none)'}`,
    `+ digest: ${r.digestAfter}`,
    `+ scrubbedAt: ${r.scrubbedAt}`,
  ];
  for (const p of r.scrubRemoved) lines.push(`  publication scrub also changed: ${p}`);
  lines.push(`index entry (${INDEX_FILE}):`);
  if (r.indexChanges.length === 0) lines.push('  no change');
  for (const c of r.indexChanges) {
    lines.push(`- ${c.key}: ${JSON.stringify(c.before)}`);
    lines.push(`+ ${c.key}: ${JSON.stringify(c.after)}`);
  }
  lines.push(r.dryRun ? 'dry run: nothing written' : 'written');
  return lines.join('\n');
}

async function main(argv: string[]): Promise<number> {
  const arg = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const datasetDir = resolve(arg('--dataset') ?? process.cwd());
  const runId = arg('--run');
  const field = arg('--field');
  const value = arg('--value');
  const modes = [value !== undefined, argv.includes('--sanitize'), argv.includes('--delete')].filter(Boolean).length;
  if (!runId || !field || modes !== 1) {
    console.error(
      'usage: tsx scripts/scrub-run-field.ts --dataset <clone> --run <runId> --field <path> (--value "<new value>" | --sanitize | --delete) [--dry-run]',
    );
    return 1;
  }
  const edit: FieldEdit =
    value !== undefined ? { kind: 'value', value } : argv.includes('--sanitize') ? { kind: 'sanitize' } : { kind: 'delete' };
  try {
    const result = await scrubRunField({ datasetDir, runId, field, edit, dryRun: argv.includes('--dry-run') });
    console.log(formatScrubResult(result));
    return 0;
  } catch (error) {
    console.error(`[scrub-run-field] ${(error as Error).message}`);
    return 1;
  }
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
