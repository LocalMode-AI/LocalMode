/**
 * Storage Quota Utilities
 *
 * Provides utilities for monitoring browser storage quota and managing data lifecycle.
 *
 * @packageDocumentation
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Storage quota information.
 */
export interface StorageQuota {
  /** Used storage in bytes */
  usedBytes: number;

  /** Total quota in bytes */
  quotaBytes: number;

  /** Percentage of quota used (0-100) */
  percentUsed: number;

  /** Whether storage is persisted (won't be evicted) */
  isPersisted: boolean;

  /** Available storage in bytes */
  availableBytes: number;
}

/**
 * Configuration for quota warnings.
 */
export interface QuotaWarningConfig {
  /** Warn at this usage percentage (default: 80) */
  warnAt?: number;

  /** Critical at this percentage (default: 95) */
  criticalAt?: number;

  /** Callback when warning threshold reached */
  onWarning?: (quota: StorageQuota) => void;

  /** Callback when critical threshold reached */
  onCritical?: (quota: StorageQuota) => void;
}

/**
 * Options for cleanup operations.
 */
export interface CleanupOptions {
  /** Delete documents older than this (e.g., '30d', '1w', '24h') */
  maxAge?: string;

  /** Keep at least this many documents */
  keepMinCount?: number;

  /** Target storage usage percentage after cleanup */
  targetUsage?: number;

  /** Collections to clean (default: all) */
  collections?: string[];

  /** Dry run - report what would be deleted without deleting */
  dryRun?: boolean;
}

/**
 * Result of a cleanup operation.
 */
export interface CleanupResult {
  /** Number of documents deleted */
  deletedCount: number;

  /** Estimated bytes freed */
  freedBytes: number;

  /** Documents that would have been deleted (dry run only) */
  toDelete?: string[];
}

// ============================================================================
// Storage Quota Functions
// ============================================================================

/**
 * Get current storage quota information.
 *
 * @returns Storage quota info or null if API not available
 *
 * @example
 * ```typescript
 * import { getStorageQuota } from '@localmode/core';
 *
 * const quota = await getStorageQuota();
 * if (quota) {
 *   console.log(`Using ${quota.percentUsed.toFixed(1)}% of storage`);
 *   console.log(`${(quota.availableBytes / 1024 / 1024).toFixed(1)} MB available`);
 * }
 * ```
 */
export async function getStorageQuota(): Promise<StorageQuota | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return null;
  }

  try {
    const estimate = await navigator.storage.estimate();
    const persisted = await navigator.storage.persisted?.() ?? false;

    const usedBytes = estimate.usage ?? 0;
    const quotaBytes = estimate.quota ?? 0;

    return {
      usedBytes,
      quotaBytes,
      percentUsed: quotaBytes > 0 ? (usedBytes / quotaBytes) * 100 : 0,
      isPersisted: persisted,
      availableBytes: Math.max(0, quotaBytes - usedBytes),
    };
  } catch {
    return null;
  }
}

/**
 * Request persistent storage to prevent data eviction.
 *
 * Browsers may evict IndexedDB data under storage pressure.
 * Requesting persistence tells the browser to keep the data.
 *
 * @returns true if persistence was granted
 *
 * @example
 * ```typescript
 * import { requestPersistence } from '@localmode/core';
 *
 * const granted = await requestPersistence();
 * if (granted) {
 *   console.log('Storage will not be evicted');
 * } else {
 *   console.log('Persistence not granted - data may be evicted under pressure');
 * }
 * ```
 */
export async function requestPersistence(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
    return false;
  }

  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/**
 * Check if storage is persisted.
 *
 * @returns true if storage is persisted
 */
export async function isStoragePersisted(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persisted) {
    return false;
  }

  try {
    return await navigator.storage.persisted();
  } catch {
    return false;
  }
}

/**
 * Check storage quota and invoke callbacks based on thresholds.
 *
 * @param config - Warning configuration
 * @returns 'ok' | 'warning' | 'critical' based on current usage
 *
 * @example
 * ```typescript
 * import { checkQuotaWithWarnings } from '@localmode/core';
 *
 * const status = await checkQuotaWithWarnings({
 *   warnAt: 80,
 *   criticalAt: 95,
 *   onWarning: (quota) => {
 *     console.warn(`Storage at ${quota.percentUsed.toFixed(1)}%`);
 *   },
 *   onCritical: (quota) => {
 *     console.error('Storage critical! Cleanup required.');
 *     showCleanupDialog();
 *   },
 * });
 * ```
 */
export async function checkQuotaWithWarnings(
  config: QuotaWarningConfig = {}
): Promise<'ok' | 'warning' | 'critical'> {
  const { warnAt = 80, criticalAt = 95, onWarning, onCritical } = config;

  const quota = await getStorageQuota();
  if (!quota) return 'ok';

  if (quota.percentUsed >= criticalAt) {
    onCritical?.(quota);
    return 'critical';
  }

  if (quota.percentUsed >= warnAt) {
    onWarning?.(quota);
    return 'warning';
  }

  return 'ok';
}

/**
 * Estimate how many documents can be stored with remaining quota.
 *
 * @param avgDocSizeBytes - Average document size in bytes
 * @returns Estimated number of documents that can be stored
 */
export async function estimateRemainingCapacity(avgDocSizeBytes: number): Promise<number> {
  const quota = await getStorageQuota();
  if (!quota || avgDocSizeBytes <= 0) return 0;

  return Math.floor(quota.availableBytes / avgDocSizeBytes);
}

// ============================================================================
// Age Parsing Utilities
// ============================================================================

/**
 * Parse an age string into milliseconds.
 *
 * @param age - Age string like '30d', '1w', '24h', '60m'
 * @returns Milliseconds
 *
 * @example
 * ```typescript
 * parseAge('30d'); // 30 days in ms
 * parseAge('1w');  // 1 week in ms
 * parseAge('24h'); // 24 hours in ms
 * ```
 */
export function parseAge(age: string): number {
  const match = age.match(/^(\d+)\s*(d|w|h|m|s)$/i);
  if (!match) {
    throw new Error(`Invalid age format: ${age}. Use format like '30d', '1w', '24h', '60m', '30s'`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
  };

  return value * (multipliers[unit] ?? 0);
}

/**
 * Format bytes into a human-readable string.
 *
 * @param bytes - Number of bytes
 * @returns Formatted string like '1.5 MB'
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}

// ============================================================================
// Storage Monitoring
// ============================================================================

/**
 * Options for storage monitoring.
 */
export interface StorageMonitorOptions {
  /** Check interval in milliseconds (default: 60000 = 1 minute) */
  intervalMs?: number;

  /** Warning threshold percentage (default: 80) */
  warnAt?: number;

  /** Critical threshold percentage (default: 95) */
  criticalAt?: number;

  /** Callback when status changes */
  onStatusChange?: (status: 'ok' | 'warning' | 'critical', quota: StorageQuota) => void;
}

/**
 * Start monitoring storage quota.
 *
 * @param options - Monitoring options
 * @returns Function to stop monitoring
 *
 * @example
 * ```typescript
 * const stopMonitoring = startStorageMonitor({
 *   intervalMs: 30000, // Check every 30 seconds
 *   onStatusChange: (status, quota) => {
 *     if (status === 'critical') {
 *       showStorageWarning();
 *     }
 *   },
 * });
 *
 * // Later, stop monitoring
 * stopMonitoring();
 * ```
 */
export function startStorageMonitor(options: StorageMonitorOptions = {}): () => void {
  const {
    intervalMs = 60000,
    warnAt = 80,
    criticalAt = 95,
    onStatusChange,
  } = options;

  let lastStatus: 'ok' | 'warning' | 'critical' = 'ok';
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const check = async () => {
    const quota = await getStorageQuota();
    if (!quota) return;

    let status: 'ok' | 'warning' | 'critical' = 'ok';
    if (quota.percentUsed >= criticalAt) {
      status = 'critical';
    } else if (quota.percentUsed >= warnAt) {
      status = 'warning';
    }

    if (status !== lastStatus) {
      lastStatus = status;
      onStatusChange?.(status, quota);
    }
  };

  // Initial check
  check();

  // Start interval
  intervalId = setInterval(check, intervalMs);

  // Return cleanup function
  return () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
}

