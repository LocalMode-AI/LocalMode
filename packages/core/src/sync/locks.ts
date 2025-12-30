/**
 * Cross-tab locking using the Web Locks API.
 * Ensures write operations are synchronized across browser tabs.
 */

/**
 * Web Locks API types (for environments that don't have them).
 */
interface LockRequestOptionsInternal {
  mode: 'exclusive' | 'shared';
  ifAvailable?: boolean;
  steal?: boolean;
  signal?: AbortSignal;
}

interface LockInfoInternal {
  name?: string;
  mode?: 'exclusive' | 'shared';
  clientId?: string;
}

interface LockManagerSnapshot {
  held?: LockInfoInternal[];
  pending?: LockInfoInternal[];
}

/**
 * Lock mode for database operations.
 */
export type LockMode = 'shared' | 'exclusive';

/**
 * Lock options for acquiring locks.
 */
export interface LockOptions {
  /** Lock mode: 'shared' for reads, 'exclusive' for writes */
  mode?: LockMode;
  /** Timeout in milliseconds (0 = no timeout) */
  timeout?: number;
  /** If true, fail immediately if lock is not available */
  ifAvailable?: boolean;
  /** Signal to abort the lock request */
  signal?: AbortSignal;
}

/**
 * Lock manager for cross-tab synchronization.
 */
export class LockManager {
  private dbName: string;
  private lockPrefix: string;

  constructor(dbName: string) {
    this.dbName = dbName;
    this.lockPrefix = `vectordb_${dbName}_`;
  }

  /**
   * Check if Web Locks API is available.
   */
  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'locks' in navigator;
  }

  /**
   * Get the full lock name for a resource.
   */
  private getLockName(resource: string): string {
    return `${this.lockPrefix}${resource}`;
  }

  /**
   * Acquire a lock and execute a callback.
   * Falls back to immediate execution if Web Locks is not available.
   */
  async withLock<T>(
    resource: string,
    callback: () => Promise<T>,
    options: LockOptions = {}
  ): Promise<T> {
    if (!LockManager.isSupported()) {
      // Fallback: execute without locking
      return callback();
    }

    const lockName = this.getLockName(resource);
    const mode = options.mode ?? 'exclusive';

    // Build lock options
    const lockOptions: LockRequestOptionsInternal = {
      mode,
      ifAvailable: options.ifAvailable,
      signal: options.signal,
    };

    return new Promise<T>((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let abortController: AbortController | null = null;

      // Handle timeout
      if (options.timeout && options.timeout > 0) {
        abortController = new AbortController();
        lockOptions.signal = lockOptions.signal
          ? combineSignals(lockOptions.signal, abortController.signal)
          : abortController.signal;

        timeoutId = setTimeout(() => {
          abortController?.abort();
          reject(new Error(`Lock timeout: ${resource}`));
        }, options.timeout);
      }

      navigator.locks
        .request(lockName, lockOptions, async () => {
          try {
            const result = await callback();
            resolve(result);
          } catch (error) {
            reject(error);
          } finally {
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
          }
        })
        .catch((error: Error) => {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }

          // Handle specific lock errors
          if (error.name === 'AbortError') {
            if (options.ifAvailable) {
              reject(new Error(`Lock not available: ${resource}`));
            } else {
              reject(new Error(`Lock aborted: ${resource}`));
            }
          } else {
            reject(error);
          }
        });
    });
  }

  /**
   * Acquire a read lock (shared).
   */
  async withReadLock<T>(resource: string, callback: () => Promise<T>): Promise<T> {
    return this.withLock(resource, callback, { mode: 'shared' });
  }

  /**
   * Acquire a write lock (exclusive).
   */
  async withWriteLock<T>(resource: string, callback: () => Promise<T>): Promise<T> {
    return this.withLock(resource, callback, { mode: 'exclusive' });
  }

  /**
   * Try to acquire a lock immediately, returning null if not available.
   */
  async tryLock<T>(
    resource: string,
    callback: () => Promise<T>,
    mode: LockMode = 'exclusive'
  ): Promise<T | null> {
    if (!LockManager.isSupported()) {
      return callback();
    }

    const lockName = this.getLockName(resource);

    return new Promise<T | null>((resolve, reject) => {
      navigator.locks
        .request(lockName, { mode, ifAvailable: true }, async (lock) => {
          if (!lock) {
            resolve(null);
            return;
          }

          try {
            const result = await callback();
            resolve(result);
          } catch (error) {
            reject(error);
          }
        })
        .catch(reject);
    });
  }

  /**
   * Get information about held locks (for debugging).
   */
  async getLockState(): Promise<{ held: string[]; pending: string[] }> {
    if (!LockManager.isSupported()) {
      return { held: [], pending: [] };
    }

    const state = (await navigator.locks.query()) as LockManagerSnapshot;
    const prefix = this.lockPrefix;

    return {
      held: (state.held ?? [])
        .filter((lock) => lock.name?.startsWith(prefix))
        .map((lock) => (lock.name ?? '').replace(prefix, '')),
      pending: (state.pending ?? [])
        .filter((lock) => lock.name?.startsWith(prefix))
        .map((lock) => (lock.name ?? '').replace(prefix, '')),
    };
  }
}

/**
 * Combine multiple AbortSignals into one.
 */
function combineSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  return controller.signal;
}

/**
 * Default lock manager instance (lazily created).
 */
let defaultLockManager: LockManager | null = null;

/**
 * Get or create the default lock manager for a database.
 */
export function getLockManager(dbName: string): LockManager {
  if (!defaultLockManager || defaultLockManager['dbName'] !== dbName) {
    defaultLockManager = new LockManager(dbName);
  }
  return defaultLockManager;
}
