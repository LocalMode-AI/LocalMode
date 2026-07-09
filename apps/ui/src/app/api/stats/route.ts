/**
 * @file route.ts
 * @description Public read endpoint for the registry fetch tallies written by
 * `proxy.ts`. The underlying records are counters keyed by
 * `(itemName, UTC date)` with no visitor data of any kind, so there is nothing to deanonymize.
 */
import { NextResponse } from 'next/server';

import { readTallies } from '@/lib/install-counter';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const tallies = await readTallies();

    if (!tallies) {
      return NextResponse.json(
        { error: 'Install stats are not configured for this deployment.' },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        unit: 'registry-fetches',
        date: tallies.date,
        allTime: tallies.allTime,
        today: tallies.today,
        generatedAt: new Date().toISOString(),
      },
      {
        headers: {
          // One cache key (no query params), so the CDN absorbs nearly all reads.
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
          'Access-Control-Allow-Origin': '*',
        },
      },
    );
  } catch {
    return NextResponse.json({ error: 'Failed to read install stats.' }, { status: 502 });
  }
}
