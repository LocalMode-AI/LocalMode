'use client';

import { StorageMeter } from './storage-meter';

/**
 * Demo for StorageMeter. The first reads the device's real
 * navigator.storage.estimate() via useStorageQuota; the second passes an
 * explicit near-full quota to show the warning state.
 */
export default function StorageMeterDemo() {
  return (
    <div className="flex w-full max-w-xs flex-col gap-4">
      <StorageMeter />
      <StorageMeter
        quota={{ usedBytes: 1.9e9, quotaBytes: 2e9 }}
        warnThreshold={0.8}
      />
    </div>
  );
}
