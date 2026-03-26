/**
 * Privacy Budget Tracker
 *
 * Tracks cumulative privacy loss (epsilon) across differential privacy
 * operations. Supports optional IndexedDB persistence following the
 * Keystore pattern from security/keystore.ts.
 *
 * @packageDocumentation
 */

import type { PrivacyBudget, PrivacyBudgetConfig } from './dp-types.js';
import { PrivacyBudgetExhaustedError } from '../errors/index.js';

// ============================================================================
// IndexedDB Persistence (follows Keystore pattern)
// ============================================================================

/** Database name for privacy budget persistence. */
const BUDGET_DB_NAME = 'localmode_privacy_budget';
const BUDGET_DB_VERSION = 1;
const BUDGET_STORE_NAME = 'budgets';

/** Stored budget state in IndexedDB. */
interface StoredBudgetState {
  /** Persistence key (primary key) */
  key: string;
  /** Cumulative epsilon consumed */
  consumed: number;
  /** Maximum epsilon allowed */
  maxEpsilon: number;
  /** Timestamp of last update */
  updatedAt: number;
}

/**
 * Open the budget persistence database.
 */
async function openBudgetDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(BUDGET_DB_NAME, BUDGET_DB_VERSION);

    request.onerror = () =>
      reject(new Error(`Failed to open privacy budget store: ${request.error?.message}`));

    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(BUDGET_STORE_NAME)) {
        db.createObjectStore(BUDGET_STORE_NAME, { keyPath: 'key' });
      }
    };
  });
}

/**
 * Load budget state from IndexedDB.
 */
async function loadBudgetState(persistKey: string): Promise<StoredBudgetState | null> {
  let db: IDBDatabase;
  try {
    db = await openBudgetDB();
  } catch {
    // IndexedDB not available (e.g., private browsing) — fall back to in-memory
    return null;
  }

  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(BUDGET_STORE_NAME, 'readonly');
      const store = tx.objectStore(BUDGET_STORE_NAME);
      const request = store.get(persistKey);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result ?? null);
    });
  } finally {
    db.close();
  }
}

/**
 * Save budget state to IndexedDB.
 */
async function saveBudgetState(state: StoredBudgetState): Promise<void> {
  let db: IDBDatabase;
  try {
    db = await openBudgetDB();
  } catch {
    // IndexedDB not available — silently skip persistence
    return;
  }

  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(BUDGET_STORE_NAME, 'readwrite');
      const store = tx.objectStore(BUDGET_STORE_NAME);
      const request = store.put(state);

      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve();
    });
  } finally {
    db.close();
  }
}

// ============================================================================
// Privacy Budget Implementation
// ============================================================================

/**
 * Create a privacy budget tracker.
 *
 * Tracks cumulative epsilon usage across differential privacy operations.
 * Optionally persists state to IndexedDB for cross-session tracking.
 *
 * @param config - Budget configuration
 * @returns Privacy budget tracker
 *
 * @example
 * ```ts
 * import { createPrivacyBudget } from '@localmode/core';
 *
 * const budget = await createPrivacyBudget({
 *   maxEpsilon: 10.0,
 *   persistKey: 'my-app-budget',
 *   onExhausted: 'block',
 * });
 *
 * // Each DP operation consumes epsilon
 * budget.consume(1.0);
 * console.log(budget.remaining()); // 9.0
 *
 * // Check if budget is exhausted
 * if (budget.isExhausted()) {
 *   console.warn('Privacy budget exhausted');
 * }
 *
 * // Clean up when done
 * await budget.destroy();
 * ```
 */
export async function createPrivacyBudget(config: PrivacyBudgetConfig): Promise<PrivacyBudget> {
  const {
    maxEpsilon,
    collectionId,
    persistKey,
    onExhausted = 'warn',
  } = config;

  // Build the storage key from persistKey and optional collectionId
  const storageKey = persistKey
    ? collectionId
      ? `${persistKey}:${collectionId}`
      : persistKey
    : undefined;

  // Load persisted state if available
  let consumedEpsilon = 0;
  if (storageKey) {
    const stored = await loadBudgetState(storageKey);
    if (stored) {
      consumedEpsilon = stored.consumed;
    }
  }

  /** Persist current state (debounced on destroy, immediate on consume). */
  async function persist(): Promise<void> {
    if (!storageKey) return;
    await saveBudgetState({
      key: storageKey,
      consumed: consumedEpsilon,
      maxEpsilon,
      updatedAt: Date.now(),
    });
  }

  return {
    consume(epsilon: number): void {
      if (epsilon <= 0) {
        throw new Error('Epsilon must be positive');
      }

      consumedEpsilon += epsilon;

      if (consumedEpsilon >= maxEpsilon) {
        if (onExhausted === 'block') {
          // Undo the consumption before throwing
          consumedEpsilon -= epsilon;
          throw new PrivacyBudgetExhaustedError(maxEpsilon, consumedEpsilon);
        }
        // 'warn' policy: log and continue
        console.warn(
          `[LocalMode] Privacy budget exhausted: consumed ${consumedEpsilon.toFixed(2)} of ${maxEpsilon.toFixed(2)} epsilon`
        );
      }

      // Fire-and-forget persistence
      if (storageKey) {
        void persist();
      }
    },

    remaining(): number {
      return maxEpsilon - consumedEpsilon;
    },

    isExhausted(): boolean {
      return consumedEpsilon >= maxEpsilon;
    },

    consumed(): number {
      return consumedEpsilon;
    },

    reset(): void {
      consumedEpsilon = 0;
      if (storageKey) {
        void persist();
      }
    },

    async destroy(): Promise<void> {
      if (storageKey) {
        await persist();
      }
    },
  };
}
