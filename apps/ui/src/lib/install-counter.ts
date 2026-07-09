/**
 * @file install-counter.ts
 * @description Privacy-preserving registry install tallies, shared by `proxy.ts`
 * (the write path) and the `/api/stats` route (the read path).
 *
 * WHAT IS RECORDED: a counter keyed by `(itemName, UTC date)` and nothing else.
 * No IP, no user agent, no session, no cookie, no fingerprint is ever stored.
 * There is no record about a person, so there is nothing to deanonymize — which
 * is what makes it safe to publish these numbers openly.
 *
 * WHY THE PROXY: `/r/*.json` is served `force-static` behind a 24h CDN cache, so
 * the route handler rarely executes. Proxy runs before the edge cache and is the
 * only place that observes every install.
 *
 * WHAT IT COUNTS: fetches, not humans. CI reinstalls, Docker builds and retries
 * all increment it, and installing an aggregate (`ui/all`, `ui/<family>`) fans
 * out into one fetch per member item. Read these numbers the way you read npm
 * download counts.
 */
import { Redis } from '@upstash/redis';

/**
 * The Vercel Marketplace Upstash integration injects `UPSTASH_REDIS_REST_*`;
 * stores migrated from the sunset Vercel KV carry the legacy `KV_REST_API_*`
 * names. Accept either so provisioning order never matters.
 */
function credentials(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

let client: Redis | null | undefined;

/** Memoized client, or `null` when no store is bound (local dev, previews). */
export function getRedis(): Redis | null {
  if (client === undefined) {
    const creds = credentials();
    client = creds ? new Redis(creds) : null;
  }
  return client;
}

/** Redis key holding one UTC day's per-item install tally (a hash). */
export const dayKey = (date: string) => `installs:${date}`;

/** Redis key holding the lifetime per-item install tally (a hash). */
export const ALL_TIME_KEY = 'installs:all-time';

/** Current UTC day as `YYYY-MM-DD`. */
export const utcDay = (now: Date = new Date()) => now.toISOString().slice(0, 10);

/**
 * True when a request is a shadcn CLI install.
 *
 * The CLI (v4.x) sends a bare constant `User-Agent: shadcn` plus an
 * `Accept: application/vnd.shadcn.v1+json` header. Neither carries a version, a
 * runtime, nor any identifier, so matching on them reveals nothing about who is
 * installing — only that an install happened. Browsers and crawlers never match,
 * so they never trigger a write.
 */
export function isCliInstall(req: Request): boolean {
  if (req.method !== 'GET') return false;
  if (req.headers.get('user-agent') === 'shadcn') return true;
  return req.headers.get('accept')?.includes('application/vnd.shadcn') ?? false;
}

/**
 * Whether writes are enabled. Preview and local deploys must not pollute the
 * production counters.
 */
export function countingEnabled(): boolean {
  return getRedis() !== null && process.env.VERCEL_ENV === 'production';
}

/**
 * Increment the `(item, day)` and lifetime tallies in a single pipelined
 * round-trip. Returns `null` when counting is disabled.
 *
 * Rejections are swallowed: a metrics outage must never fail a user's install.
 */
export function countInstall(item: string, now?: Date): Promise<unknown> | null {
  const redis = getRedis();
  if (!redis || !countingEnabled()) return null;

  return redis
    .pipeline()
    .hincrby(dayKey(utcDay(now)), item, 1)
    .hincrby(ALL_TIME_KEY, item, 1)
    .exec()
    .catch(() => {
      // Intentionally silent — see the contract above.
    });
}
