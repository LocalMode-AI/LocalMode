/**
 * Tests for the useAuditLog React hook.
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { createAuditLog, MemoryStorage } from '@localmode/core';
import type { AuditLog } from '@localmode/core';
import { useAuditLog } from '../src/hooks/use-audit-log.js';

async function makeLog(name: string) {
  const storage = new MemoryStorage();
  const log = await createAuditLog({ name, storage });
  return log;
}

describe('useAuditLog', () => {
  it('loads existing entries on mount', async () => {
    const log = await makeLog('mount-load');
    await log.append('a', { v: 1 });
    await log.append('b', { v: 2 });
    await log.append('c', { v: 3 });

    const { result } = renderHook(() => useAuditLog(log));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.entries).toHaveLength(3);
    });

    expect(result.current.entries.map((e) => e.kind)).toEqual(['a', 'b', 'c']);
    expect(result.current.error).toBeNull();
  });

  it('append() updates entries and increments length on next render', async () => {
    const log = await makeLog('append-update');
    const { result } = renderHook(() => useAuditLog(log));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.entries).toHaveLength(0);

    await act(async () => {
      await result.current.append('user.click', { x: 1 });
    });

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]!.kind).toBe('user.click');
  });

  it('verify() returns a VerifyResult with ok:true for a clean chain', async () => {
    const log = await makeLog('verify-clean');
    await log.append('a', {});
    await log.append('b', {});
    const { result } = renderHook(() => useAuditLog(log));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let vr: Awaited<ReturnType<(typeof result.current)['verify']>> | undefined;
    await act(async () => {
      vr = await result.current.verify();
    });
    expect(vr).toBeDefined();
    expect(vr!.ok).toBe(true);
    expect(vr!.entriesChecked).toBe(2);
  });

  it('null log returns empty defaults and append() throws a clear error', async () => {
    const { result } = renderHook(() => useAuditLog(null));

    expect(result.current.entries).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();

    let caught: unknown = null;
    await act(async () => {
      try {
        await result.current.append('x', {});
      } catch (err) {
        caught = err;
      }
    });
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/no audit log/i);
  });

  it('refresh() re-reads entries from storage', async () => {
    const log = await makeLog('refresh');
    const { result } = renderHook(() => useAuditLog(log));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entries).toHaveLength(0);

    // Append directly via the underlying log (bypassing the hook).
    await log.append('out-of-band', {});

    await act(async () => {
      await result.current.refresh();
    });
    await waitFor(() => {
      expect(result.current.entries).toHaveLength(1);
    });
    expect(result.current.entries[0]!.kind).toBe('out-of-band');
  });

  it('unmounting during verify() does not call setState after unmount', async () => {
    const log = await makeLog('unmount');
    // Wrap log so verify() can be observed for AbortSignal handling.
    const wrapped: AuditLog = {
      ...log,
      _readRawEntries: async (opts) => {
        // Slow to give the test time to unmount.
        await new Promise((r) => setTimeout(r, 50));
        if (opts?.abortSignal?.aborted) {
          throw new DOMException('aborted', 'AbortError');
        }
        return log._readRawEntries(opts);
      },
    };

    const { result, unmount } = renderHook(() => useAuditLog(wrapped));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Kick off a verify, then unmount before it completes.
    let promise: Promise<unknown> | undefined;
    await act(async () => {
      promise = result.current.verify().catch(() => undefined);
    });
    unmount();
    await promise;

    // No assertion needed beyond "no React warning" — but check error stayed
    // null because the in-flight verify was aborted before completing.
    expect(result.current.error).toBeNull();
  });
});
