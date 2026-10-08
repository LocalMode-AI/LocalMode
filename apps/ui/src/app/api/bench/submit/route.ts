/**
 * POST /api/bench/submit — validate a benchmark run and commit it to the
 * public GitHub dataset. Auto-publish with anomaly flags: reject-severity
 * plausibility findings route the run to quarantine/ (public, hidden from
 * charts); everything is recomputed server-side from the raw trace.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { verifyNonce } from '@/lib/bench/nonce';
import {
  appendToIndex,
  BenchStoreError,
  benchStoreConfig,
  commitRun,
  consumeNonce,
  rateLimitWithRetry,
  SUBMIT_RATE_LIMIT,
} from '@/lib/bench/store';
import { checkSubmission, parseSubmissionBody, publicationOf, toPublishedRun } from '@/lib/bench/submission';

export const dynamic = 'force-dynamic';

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

  const parsed = parseSubmissionBody(await request.text());
  if ('rejection' in parsed) return NextResponse.json(parsed.rejection.body, { status: parsed.rejection.status });
  const { run } = parsed;

  if (!verifyNonce(run.nonce)) {
    return NextResponse.json(
      {
        ok: false,
        code: 'invalid-nonce',
        message:
          'The session token of this upload is missing or has expired. The bench page fetches a new token and tries the upload again by itself; if it still fails, export the run as JSON.',
      },
      { status: 403 },
    );
  }

  const checking = await checkSubmission(run);
  if ('rejection' in checking) return NextResponse.json(checking.rejection.body, { status: checking.rejection.status });
  const { checked } = checking;
  const { flagged } = checked;

  // A nonce fronts one submission. Checked after the cheap rejections so a
  // malformed payload does not burn the page's nonce.
  if (!(await consumeNonce(run.nonce as string))) {
    return NextResponse.json(
      { ok: false, code: 'nonce-used', message: 'This session nonce was already used. Reload the bench page to run again.' },
      { status: 409 },
    );
  }

  const published = await toPublishedRun(run);

  let path: string;
  try {
    path = await commitRun(config, published, flagged);
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

  const url = `https://github.com/${config.repo}/blob/main/${path}`;
  try {
    await appendToIndex(config, publicationOf(published, checked).entry);
  } catch (error) {
    // The run file is in the dataset; only its leaderboard index entry is
    // missing. The index is never rewritten from a failed read, so the
    // maintainer restores the entry with the index rebuild tool.
    console.error(`[bench] run committed at ${path} but the index append failed:`, error);
    return NextResponse.json(
      {
        ok: false,
        code: 'index-update-failed',
        path,
        url,
        message:
          'The run was saved to the public dataset, but the leaderboard index could not be updated, so it will not show on the leaderboard until the index is rebuilt. There is no need to submit it again.',
      },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, flagged, flags: checked.flags, path, url });
}
