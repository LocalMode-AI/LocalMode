'use client';

import { DeviceBadge } from './device-badge';

/**
 * Demo for the DeviceBadge component, used by the docs live preview.
 * Shows all three capability variants side by side. Detection runs in the
 * browser only after the preview is activated (Run-gated).
 */
export default function DeviceBadgeDemo() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <DeviceBadge capability="webgpu" />
      <DeviceBadge capability="wasm" />
      <DeviceBadge capability="storage" />
      <DeviceBadge capability="webgpu" compact />
    </div>
  );
}
