/**
 * @file use-network-status.ts
 * @description Hook for reactive online/offline status tracking
 */

import { useSyncExternalStore } from 'react';

function getOnlineStatus() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

function subscribe(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function getServerSnapshot() {
  return true; // Optimistic default for SSR
}

/**
 * Hook for reactively tracking online/offline status.
 * Uses useSyncExternalStore for tear-free reads.
 *
 * @returns Online/offline status
 */
export function useNetworkStatus() {
  const isOnline = useSyncExternalStore(subscribe, getOnlineStatus, getServerSnapshot);

  return { isOnline, isOffline: !isOnline };
}
