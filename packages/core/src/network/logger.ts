/**
 * Network Logger
 *
 * Comprehensive logging for network requests including model downloads.
 *
 * @packageDocumentation
 */

import type {
  NetworkLogEntry,
  NetworkStats,
  NetworkLoggerConfig,
  NetworkLogFilter,
  NetworkRequestCallback,
} from './types.js';

// ============================================================================
// Network Logger Class
// ============================================================================

/**
 * Network request logger.
 *
 * Tracks all network requests with progress, timing, and error information.
 *
 * @example
 * ```typescript
 * import { createNetworkLogger, onNetworkRequest } from '@localmode/core';
 *
 * const logger = createNetworkLogger({ maxEntries: 500 });
 *
 * // Subscribe to network requests
 * const unsubscribe = onNetworkRequest((entry) => {
 *   if (entry.state === 'in-progress') {
 *     console.log(`Downloading: ${entry.url} (${entry.progress}%)`);
 *   }
 * });
 *
 * // Get logs
 * const logs = await getNetworkLogs({ category: 'model' });
 * ```
 */
export class NetworkLogger {
  private logs: NetworkLogEntry[] = [];
  private listeners: Set<NetworkRequestCallback> = new Set();
  private config: Required<NetworkLoggerConfig>;

  constructor(config: NetworkLoggerConfig = {}) {
    this.config = {
      maxEntries: config.maxEntries ?? 1000,
      persistLogs: config.persistLogs ?? false,
      logHeaders: config.logHeaders ?? false,
      logBody: config.logBody ?? false,
      categories: config.categories ?? [],
      minLevel: config.minLevel ?? 'info',
      filter: config.filter ?? (() => true),
    };
  }

  /**
   * Log a network request.
   */
  log(entry: Omit<NetworkLogEntry, 'id' | 'timestamp'>): NetworkLogEntry {
    const fullEntry: NetworkLogEntry = {
      id: generateId(),
      timestamp: new Date(),
      ...entry,
    };

    // Apply filter
    if (!this.config.filter(fullEntry)) {
      return fullEntry;
    }

    // Check category filter
    if (
      this.config.categories.length > 0 &&
      !this.config.categories.includes(entry.category)
    ) {
      return fullEntry;
    }

    // Add to logs
    this.logs.push(fullEntry);

    // Trim if over limit
    if (this.logs.length > this.config.maxEntries) {
      this.logs = this.logs.slice(-this.config.maxEntries);
    }

    // Notify listeners
    this.notifyListeners(fullEntry);

    return fullEntry;
  }

  /**
   * Update an existing log entry.
   */
  update(id: string, updates: Partial<NetworkLogEntry>): NetworkLogEntry | null {
    const index = this.logs.findIndex((log) => log.id === id);
    if (index === -1) return null;

    const updated = { ...this.logs[index], ...updates };
    this.logs[index] = updated;

    // Notify listeners
    this.notifyListeners(updated);

    return updated;
  }

  /**
   * Get logs matching the filter.
   */
  getLogs(filter: NetworkLogFilter = {}): NetworkLogEntry[] {
    let result = [...this.logs];

    // Apply filters
    if (filter.category) {
      result = result.filter((log) => log.category === filter.category);
    }

    if (filter.state) {
      result = result.filter((log) => log.state === filter.state);
    }

    if (filter.urlPattern) {
      const pattern =
        typeof filter.urlPattern === 'string'
          ? new RegExp(filter.urlPattern)
          : filter.urlPattern;
      result = result.filter((log) => pattern.test(log.url));
    }

    if (filter.since) {
      result = result.filter((log) => log.timestamp >= filter.since!);
    }

    if (filter.until) {
      result = result.filter((log) => log.timestamp <= filter.until!);
    }

    // Sort
    result.sort((a, b) => {
      const order = filter.order === 'asc' ? 1 : -1;
      return order * (a.timestamp.getTime() - b.timestamp.getTime());
    });

    // Limit
    if (filter.limit) {
      result = result.slice(0, filter.limit);
    }

    return result;
  }

  /**
   * Get network statistics.
   */
  getStats(): NetworkStats {
    const completed = this.logs.filter((log) => log.state === 'completed');
    const failed = this.logs.filter((log) => log.state === 'failed');

    const totalDownloadBytes = completed.reduce(
      (sum, log) => sum + (log.responseSize ?? 0),
      0
    );
    const totalUploadBytes = completed.reduce(
      (sum, log) => sum + (log.requestSize ?? 0),
      0
    );
    const totalDuration = completed.reduce(
      (sum, log) => sum + (log.duration ?? 0),
      0
    );

    // Group by category
    const byCategory: NetworkStats['byCategory'] = {};
    for (const log of this.logs) {
      if (!byCategory[log.category]) {
        byCategory[log.category] = { requests: 0, downloadBytes: 0, uploadBytes: 0 };
      }
      byCategory[log.category].requests++;
      byCategory[log.category].downloadBytes += log.responseSize ?? 0;
      byCategory[log.category].uploadBytes += log.requestSize ?? 0;
    }

    // Group by status
    const byStatus: Record<number, number> = {};
    for (const log of completed) {
      if (log.status) {
        byStatus[log.status] = (byStatus[log.status] ?? 0) + 1;
      }
    }

    // Calculate requests per minute
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const recentRequests = this.logs.filter(
      (log) => log.timestamp.getTime() >= oneMinuteAgo
    );

    return {
      totalRequests: this.logs.length,
      completedRequests: completed.length,
      failedRequests: failed.length,
      totalDownloadBytes,
      totalUploadBytes,
      totalDuration,
      averageSpeed: totalDuration > 0 ? (totalDownloadBytes / totalDuration) * 1000 : 0,
      byCategory,
      byStatus,
      requestsPerMinute: recentRequests.length,
    };
  }

  /**
   * Clear logs.
   */
  clear(filter?: { olderThan?: string | Date }): void {
    if (!filter?.olderThan) {
      this.logs = [];
      return;
    }

    let cutoff: Date;
    if (typeof filter.olderThan === 'string') {
      // Parse duration string like '7d', '24h'
      cutoff = new Date(Date.now() - parseDuration(filter.olderThan));
    } else {
      cutoff = filter.olderThan;
    }

    this.logs = this.logs.filter((log) => log.timestamp >= cutoff);
  }

  /**
   * Subscribe to network request events.
   */
  subscribe(callback: NetworkRequestCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Notify all listeners of an update.
   */
  private notifyListeners(entry: NetworkLogEntry): void {
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch (error) {
        console.error('Error in network logger listener:', error);
      }
    }
  }
}

// ============================================================================
// Global Logger Instance
// ============================================================================

let globalLogger: NetworkLogger | null = null;

/**
 * Create a network logger.
 *
 * @param config - Logger configuration
 * @returns Network logger instance
 */
export function createNetworkLogger(config?: NetworkLoggerConfig): NetworkLogger {
  const logger = new NetworkLogger(config);

  // Set as global if none exists
  if (!globalLogger) {
    globalLogger = logger;
  }

  return logger;
}

/**
 * Get the global network logger.
 *
 * Creates one if it doesn't exist.
 */
export function getGlobalLogger(): NetworkLogger {
  if (!globalLogger) {
    globalLogger = new NetworkLogger();
  }
  return globalLogger;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Get network logs from the global logger.
 *
 * @param filter - Optional filter
 * @returns Array of log entries
 */
export function getNetworkLogs(filter?: NetworkLogFilter): NetworkLogEntry[] {
  return getGlobalLogger().getLogs(filter);
}

/**
 * Clear network logs from the global logger.
 *
 * @param options - Clear options
 */
export function clearNetworkLogs(options?: { olderThan?: string | Date }): void {
  getGlobalLogger().clear(options);
}

/**
 * Subscribe to network request events.
 *
 * @param callback - Callback function
 * @returns Unsubscribe function
 *
 * @example
 * ```typescript
 * import { onNetworkRequest } from '@localmode/core';
 *
 * const unsubscribe = onNetworkRequest((entry) => {
 *   if (entry.category === 'model' && entry.state === 'in-progress') {
 *     updateProgressBar(entry.progress);
 *   }
 * });
 *
 * // Later:
 * unsubscribe();
 * ```
 */
export function onNetworkRequest(callback: NetworkRequestCallback): () => void {
  return getGlobalLogger().subscribe(callback);
}

/**
 * Get network statistics from the global logger.
 *
 * @returns Network statistics
 */
export function getNetworkStats(): NetworkStats {
  return getGlobalLogger().getStats();
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique ID.
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Parse a duration string into milliseconds.
 */
function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+(?:\.\d+)?)\s*(s|m|h|d|w)$/);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit = match[2];

  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
  };

  return value * (multipliers[unit] ?? 0);
}

