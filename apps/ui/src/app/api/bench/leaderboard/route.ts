/**
 * GET /api/bench/leaderboard — aggregated leaderboard rows as JSON (used by
 * the bench pages for refresh and freely consumable by third parties).
 */

import { NextResponse } from 'next/server';
import { LEADERBOARD_PROTOCOL_VERSIONS } from '@localmode/bench';
import { aggregateIndex, benchStoreConfig, readIndex } from '@/lib/bench/store';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const config = benchStoreConfig();
  const repo = config?.repo ?? process.env.BENCH_GITHUB_REPO;
  if (!repo) {
    return NextResponse.json(
      { rows: [], runs: 0, repo: null, note: 'results store not configured' },
      { headers: { 'Cache-Control': 'public, s-maxage=60' } },
    );
  }
  const entries = await readIndex(repo, { next: { revalidate: 300 } });
  const rows = aggregateIndex(entries);
  return NextResponse.json(
    // Same rule as the rows: unflagged runs measured under a protocol the leaderboard shows.
    {
      rows,
      runs: entries.filter((e) => !e.flagged && !!e.protocol && LEADERBOARD_PROTOCOL_VERSIONS.includes(e.protocol)).length,
      protocols: LEADERBOARD_PROTOCOL_VERSIONS,
      repo,
    },
    {
      headers: {
        // Stale window capped to one revalidation period: with an hour of
        // stale-while-revalidate the edge kept serving a pre-submission copy
        // for 27 minutes after a run was published (observed 2026-09-19).
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=300',
        'Access-Control-Allow-Origin': '*',
      },
    },
  );
}
