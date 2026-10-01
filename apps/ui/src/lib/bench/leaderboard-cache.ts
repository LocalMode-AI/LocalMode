/**
 * The cached leaderboard aggregate shared by GET /api/bench/leaderboard and
 * the /bench page. Server-only.
 */

import { unstable_cache } from 'next/cache';
import { LEADERBOARD_PROTOCOL_VERSIONS } from '@localmode/bench';
import {
  LEADERBOARD_REVALIDATE_SEC,
  computeLeaderboardSnapshot,
  type LeaderboardSnapshot,
} from '@/lib/bench/store';

/**
 * `computeLeaderboardSnapshot()` behind Next's data cache. The repository is
 * the call argument, so it is part of the cache key; the key parts carry the
 * protocol list so a release that changes it never reads an older aggregate.
 * The raw index fetch inside is `no-store`, so the only cached value is the
 * aggregate, which stays well under the 2 MB entry limit.
 */
const cachedSnapshot = unstable_cache(
  (repo: string) => computeLeaderboardSnapshot(repo),
  ['bench-leaderboard-snapshot', ...LEADERBOARD_PROTOCOL_VERSIONS],
  { revalidate: LEADERBOARD_REVALIDATE_SEC, tags: ['bench-leaderboard'] },
);

/** An empty board, rendered for one request when the index cannot be read. */
function emptySnapshot(): LeaderboardSnapshot {
  return {
    rows: [],
    runs: 0,
    protocols: [...LEADERBOARD_PROTOCOL_VERSIONS],
    recentSubmissions: [],
    entries: 0,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * The leaderboard snapshot for `repo`, cached for `LEADERBOARD_REVALIDATE_SEC`.
 * A failed index read is not cached: once a snapshot exists, Next keeps
 * serving it while it retries; before one exists, this request gets an empty
 * board and the next request tries again.
 */
export async function getLeaderboardSnapshot(repo: string): Promise<LeaderboardSnapshot> {
  try {
    return await cachedSnapshot(repo);
  } catch (err) {
    console.error(`[bench] could not read the leaderboard index for ${repo}:`, err);
    return emptySnapshot();
  }
}
