/**
 * The submission pipeline of `POST /api/bench/submit`, as importable steps:
 * body size and JSON parsing, digest verification, shape validation and the
 * quarantine decision, the publication scrub, the run file's dataset path and
 * bytes, and its index entry. The route runs these steps around the parts
 * that need a live request (rate limit, nonce, GitHub writes); the maintainer
 * tool `scripts/import-exported-run.ts` runs the same steps on an exported
 * run file, so an imported run is checked and written exactly as a submitted
 * one. Server-only.
 */

import type { BenchRunResult, CellSummary, PlausibilityFlag } from '@localmode/bench';
import { computeRunDigest, isControlRun, scrubRunForPublication, validateSubmission, verifyRunDigest } from '@localmode/bench';
import {
  appendIndexEntry,
  runPath,
  serializeIndexEntries,
  serializeRunFile,
  toIndexEntry,
  type RunIndexEntry,
} from './store';

export { appendIndexEntry, runPath, serializeIndexEntries, serializeRunFile, toIndexEntry };

/** Hard cap on submission size (raw traces are compact; this is generous). */
export const MAX_SUBMISSION_BYTES = 4 * 1024 * 1024;

/** A refusal: the HTTP status and JSON body the route answers with. */
export interface SubmissionRejection {
  status: number;
  body: { ok: false; code: string; message?: string; errors?: string[] };
}

/**
 * Parse a raw submission body.
 *
 * @param raw - The request body as text.
 * @returns The run, or the rejection for an oversized or non-JSON body.
 */
export function parseSubmissionBody(raw: string): { run: BenchRunResult } | { rejection: SubmissionRejection } {
  if (raw.length > MAX_SUBMISSION_BYTES) {
    return { rejection: { status: 413, body: { ok: false, code: 'payload-too-large', message: 'Submission exceeds 4MB.' } } };
  }
  try {
    return { run: JSON.parse(raw) as BenchRunResult };
  } catch {
    return { rejection: { status: 400, body: { ok: false, code: 'invalid-json', message: 'Body is not valid JSON.' } } };
  }
}

/**
 * Refuse a control run (`harness.control`). A control run is a control
 * experiment for the methodology, not a protocol run: it is never published
 * and never enters the leaderboard index. The page never uploads one; this
 * check is the server's own guard, and the import tool shares it.
 *
 * @param run - The parsed submission.
 * @returns The 422 rejection for a control run, or null.
 */
export function rejectControlRun(run: unknown): SubmissionRejection | null {
  if (!isControlRun(run)) return null;
  const kind = (run as { harness: { control?: { kind?: unknown } | null } }).harness.control?.kind;
  return {
    status: 422,
    body: {
      ok: false,
      code: 'control-run',
      message: `This is a control run (harness.control${typeof kind === 'string' ? ` kind ${kind}` : ''}). Control runs are never published to the leaderboard; keep the exported JSON and collect it into a dataset clone with scripts/collect-control-runs.ts.`,
    },
  };
}

/** A run that passed the digest and shape checks. */
export interface CheckedSubmission {
  /** Server-side summaries of every cell, recomputed from the raw trace. */
  summaries: CellSummary[];
  /** Plausibility and integrity flags (empty for a clean run). */
  flags: PlausibilityFlag[];
  /** True when the run goes to quarantine/ instead of runs/. */
  flagged: boolean;
}

/**
 * Verify the digest and validate the run. A control run is refused first
 * (see `rejectControlRun`). A run with reject-severity findings is accepted
 * but flagged, which routes it to quarantine/.
 *
 * @param run - The submitted run.
 * @returns The checked submission, or the rejection.
 */
export async function checkSubmission(
  run: BenchRunResult,
): Promise<{ checked: CheckedSubmission } | { rejection: SubmissionRejection }> {
  const control = rejectControlRun(run);
  if (control) return { rejection: control };
  if (!(await verifyRunDigest(run))) {
    return { rejection: { status: 400, body: { ok: false, code: 'digest-mismatch', message: 'Result digest is missing or wrong.' } } };
  }
  const report = validateSubmission(run);
  if (report.shapeErrors.length > 0) {
    return { rejection: { status: 400, body: { ok: false, code: 'invalid-shape', errors: report.shapeErrors } } };
  }
  return { checked: { summaries: report.summaries, flags: report.flags, flagged: !report.ok } };
}

/**
 * The run as a public file may carry it: the nonce never, and none of the
 * fields a page built before schema 3 still captures. When the scrub changed
 * anything, the client's digest no longer applies and the file carries a
 * recomputed one plus the time of the rewrite.
 *
 * @param run - The checked run.
 * @param now - Time stamped as `scrubbedAt` when the scrub changed the run.
 * @returns The run to publish.
 */
export async function toPublishedRun(run: BenchRunResult, now: () => Date = () => new Date()): Promise<BenchRunResult> {
  const scrub = scrubRunForPublication(run);
  if (!scrub.changed) return scrub.run;
  const published: BenchRunResult = { ...scrub.run, scrubbedAt: now().toISOString() };
  published.digest = await computeRunDigest(published);
  return published;
}

/**
 * The dataset path, file bytes and index entry of a published run.
 *
 * @param published - The run from `toPublishedRun()`.
 * @param checked - The result of `checkSubmission()` for the same submission.
 */
export function publicationOf(
  published: BenchRunResult,
  checked: CheckedSubmission,
): { path: string; fileText: string; entry: RunIndexEntry } {
  const path = runPath(published, checked.flagged);
  return {
    path,
    fileText: serializeRunFile(published),
    entry: toIndexEntry(published, checked.summaries, checked.flagged, path),
  };
}
