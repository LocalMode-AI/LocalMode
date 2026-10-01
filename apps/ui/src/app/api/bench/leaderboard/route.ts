/**
 * GET /api/bench/leaderboard — aggregated leaderboard rows as JSON (used by
 * the bench pages for refresh and freely consumable by third parties).
 */

import { NextResponse } from 'next/server';
import { benchStoreConfig } from '@/lib/bench/store';
import { getLeaderboardSnapshot } from '@/lib/bench/leaderboard-cache';

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
  const { rows, runs, protocols } = await getLeaderboardSnapshot(repo);
  return NextResponse.json(
    { rows, runs, protocols, repo },
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
