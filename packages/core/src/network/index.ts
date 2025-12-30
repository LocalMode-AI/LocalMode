/**
 * Network Module
 *
 * Network request logging, monitoring, and utilities.
 *
 * @packageDocumentation
 */

// Export types
export * from './types.js';

// Export logger
export {
  NetworkLogger,
  createNetworkLogger,
  getGlobalLogger,
  getNetworkLogs,
  clearNetworkLogs,
  onNetworkRequest,
  getNetworkStats,
} from './logger.js';

// Export fetch wrapper
export {
  createLoggingFetch,
  wrapFetchWithLogging,
  unwrapFetch,
  isFetchWrapped,
} from './fetch-wrapper.js';
export type { LoggingFetchOptions } from './fetch-wrapper.js';

