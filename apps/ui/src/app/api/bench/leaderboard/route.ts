/**
 * GET /api/bench/leaderboard — aggregated leaderboard rows as JSON (used by
 * the bench pages for refresh and freely consumable by third parties).
 */

import { NextResponse } from 'next/server';
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
    { rows, runs: entries.filter((e) => !e.flagged).length, repo },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
        'Access-Control-Allow-Origin': '*',
      },
    },
  );
}
