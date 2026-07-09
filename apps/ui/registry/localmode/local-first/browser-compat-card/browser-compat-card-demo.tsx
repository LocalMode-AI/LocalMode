'use client';

import { useCapabilities } from '@localmode/react';

import { BrowserCompatCard, RAMUsageBar } from './browser-compat-card';

/**
 * Demo for BrowserCompatCard / RAMUsageBar. Pulls the device's real RAM and
 * cross-origin-isolation state from useCapabilities, then evaluates two models:
 * a small one that fits and a large one that exceeds device RAM (canRun flips).
 */
export default function BrowserCompatCardDemo() {
  const { capabilities } = useCapabilities();
  const hardware =
    capabilities && typeof capabilities.hardware === 'object'
      ? (capabilities.hardware as { memory?: number })
      : {};
  const deviceGB = hardware.memory ?? 8;
  const coi =
    typeof navigator !== 'undefined' && 'crossOriginIsolated' in globalThis
      ? Boolean((globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated)
      : false;

  return (
    <div className="flex w-full max-w-md flex-col gap-5">
      <BrowserCompatCard
        modelName="Phi 3.5 Mini (3.8B)"
        requiredGB={3}
        deviceGB={deviceGB}
        availableStorageGB={12}
        crossOriginIsolated={coi}
        estimatedSpeed="Fast"
      />
      <BrowserCompatCard
        modelName="Llama 3 70B"
        requiredGB={deviceGB + 32}
        deviceGB={deviceGB}
        crossOriginIsolated={coi}
        warnings={['Model RAM exceeds this device - choose a smaller quantization.']}
      />
      <RAMUsageBar requiredGB={4} deviceGB={deviceGB} />
    </div>
  );
}
