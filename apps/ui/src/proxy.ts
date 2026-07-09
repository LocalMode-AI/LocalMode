/**
 * @file proxy.ts
 * @description Optional token-gating for protected registry items on `/r/*`,
 * plus a privacy-preserving install counter. Implemented as a Next 16 `proxy`
 * (the successor to the deprecated `middleware` convention).
 *
 * Public items are served openly. An item is protected if its name (the `/r/`
 * path without the `.json` suffix) is listed in `PROTECTED_ITEMS`. Protected
 * items require `Authorization: Bearer <token>` where the token matches the
 * `REGISTRY_TOKEN` env var; otherwise the route returns 401. No premium items
 * ship today (the list is empty), so this is dormant infrastructure for the
 * future premium tier — but the enforcement path is live and testable.
 *
 * Installs are tallied here because proxy runs before the edge cache, and the
 * `/r/*.json` route is `force-static` behind a 24h CDN cache. The tally records
 * only `(itemName, UTC date)` — never an IP, user agent, session or cookie. It
 * is fire-and-forget via `event.waitUntil()`, so it adds no response latency,
 * and it swallows its own errors so a metrics outage can never fail an install.
 * See `src/lib/install-counter.ts`.
 */
import { NextResponse } from 'next/server';
import type { NextProxy } from 'next/server';

import { countInstall, isCliInstall, protectedItems } from '@/lib/install-counter';

export const config = {
  matcher: '/r/:path*',
};

const REGISTRY_TOKEN = process.env.REGISTRY_TOKEN ?? 'localmode-test-token';

export const proxy: NextProxy = (req, event) => {
  const { pathname } = req.nextUrl;

  // `/r/ui/device-badge.json` → item name `ui/device-badge`
  const itemName = pathname.replace(/^\/r\//, '').replace(/\.json$/, '');

  const tally = () => {
    if (!isCliInstall(req)) return;
    const counted = countInstall(itemName);
    if (counted) event.waitUntil(counted);
  };

  if (!protectedItems().has(itemName)) {
    tally();
    return NextResponse.next();
  }

  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';

  if (token && token === REGISTRY_TOKEN) {
    // Gated items are counted only once the caller clears auth, so rejected
    // probes never inflate the tally.
    tally();
    return NextResponse.next();
  }

  return new NextResponse(
    JSON.stringify({ error: 'Unauthorized: this registry item requires a token.' }),
    {
      status: 401,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'WWW-Authenticate': 'Bearer',
      },
    },
  );
};
