/**
 * Leaderboard pagination arithmetic (pure): page clamping after a filter
 * shrinks the list, slice bounds, and the visible label.
 */

import { describe, expect, it } from 'vitest';
import { LEADERBOARD_DEFAULT_PAGE_SIZE, LEADERBOARD_PAGE_SIZES, pageWindow } from '../src/lib/bench/paginate';

describe('pageWindow()', () => {
  it('slices the requested page and labels it 1-based', () => {
    expect(pageWindow(377, 1, 25)).toEqual({ page: 1, pageCount: 16, start: 0, end: 25, label: 'Showing 1 to 25 of 377 rows' });
    expect(pageWindow(377, 2, 25)).toEqual({ page: 2, pageCount: 16, start: 25, end: 50, label: 'Showing 26 to 50 of 377 rows' });
    expect(pageWindow(377, 16, 25)).toEqual({ page: 16, pageCount: 16, start: 375, end: 377, label: 'Showing 376 to 377 of 377 rows' });
  });

  it('clamps a page past the end (a filter shrank the list) to the last page, never an empty table', () => {
    expect(pageWindow(30, 9, 25)).toEqual({ page: 2, pageCount: 2, start: 25, end: 30, label: 'Showing 26 to 30 of 30 rows' });
    expect(pageWindow(30, 0, 25).page).toBe(1);
    expect(pageWindow(30, -3, 25).page).toBe(1);
    expect(pageWindow(30, Number.NaN, 25).page).toBe(1);
  });

  it('handles an empty list and a list that fits on one page', () => {
    expect(pageWindow(0, 4, 25)).toEqual({ page: 1, pageCount: 1, start: 0, end: 0, label: 'No rows match the filters' });
    expect(pageWindow(12, 1, 25)).toEqual({ page: 1, pageCount: 1, start: 0, end: 12, label: 'Showing 1 to 12 of 12 rows' });
  });

  it('exposes the page-size options with 25 as the default', () => {
    expect([...LEADERBOARD_PAGE_SIZES]).toEqual([25, 50, 100]);
    expect(LEADERBOARD_DEFAULT_PAGE_SIZE).toBe(25);
    expect(pageWindow(101, 2, 100)).toEqual({ page: 2, pageCount: 2, start: 100, end: 101, label: 'Showing 101 to 101 of 101 rows' });
  });
});
