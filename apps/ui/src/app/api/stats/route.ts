/**
 * @file route.ts
 * @description Public read endpoint for the registry install tallies written by
 * `proxy.ts`. Returns per-item lifetime totals plus a trailing daily window.
 *
 * Safe to expose openly: the underlying records are counters keyed by
 * `(itemName, UTC date)` with no visitor data of any kind. Counts are fetches,
 * not humans — aggregate installs fan out into one fetch per member item, and
 * CI reinstalls increment the same as a person would. Read them like npm
 * download counts.
 */
import { NextResponse } from 'next/server';

import { ALL_TIME_KEY, dayKey, getRedis, utcDay } from '@/lib/install-counter';

/** Trailing days returned in the `daily` window. Clamped to keep reads cheap. */
const DEFAULT_DAYS = 30;
const MAX_DAYS = 90;

export const dynamic = 'force-dynamic';

/** UTC dates for the `days` most recent days, newest first. */
function recentDays(days: number, now = new Date()): string[] {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    return utcDay(d);
  });
}

export async function GET(req: Request) {
  const redis = getRedis();
  if (!redis) {
    return NextResponse.json(
      { error: 'Install stats are not configured for this deployment.' },
      { status: 503 },
    );
  }

  const requested = Number(new URL(req.url).searchParams.get('days') ?? DEFAULT_DAYS);
  const days = Number.isFinite(requested)
    ? Math.min(Math.max(Math.trunc(requested), 1), MAX_DAYS)
    : DEFAULT_DAYS;

  const dates = recentDays(days);

  try {
    const [allTime, ...windows] = await Promise.all([
      redis.hgetall<Record<string, number>>(ALL_TIME_KEY),
      ...dates.map((d) => redis.hgetall<Record<string, number>>(dayKey(d))),
    ]);

    const daily = Object.fromEntries(
      dates.map((date, i) => [date, windows[i] ?? {}]),
    );

    return NextResponse.json(
      { allTime: allTime ?? {}, daily, generatedAt: new Date().toISOString() },
      {
        headers: {
          // Counters move slowly; let the CDN absorb the read traffic.
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
          'Access-Control-Allow-Origin': '*',
        },
      },
    );
  } catch {
    return NextResponse.json({ error: 'Failed to read install stats.' }, { status: 502 });
  }
}
