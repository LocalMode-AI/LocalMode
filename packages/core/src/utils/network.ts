/**
 * Network Status Utilities
 *
 * Provides utilities for detecting and monitoring network connectivity.
 * Essential for offline-first applications.
 *
 * @packageDocumentation
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Network connection status.
 */
export interface NetworkStatus {
  /** Whether the browser is online */
  isOnline: boolean;

  /** Connection type if available (wifi, cellular, etc.) */
  connectionType?: string;

  /** Effective connection type if available (slow-2g, 2g, 3g, 4g) */
  effectiveType?: '4g' | '3g' | '2g' | 'slow-2g';

  /** Downlink speed in Mbps if available */
  downlink?: number;

  /** Round-trip time in ms if available */
  rtt?: number;

  /** Whether the user has requested reduced data usage */
  saveData?: boolean;
}

/**
 * Network change event callback.
 */
export type NetworkChangeCallback = (status: NetworkStatus) => void;

// ============================================================================
// Network Status Functions
// ============================================================================

/**
 * Get the current network status.
 *
 * @returns Current network status
 *
 * @example
 * ```typescript
 * import { getNetworkStatus } from '@localmode/core';
 *
 * const status = getNetworkStatus();
 * if (!status.isOnline) {
 *   console.log('App is offline');
 * }
 *
 * if (status.effectiveType === 'slow-2g') {
 *   console.log('Slow connection - using smaller models');
 * }
 * ```
 */
export function getNetworkStatus(): NetworkStatus {
  // Check if we're in a browser environment
  if (typeof navigator === 'undefined') {
    return { isOnline: true }; // Assume online in non-browser environments
  }

  const connection = (navigator as NavigatorWithConnection).connection;

  return {
    isOnline: navigator.onLine,
    connectionType: connection?.type,
    effectiveType: connection?.effectiveType as NetworkStatus['effectiveType'],
    downlink: connection?.downlink,
    rtt: connection?.rtt,
    saveData: connection?.saveData,
  };
}

/**
 * Check if the browser is currently offline.
 *
 * @returns true if offline
 *
 * @example
 * ```typescript
 * if (isOffline()) {
 *   showOfflineIndicator();
 * }
 * ```
 */
export function isOffline(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  return !navigator.onLine;
}

/**
 * Check if the browser is currently online.
 *
 * @returns true if online
 */
export function isOnline(): boolean {
  if (typeof navigator === 'undefined') {
    return true;
  }
  return navigator.onLine;
}

/**
 * Subscribe to network status changes.
 *
 * @param callback - Function to call when network status changes
 * @returns Unsubscribe function
 *
 * @example
 * ```typescript
 * import { onNetworkChange } from '@localmode/core';
 *
 * const unsubscribe = onNetworkChange((status) => {
 *   if (status.isOnline) {
 *     console.log('Back online - syncing data');
 *     syncPendingChanges();
 *   } else {
 *     console.log('Went offline - enabling offline mode');
 *     enableOfflineMode();
 *   }
 * });
 *
 * // Later, stop listening
 * unsubscribe();
 * ```
 */
export function onNetworkChange(callback: NetworkChangeCallback): () => void {
  if (typeof window === 'undefined') {
    return () => {}; // No-op in non-browser environments
  }

  const handler = () => callback(getNetworkStatus());

  // Listen for online/offline events
  window.addEventListener('online', handler);
  window.addEventListener('offline', handler);

  // Listen for connection changes if available
  const connection = (navigator as NavigatorWithConnection).connection;
  if (connection) {
    connection.addEventListener('change', handler);
  }

  // Return cleanup function
  return () => {
    window.removeEventListener('online', handler);
    window.removeEventListener('offline', handler);
    if (connection) {
      connection.removeEventListener('change', handler);
    }
  };
}

/**
 * Wait for the network to come back online.
 *
 * @param timeout - Optional timeout in milliseconds
 * @returns Promise that resolves when online, rejects on timeout
 *
 * @example
 * ```typescript
 * try {
 *   await waitForOnline(30000); // Wait up to 30 seconds
 *   console.log('Network restored');
 * } catch {
 *   console.log('Timeout waiting for network');
 * }
 * ```
 */
export function waitForOnline(timeout?: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (isOnline()) {
      resolve();
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe: (() => void) | undefined;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (unsubscribe) unsubscribe();
    };

    unsubscribe = onNetworkChange((status) => {
      if (status.isOnline) {
        cleanup();
        resolve();
      }
    });

    if (timeout) {
      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('Timeout waiting for network'));
      }, timeout);
    }
  });
}

/**
 * Check if the connection is suitable for large operations.
 *
 * Returns false for slow connections (2g, slow-2g) or when saveData is enabled.
 *
 * @returns true if connection is suitable for large operations
 *
 * @example
 * ```typescript
 * if (isConnectionSuitable()) {
 *   await downloadLargeModel();
 * } else {
 *   await downloadSmallModel();
 * }
 * ```
 */
export function isConnectionSuitable(): boolean {
  const status = getNetworkStatus();

  if (!status.isOnline) return false;
  if (status.saveData) return false;

  if (status.effectiveType === 'slow-2g' || status.effectiveType === '2g') {
    return false;
  }

  return true;
}

/**
 * Get a recommendation for which resources to load based on connection.
 *
 * @returns Recommendation object
 *
 * @example
 * ```typescript
 * const rec = getConnectionRecommendation();
 * if (rec.useLargeModels) {
 *   loadModel('whisper-large');
 * } else {
 *   loadModel('whisper-tiny');
 * }
 * ```
 */
export function getConnectionRecommendation(): {
  useLargeModels: boolean;
  preloadAssets: boolean;
  downloadInBackground: boolean;
} {
  const status = getNetworkStatus();

  if (!status.isOnline) {
    return {
      useLargeModels: false,
      preloadAssets: false,
      downloadInBackground: false,
    };
  }

  if (status.saveData) {
    return {
      useLargeModels: false,
      preloadAssets: false,
      downloadInBackground: false,
    };
  }

  if (status.effectiveType === 'slow-2g' || status.effectiveType === '2g') {
    return {
      useLargeModels: false,
      preloadAssets: false,
      downloadInBackground: false,
    };
  }

  if (status.effectiveType === '3g') {
    return {
      useLargeModels: false,
      preloadAssets: true,
      downloadInBackground: true,
    };
  }

  // 4g or unknown (assume good connection)
  return {
    useLargeModels: true,
    preloadAssets: true,
    downloadInBackground: true,
  };
}

// ============================================================================
// Type Augmentation for Network Information API
// ============================================================================

/**
 * Network Information API connection interface.
 */
interface NetworkInformation extends EventTarget {
  readonly type?: string;
  readonly effectiveType?: string;
  readonly downlink?: number;
  readonly rtt?: number;
  readonly saveData?: boolean;
}

/**
 * Navigator with connection property.
 */
interface NavigatorWithConnection extends Navigator {
  readonly connection?: NetworkInformation;
}

