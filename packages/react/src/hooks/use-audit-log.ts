/**
 * @file use-audit-log.ts
 * @description React hook over a `@localmode/core` AuditLog instance.
 *              Loads entries on mount, exposes append/verify/refresh, and
 *              cleans up via AbortController on unmount.
 *
 * Append-only contract: there is intentionally no `clear` field on the
 * return type.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type {
  AuditLog,
  AuditEntry,
  AuditLogVerifyResult as VerifyResult,
} from '@localmode/core';

const IS_SERVER = typeof window === 'undefined';

/** Options for configuring the useAuditLog hook. */
export interface UseAuditLogOptions {
  /** Whether to load entries on mount. Defaults to `true`. */
  autoLoad?: boolean;
}

/** Return type from the useAuditLog hook. */
export interface UseAuditLogReturn {
  /** Entries in chain order, oldest first. */
  entries: AuditEntry[];
  /** True while the initial load or refresh is in flight. */
  isLoading: boolean;
  /** Last error from append/verify/refresh, or null. */
  error: Error | null;
  /** Append an entry. Updates `entries` on success. */
  append: (kind: string, payload: unknown) => Promise<AuditEntry>;
  /** Run `verifyChain` against the log. */
  verify: () => Promise<VerifyResult>;
  /** Re-read `entries` from storage. */
  refresh: () => Promise<void>;
}

/**
 * React hook that wraps an {@link AuditLog} instance.
 *
 * @example
 * ```tsx
 * const log = await createAuditLog({ name: 'app', signatureKey });
 * function AuditPanel({ log }: { log: AuditLog }) {
 *   const { entries, append, verify, isLoading, error } = useAuditLog(log);
 *   return (
 *     <div>
 *       {entries.map((e) => <div key={e.id}>{e.kind}</div>)}
 *       <button onClick={() => append('user.click', {})}>Log click</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useAuditLog(
  log: AuditLog | null,
  options: UseAuditLogOptions = {}
): UseAuditLogReturn {
  const { autoLoad = true } = options;

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(autoLoad && log !== null);
  const [error, setError] = useState<Error | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  // Cleanup on unmount.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  // Initial load.
  useEffect(() => {
    if (IS_SERVER) return;
    if (!log) {
      setEntries([]);
      setIsLoading(false);
      setError(null);
      return;
    }
    if (!autoLoad) {
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);

    log
      .list({ abortSignal: controller.signal })
      .then((loaded) => {
        if (!mountedRef.current || controller.signal.aborted) return;
        setEntries(loaded);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (!mountedRef.current) return;
        if (err instanceof DOMException && err.name === 'AbortError') {
          setIsLoading(false);
          return;
        }
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [log, autoLoad]);

  const append = useCallback(
    async (kind: string, payload: unknown): Promise<AuditEntry> => {
      if (!log) {
        const err = new Error(
          'useAuditLog: no audit log provided — pass a non-null AuditLog instance to call append'
        );
        setError(err);
        throw err;
      }
      try {
        const e = await log.append(kind, payload);
        if (mountedRef.current) {
          setEntries((prev) => [...prev, e]);
        }
        return e;
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
        throw err;
      }
    },
    [log]
  );

  const verify = useCallback(async (): Promise<VerifyResult> => {
    if (!log) {
      const err = new Error(
        'useAuditLog: no audit log provided — pass a non-null AuditLog instance to call verify'
      );
      setError(err);
      throw err;
    }
    const controller = abortControllerRef.current ?? new AbortController();
    if (!abortControllerRef.current) {
      abortControllerRef.current = controller;
    }
    // Lazy import keeps the React package's bundle clean of core-only modules.
    const { verifyChain } = await import('@localmode/core');
    try {
      const result = await verifyChain(log, { abortSignal: controller.signal });
      return result;
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
      throw err;
    }
  }, [log]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!log) return;
    const controller = new AbortController();
    abortControllerRef.current?.abort();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const loaded = await log.list({ abortSignal: controller.signal });
      if (mountedRef.current && !controller.signal.aborted) {
        setEntries(loaded);
        setIsLoading(false);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      if (err instanceof DOMException && err.name === 'AbortError') {
        setIsLoading(false);
        return;
      }
      setError(err instanceof Error ? err : new Error(String(err)));
      setIsLoading(false);
    }
  }, [log]);

  return { entries, isLoading, error, append, verify, refresh };
}
