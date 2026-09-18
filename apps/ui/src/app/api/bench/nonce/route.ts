/**
 * GET /api/bench/nonce — issue a verified-tier session nonce. The runner
 * fetches this before a suite run and embeds it in the submitted result.
 */

import { NextResponse } from 'next/server';
import { issueNonce } from '@/lib/bench/nonce';

export const dynamic = 'force-dynamic';

export function GET(): NextResponse {
  return NextResponse.json(
    { nonce: issueNonce() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
