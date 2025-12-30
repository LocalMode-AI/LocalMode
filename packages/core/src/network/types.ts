/**
 * Network Logging Types
 *
 * Type definitions for network request logging and monitoring.
 *
 * @packageDocumentation
 */

// ============================================================================
// Network Log Entry
// ============================================================================

/**
 * A single network request log entry.
 */
export interface NetworkLogEntry {
  /** Unique identifier for this log entry */
  id: string;

  /** Timestamp when the request started */
  timestamp: Date;

  /** Type of request */
  type: 'download' | 'upload';

  /** Request URL */
  url: string;

  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD' | 'PATCH';

  /** HTTP status code (if completed) */
  status?: number;

  /** HTTP status text (if completed) */
  statusText?: string;

  /** Request headers (if logged) */
  requestHeaders?: Record<string, string>;

  /** Response headers (if logged) */
  responseHeaders?: Record<string, string>;

  /** Request body size in bytes */
  requestSize?: number;

  /** Response body size in bytes */
  responseSize?: number;

  /** Request duration in milliseconds */
  duration?: number;

  /** Download/upload progress (0-100) */
  progress?: number;

  /** Current state of the request */
  state: 'pending' | 'in-progress' | 'completed' | 'failed' | 'aborted';

  /** Error message (if failed) */
  error?: string;

  /** Category for grouping (e.g., 'model', 'data', 'api') */
  category: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Network Statistics
// ============================================================================

/**
 * Aggregated network statistics.
 */
export interface NetworkStats {
  /** Total number of requests */
  totalRequests: number;

  /** Number of completed requests */
  completedRequests: number;

  /** Number of failed requests */
  failedRequests: number;

  /** Total bytes downloaded */
  totalDownloadBytes: number;

  /** Total bytes uploaded */
  totalUploadBytes: number;

  /** Total duration of all requests in ms */
  totalDuration: number;

  /** Average transfer speed in bytes per second */
  averageSpeed: number;

  /** Statistics by category */
  byCategory: Record<
    string,
    {
      requests: number;
      downloadBytes: number;
      uploadBytes: number;
    }
  >;

  /** Statistics by status code */
  byStatus: Record<number, number>;

  /** Request rate per minute */
  requestsPerMinute: number;
}

// ============================================================================
// Network Logger Configuration
// ============================================================================

/**
 * Configuration for the network logger.
 */
export interface NetworkLoggerConfig {
  /** Maximum number of log entries to keep (default: 1000) */
  maxEntries?: number;

  /** Whether to persist logs to IndexedDB (default: false) */
  persistLogs?: boolean;

  /** Whether to include request/response headers (default: false) */
  logHeaders?: boolean;

  /** Whether to include request body (default: false, careful with memory) */
  logBody?: boolean;

  /** Categories to log (default: all) */
  categories?: string[];

  /** Minimum log level (default: 'info') */
  minLevel?: 'debug' | 'info' | 'warn' | 'error';

  /** Custom filter function */
  filter?: (entry: NetworkLogEntry) => boolean;
}

/**
 * Filter options for retrieving logs.
 */
export interface NetworkLogFilter {
  /** Filter by category */
  category?: string;

  /** Filter by state */
  state?: NetworkLogEntry['state'];

  /** Filter by URL pattern */
  urlPattern?: string | RegExp;

  /** Filter by minimum timestamp */
  since?: Date;

  /** Filter by maximum timestamp */
  until?: Date;

  /** Maximum number of entries to return */
  limit?: number;

  /** Sort order */
  order?: 'asc' | 'desc';
}

// ============================================================================
// Network Event Types
// ============================================================================

/**
 * Callback for network request events.
 */
export type NetworkRequestCallback = (entry: NetworkLogEntry) => void;

/**
 * Progress callback for individual requests.
 */
export type ProgressCallback = (loaded: number, total: number, url: string) => void;

