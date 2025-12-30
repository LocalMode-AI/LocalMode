/**
 * Storage Cleanup Utilities
 *
 * Provides lifecycle management for VectorDB data including
 * cleanup strategies based on age, count, and storage usage.
 *
 * @packageDocumentation
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Options for cleanup operations.
 */
export interface CleanupOptions {
  /**
   * Delete documents older than this duration.
   * Supports formats like '30d', '24h', '1w', '2m'.
   */
  maxAge?: string;

  /**
   * Keep at least this many documents (most recent).
   * Applied after maxAge filter.
   */
  keepMinCount?: number;

  /**
   * Target storage usage percentage (0-100).
   * Will delete oldest documents until this target is reached.
   */
  targetUsagePercent?: number;

  /**
   * Collections to clean (default: all).
   */
  collections?: string[];

  /**
   * Dry run - calculate what would be deleted without actually deleting.
   */
  dryRun?: boolean;

  /**
   * Batch size for deletion operations.
   */
  batchSize?: number;

  /**
   * Progress callback.
   */
  onProgress?: (progress: CleanupProgress) => void;
}

/**
 * Progress information during cleanup.
 */
export interface CleanupProgress {
  phase: 'analyzing' | 'deleting' | 'complete';
  current: number;
  total: number;
  deletedCount: number;
  freedBytes: number;
}

/**
 * Result of a cleanup operation.
 */
export interface CleanupResult {
  /** Number of documents deleted */
  deletedCount: number;

  /** Estimated bytes freed */
  freedBytes: number;

  /** Documents that would be deleted (dry run only) */
  deletedIds?: string[];

  /** Duration of the cleanup operation in ms */
  durationMs: number;
}

/**
 * Options for estimating cleanup size.
 */
export interface EstimateCleanupOptions {
  /** Same as CleanupOptions but for estimation */
  maxAge?: string;
  keepMinCount?: number;
  targetUsagePercent?: number;
  collections?: string[];
}

/**
 * Result of cleanup size estimation.
 */
export interface CleanupEstimate {
  /** Number of documents that would be deleted */
  documentCount: number;

  /** Estimated bytes that would be freed */
  estimatedBytes: number;

  /** Percentage of total documents that would be deleted */
  percentageOfTotal: number;
}

// ============================================================================
// Duration Parsing
// ============================================================================

/**
 * Parse a duration string into milliseconds.
 *
 * @param duration - Duration string like '30d', '24h', '1w'
 * @returns Duration in milliseconds
 *
 * @example
 * ```typescript
 * parseAge('30d') // 30 days in ms
 * parseAge('24h') // 24 hours in ms
 * parseAge('1w')  // 1 week in ms
 * parseAge('2m')  // 2 months in ms (approximate)
 * ```
 */
export function parseAge(duration: string): number {
  const match = duration.match(/^(\d+(?:\.\d+)?)\s*(s|m|h|d|w|M|y)$/);

  if (!match) {
    throw new Error(
      `Invalid duration format: "${duration}". Expected format like '30d', '24h', '1w', etc.`
    );
  }

  const value = parseFloat(match[1]);
  const unit = match[2];

  const multipliers: Record<string, number> = {
    s: 1000, // seconds
    m: 60 * 1000, // minutes
    h: 60 * 60 * 1000, // hours
    d: 24 * 60 * 60 * 1000, // days
    w: 7 * 24 * 60 * 60 * 1000, // weeks
    M: 30 * 24 * 60 * 60 * 1000, // months (approximate)
    y: 365 * 24 * 60 * 60 * 1000, // years (approximate)
  };

  const multiplier = multipliers[unit];
  if (multiplier === undefined) {
    throw new Error(`Unknown duration unit: "${unit}"`);
  }

  return value * multiplier;
}

/**
 * Format milliseconds as a human-readable duration.
 *
 * @param ms - Duration in milliseconds
 * @returns Human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  if (ms < 86400000) return `${(ms / 3600000).toFixed(1)}h`;
  return `${(ms / 86400000).toFixed(1)}d`;
}

// ============================================================================
// Cleanup Interface (to be implemented by VectorDB)
// ============================================================================

/**
 * Interface for VectorDB cleanup operations.
 * VectorDB implementations should implement these methods.
 */
export interface CleanupableDB {
  /** Get all document IDs with their creation timestamps */
  getDocumentsWithTimestamps(): Promise<Array<{ id: string; createdAt: number; sizeBytes?: number }>>;

  /** Delete multiple documents by ID */
  deleteMany(ids: string[]): Promise<void>;

  /** Get the total document count */
  count(): Promise<number>;
}

// ============================================================================
// Cleanup Functions
// ============================================================================

/**
 * Perform cleanup on a VectorDB.
 *
 * @param db - VectorDB instance with cleanup methods
 * @param options - Cleanup configuration
 * @returns Cleanup result
 *
 * @example
 * ```typescript
 * import { cleanup } from '@localmode/core';
 *
 * // Delete documents older than 30 days
 * const result = await cleanup(db, { maxAge: '30d' });
 * console.log(`Deleted ${result.deletedCount} documents`);
 *
 * // Dry run to see what would be deleted
 * const dryResult = await cleanup(db, { maxAge: '7d', dryRun: true });
 * console.log(`Would delete ${dryResult.deletedCount} documents`);
 *
 * // Keep storage under 80% usage
 * await cleanup(db, { targetUsagePercent: 80 });
 * ```
 */
export async function cleanup(
  db: CleanupableDB,
  options: CleanupOptions = {}
): Promise<CleanupResult> {
  const startTime = performance.now();
  const {
    maxAge,
    keepMinCount = 0,
    targetUsagePercent,
    batchSize = 100,
    dryRun = false,
    onProgress,
  } = options;

  onProgress?.({
    phase: 'analyzing',
    current: 0,
    total: 0,
    deletedCount: 0,
    freedBytes: 0,
  });

  // Get all documents with timestamps
  const documents = await db.getDocumentsWithTimestamps();
  const totalCount = documents.length;

  // Sort by creation time (oldest first)
  documents.sort((a, b) => a.createdAt - b.createdAt);

  // Determine which documents to delete
  let toDelete: Array<{ id: string; sizeBytes?: number }> = [];

  if (maxAge) {
    const maxAgeMs = parseAge(maxAge);
    const cutoff = Date.now() - maxAgeMs;

    toDelete = documents.filter((doc) => doc.createdAt < cutoff);
  } else if (targetUsagePercent !== undefined) {
    // Storage-based cleanup (simplified - would need storage quota info)
    // For now, just mark oldest documents for deletion proportionally
    const targetRemovePercent = Math.max(0, 100 - targetUsagePercent);
    const removeCount = Math.floor(totalCount * (targetRemovePercent / 100));
    toDelete = documents.slice(0, removeCount);
  }

  // Respect keepMinCount
  const maxToDelete = Math.max(0, totalCount - keepMinCount);
  if (toDelete.length > maxToDelete) {
    toDelete = toDelete.slice(0, maxToDelete);
  }

  // Calculate estimated freed bytes
  const freedBytes = toDelete.reduce(
    (sum, doc) => sum + (doc.sizeBytes ?? 1024), // Estimate 1KB if unknown
    0
  );

  // If dry run, return without deleting
  if (dryRun) {
    return {
      deletedCount: toDelete.length,
      freedBytes,
      deletedIds: toDelete.map((d) => d.id),
      durationMs: performance.now() - startTime,
    };
  }

  // Delete in batches
  let deletedCount = 0;

  for (let i = 0; i < toDelete.length; i += batchSize) {
    const batch = toDelete.slice(i, i + batchSize);
    const batchIds = batch.map((d) => d.id);

    await db.deleteMany(batchIds);
    deletedCount += batch.length;

    onProgress?.({
      phase: 'deleting',
      current: deletedCount,
      total: toDelete.length,
      deletedCount,
      freedBytes: batch.reduce((sum, d) => sum + (d.sizeBytes ?? 1024), 0),
    });
  }

  onProgress?.({
    phase: 'complete',
    current: deletedCount,
    total: deletedCount,
    deletedCount,
    freedBytes,
  });

  return {
    deletedCount,
    freedBytes,
    durationMs: performance.now() - startTime,
  };
}

/**
 * Estimate cleanup size without performing deletion.
 *
 * @param db - VectorDB instance
 * @param options - Estimation options
 * @returns Estimated cleanup impact
 */
export async function estimateCleanupSize(
  db: CleanupableDB,
  options: EstimateCleanupOptions
): Promise<CleanupEstimate> {
  const result = await cleanup(db, { ...options, dryRun: true });
  const totalCount = await db.count();

  return {
    documentCount: result.deletedCount,
    estimatedBytes: result.freedBytes,
    percentageOfTotal: totalCount > 0 ? (result.deletedCount / totalCount) * 100 : 0,
  };
}

/**
 * Common cleanup strategies.
 */
export const CleanupStrategies = {
  /**
   * Delete documents older than 30 days.
   */
  monthly: { maxAge: '30d' } as CleanupOptions,

  /**
   * Delete documents older than 7 days.
   */
  weekly: { maxAge: '7d' } as CleanupOptions,

  /**
   * Delete documents older than 24 hours.
   */
  daily: { maxAge: '24h' } as CleanupOptions,

  /**
   * Keep storage under 80%, preserve at least 100 documents.
   */
  conservative: { targetUsagePercent: 80, keepMinCount: 100 } as CleanupOptions,

  /**
   * Keep storage under 50%, preserve at least 50 documents.
   */
  aggressive: { targetUsagePercent: 50, keepMinCount: 50 } as CleanupOptions,
} as const;

