/**
 * @file use-object-url.test.ts
 * @description Tests for the useObjectUrl helper hook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useObjectUrl } from '../src/helpers/use-object-url.js';

// BOUNDARY NOTE: jsdom does not implement URL.createObjectURL /
// URL.revokeObjectURL, so both are stubbed here. The stub IS the boundary
// this hook talks to — the assertions cover the full create/revoke
// contract (revoke-on-change AND revoke-on-unmount), which is exactly the
// leak class the hand-rolled versions in the audio registry components
// guard against. Actual blob playback must be verified in a browser.

const created: string[] = [];
const revoked: string[] = [];
let counter = 0;

const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;

beforeEach(() => {
  created.length = 0;
  revoked.length = 0;
  counter = 0;
  URL.createObjectURL = vi.fn(() => {
    const url = `blob:mock-${counter++}`;
    created.push(url);
    return url;
  });
  URL.revokeObjectURL = vi.fn((url: string) => {
    revoked.push(url);
  });
});

afterEach(() => {
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
});

describe('useObjectUrl', () => {
  it('returns null for a null blob without creating any URL', () => {
    const { result } = renderHook(() => useObjectUrl(null));
    expect(result.current).toBeNull();
    expect(created).toEqual([]);
    expect(revoked).toEqual([]);
  });

  it('creates an object URL for a blob and returns it', () => {
    const blob = new Blob(['audio'], { type: 'audio/wav' });
    const { result } = renderHook(() => useObjectUrl(blob));

    expect(result.current).toBe('blob:mock-0');
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(revoked).toEqual([]);
  });

  it('revokes the previous URL and creates a new one when the blob changes', () => {
    const blobA = new Blob(['a'], { type: 'audio/wav' });
    const blobB = new Blob(['b'], { type: 'audio/wav' });

    const { result, rerender } = renderHook(({ blob }) => useObjectUrl(blob), {
      initialProps: { blob: blobA as Blob | null },
    });
    expect(result.current).toBe('blob:mock-0');

    rerender({ blob: blobB });

    // Old URL revoked, new URL created and returned.
    expect(revoked).toEqual(['blob:mock-0']);
    expect(result.current).toBe('blob:mock-1');
    expect(created).toEqual(['blob:mock-0', 'blob:mock-1']);
  });

  it('revokes and returns null when the blob becomes null', () => {
    const blob = new Blob(['a'], { type: 'audio/wav' });
    const { result, rerender } = renderHook(({ b }) => useObjectUrl(b), {
      initialProps: { b: blob as Blob | null },
    });
    expect(result.current).toBe('blob:mock-0');

    rerender({ b: null });

    expect(revoked).toEqual(['blob:mock-0']);
    expect(result.current).toBeNull();
  });

  it('revokes the URL on unmount', () => {
    const blob = new Blob(['a'], { type: 'audio/wav' });
    const { result, unmount } = renderHook(() => useObjectUrl(blob));
    expect(result.current).toBe('blob:mock-0');
    expect(revoked).toEqual([]);

    unmount();

    expect(revoked).toEqual(['blob:mock-0']);
  });

  it('does not recreate the URL when re-rendered with the same blob instance', () => {
    const blob = new Blob(['a'], { type: 'audio/wav' });
    const { result, rerender } = renderHook(({ b }) => useObjectUrl(b), {
      initialProps: { b: blob },
    });
    expect(result.current).toBe('blob:mock-0');

    rerender({ b: blob });

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(revoked).toEqual([]);
    expect(result.current).toBe('blob:mock-0');
  });

  it('accepts undefined and returns null', () => {
    const { result } = renderHook(() => useObjectUrl(undefined));
    expect(result.current).toBeNull();
    expect(created).toEqual([]);
  });
});
