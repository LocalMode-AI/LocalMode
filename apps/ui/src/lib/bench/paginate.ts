/**
 * Client-side pagination arithmetic for the leaderboard table: pure, so the
 * clamping and the "Showing x to y of n" label are unit-tested away from React.
 */

export const LEADERBOARD_PAGE_SIZES = [25, 50, 100] as const;
export const LEADERBOARD_DEFAULT_PAGE_SIZE: (typeof LEADERBOARD_PAGE_SIZES)[number] = 25;

export interface PageWindow {
  /** 1-based page actually shown (clamped into range; 1 when there are no rows). */
  page: number;
  /** Total pages (at least 1). */
  pageCount: number;
  /** Slice bounds into the row list: `rows.slice(start, end)`. */
  start: number;
  end: number;
  /** "Showing 26 to 50 of 377 rows", or "No rows match the filters". */
  label: string;
}

/**
 * Resolve the page window for `total` rows at `pageSize` rows per page.
 * A requested page past the end (after a filter shrinks the list) clamps to
 * the last page instead of showing an empty table.
 *
 * @example
 * pageWindow(377, 16, 25); // { page: 16, pageCount: 16, start: 375, end: 377, label: 'Showing 376 to 377 of 377 rows' }
 */
export function pageWindow(total: number, requestedPage: number, pageSize: number): PageWindow {
  const size = Math.max(1, Math.floor(pageSize));
  const pageCount = Math.max(1, Math.ceil(Math.max(0, total) / size));
  const page = Math.min(pageCount, Math.max(1, Math.floor(requestedPage) || 1));
  const start = total === 0 ? 0 : (page - 1) * size;
  const end = Math.min(total, start + size);
  const label = total === 0 ? 'No rows match the filters' : `Showing ${start + 1} to ${end} of ${total} rows`;
  return { page, pageCount, start, end, label };
}
