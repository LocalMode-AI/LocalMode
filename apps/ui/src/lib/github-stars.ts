/**
 * @file github-stars.ts
 * @description Server-only GitHub star count, fetched at build time with daily
 * ISR revalidation. The visitor's browser never calls the GitHub API — the
 * count is baked into the server-rendered header — keeping the marketing site
 * consistent with LocalMode's no-client-telemetry ethos. Returns null on any
 * failure so the header degrades gracefully and the build never breaks.
 */
const REPO = 'LocalMode-AI/LocalMode';

/** Fetch the repo star count (server-side, ISR-cached daily); null on failure. */
export async function getGitHubStars(): Promise<number | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'localmode-ui',
      },
      // Revalidate once a day — no per-visitor request.
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { stargazers_count?: number };
    return typeof data.stargazers_count === 'number' ? data.stargazers_count : null;
  } catch {
    return null;
  }
}

/** Format a star count compactly, e.g. 1234 → "1.2k". */
export function formatStars(count: number): string {
  if (count < 1000) return String(count);
  return `${(count / 1000).toFixed(count < 10000 ? 1 : 0)}k`;
}
