/**
 * POST /api/bench/submit — validate a benchmark run and commit it to the
 * public GitHub dataset. Auto-publish with anomaly flags: reject-severity
 * plausibility findings route the run to quarantine/ (public, hidden from
 * charts); everything is recomputed server-side from the raw trace.
 */

import { NextResponse, type NextRequest } from 'next/server';
import type { BenchRunResult } from '@localmode/bench';
import { computeRunDigest, scrubRunForPublication, validateSubmission, verifyRunDigest } from '@localmode/bench';
import { verifyNonce } from '@/lib/bench/nonce';
import {
  appendToIndex,
  BenchStoreError,
  benchStoreConfig,
  commitRun,
  consumeNonce,
  rateLimitWithRetry,
  SUBMIT_RATE_LIMIT,
  toIndexEntry,
} from '@/lib/bench/store';

export const dynamic = 'force-dynamic';

/** Hard cap on submission size (raw traces are compact; this is generous). */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const config = benchStoreConfig();
  if (!config) {
    return NextResponse.json(
      {
        ok: false,
        code: 'bench-store-unbound',
        message:
          'The results store is not configured on this deployment. Export your run as JSON instead.',
      },
      { status: 503 },
    );
  }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';
  const verdict = await rateLimitWithRetry(`submit:${ip}`);
  if (!verdict.allowed) {
    const minutes = Math.max(1, Math.ceil(verdict.retryAfterSec / 60));
    return NextResponse.json(
      {
        ok: false,
        code: 'rate-limited',
        retryAfterSec: verdict.retryAfterSec,
        message: `The dataset accepts ${SUBMIT_RATE_LIMIT} submissions per hour from one network address; this run can be submitted again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      },
      { status: 429, headers: { 'Retry-After': String(verdict.retryAfterSec) } },
    );
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json(
      { ok: false, code: 'payload-too-large', message: 'Submission exceeds 4MB.' },
      { status: 413 },
    );
  }

  let run: BenchRunResult;
  try {
    run = JSON.parse(raw) as BenchRunResult;
  } catch {
    return NextResponse.json(
      { ok: false, code: 'invalid-json', message: 'Body is not valid JSON.' },
      { status: 400 },
    );
  }

  if (!verifyNonce(run.nonce)) {
    return NextResponse.json(
      {
        ok: false,
        code: 'invalid-nonce',
        message: 'Missing or expired session nonce. Re-run from the official bench page.',
      },
      { status: 403 },
    );
  }

  if (!(await verifyRunDigest(run))) {
    return NextResponse.json(
      { ok: false, code: 'digest-mismatch', message: 'Result digest is missing or wrong.' },
      { status: 400 },
    );
  }

  const report = validateSubmission(run);
  if (report.shapeErrors.length > 0) {
    return NextResponse.json(
      { ok: false, code: 'invalid-shape', errors: report.shapeErrors },
      { status: 400 },
    );
  }
  const flagged = !report.ok;

  // A nonce fronts one submission. Checked after the cheap rejections so a
  // malformed payload does not burn the page's nonce.
  if (!(await consumeNonce(run.nonce as string))) {
    return NextResponse.json(
      { ok: false, code: 'nonce-used', message: 'This session nonce was already used. Reload the bench page to run again.' },
      { status: 409 },
    );
  }

  // Publish only what a public file may carry: the nonce never, and none of
  // the fields a page built before schema 3 still captures. When the scrub
  // changed anything, the client's digest no longer applies and the file
  // carries a recomputed one plus the time of the rewrite.
  const scrub = scrubRunForPublication(run);
  let published = scrub.run;
  if (scrub.changed) {
    published = { ...scrub.run, scrubbedAt: new Date().toISOString() };
    published.digest = await computeRunDigest(published);
  }

  try {
    const path = await commitRun(config, published, flagged);
    await appendToIndex(config, toIndexEntry(published, report.summaries, flagged, path));
    return NextResponse.json({
      ok: true,
      flagged,
      flags: report.flags,
      path,
      url: `https://github.com/${config.repo}/blob/main/${path}`,
    });
  } catch (error) {
    if (error instanceof BenchStoreError && error.code === 'duplicate-run') {
      return NextResponse.json(
        { ok: false, code: 'duplicate-run', message: 'This run was already submitted.' },
        { status: 409 },
      );
    }
    console.warn('[bench] submission store error:', error);
    return NextResponse.json(
      { ok: false, code: 'store-error', message: 'Could not persist the run; try again later.' },
      { status: 502 },
    );
  }
}
