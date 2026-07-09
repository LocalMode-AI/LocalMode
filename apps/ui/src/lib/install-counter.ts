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
 *
 * Measured against production: one `shadcn add <item>` increments the NAMED item
 * by 3 (the CLI fetches its JSON during resolve and install) and each transitive
 * registryDependency by 1. Compare like with like — a named-item count is not
 * directly comparable to a dependency's.
 *
 * VISIBILITY LAG: writes are deferred via `event.waitUntil()`, so a fresh install
 * typically surfaces in `/api/stats` a few minutes later, not immediately. Writes
 * are durable, only delayed — do not read a zero right after an install as a
 * lost count.
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

let protectedMemo: Set<string> | undefined;

/**
 * Registry item names (without the `.json` suffix) that require a token.
 *
 * Single source of truth for BOTH the proxy's auth gate and the public stats
 * filter. Keeping one definition is the point: a premium item that the proxy
 * gates must never have its install volume published by `/api/stats`, and two
 * independent copies of this list would eventually drift into exactly that leak.
 */
export function protectedItems(): Set<string> {
  if (protectedMemo === undefined) {
    protectedMemo = new Set(
      (process.env.REGISTRY_PROTECTED_ITEMS ?? 'ui/__protected-test')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }
  return protectedMemo;
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
 * Rejections are swallowed — a metrics outage must never fail a user's install —
 * but they are LOGGED. A silent catch would hide the one failure that matters:
 * an exhausted Redis quota stops the counter dead while every install keeps
 * succeeding, so the only symptom is a graph that quietly goes flat. The log line
 * gives Vercel runtime logs something to alert on.
 */
export function countInstall(item: string, now?: Date): Promise<unknown> | null {
  const redis = getRedis();
  if (!redis || !countingEnabled()) return null;

  return redis
    .pipeline()
    .hincrby(dayKey(utcDay(now)), item, 1)
    .hincrby(ALL_TIME_KEY, item, 1)
    .exec()
    .catch((error: unknown) => {
      console.error('[install-counter] tally write failed (install unaffected):', error);
    });
}

/** How long a read result is reused within one instance. */
const READ_MEMO_MS = 60_000;

let readMemo: { at: number; value: Tallies } | undefined;

export interface Tallies {
  /** UTC day the `today` tally covers. */
  date: string;
  /** Lifetime per-item fetch counts, protected items removed. */
  allTime: Record<string, number>;
  /** Today's per-item fetch counts, protected items removed. */
  today: Record<string, number>;
}

function withoutProtected(hash: Record<string, number> | null): Record<string, number> {
  const hidden = protectedItems();
  return Object.fromEntries(Object.entries(hash ?? {}).filter(([item]) => !hidden.has(item)));
}

/**
 * Read the public tallies. Takes no caller-controlled input by design: the
 * endpoint is unauthenticated, so the work per request must be constant. Costs
 * exactly two Redis commands in one round-trip, memoized for `READ_MEMO_MS`.
 *
 * Returns `null` when no store is bound.
 */
export async function readTallies(now: Date = new Date()): Promise<Tallies | null> {
  const redis = getRedis();
  if (!redis) return null;

  const date = utcDay(now);

  // Reuse only within the same UTC day, so `today` never reports yesterday.
  if (readMemo && readMemo.value.date === date && Date.now() - readMemo.at < READ_MEMO_MS) {
    return readMemo.value;
  }

  const [allTime, today] = await redis
    .pipeline()
    .hgetall<Record<string, number>>(ALL_TIME_KEY)
    .hgetall<Record<string, number>>(dayKey(date))
    .exec();

  const value: Tallies = {
    date,
    allTime: withoutProtected(allTime),
    today: withoutProtected(today),
  };
  readMemo = { at: Date.now(), value };
  return value;
}
