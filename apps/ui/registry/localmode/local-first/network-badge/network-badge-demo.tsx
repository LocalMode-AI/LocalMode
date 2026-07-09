'use client';

import { NetworkBadge, OfflineReady } from './network-badge';

/**
 * Demo for NetworkBadge / OfflineReady. NetworkBadge reflects the device's real
 * online/offline state (toggle DevTools offline to see it react); OfflineReady
 * shows both the ready and needs-download variants.
 */
export default function NetworkBadgeDemo() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <NetworkBadge />
      <NetworkBadge compact />
      <OfflineReady ready />
      <OfflineReady ready={false} />
    </div>
  );
}
