'use client';

import { CapabilityGate } from './capability-gate';

/**
 * Demo for CapabilityGate. Gates a "fast model" panel behind real WebGPU
 * support detected via useCapabilities — children render on a WebGPU device,
 * the fallback notice renders otherwise — plus a media-input example: the
 * webcam surface renders only when a camera is AVAILABLE (secure context +
 * `enumerateDevices()` reports a videoinput; detection never prompts —
 * permission is requested later, by the surface's own start action).
 */
export default function CapabilityGateDemo() {
  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <CapabilityGate requires="webgpu">
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 px-4 py-3 text-sm">
          <span className="font-medium text-emerald-600 dark:text-emerald-400">
            WebGPU available
          </span>
          <p className="text-muted-foreground">
            The fast WebGPU model can run on this device.
          </p>
        </div>
      </CapabilityGate>

      <CapabilityGate requires="camera">
        <div className="rounded-lg border border-sky-500/40 bg-sky-500/5 px-4 py-3 text-sm">
          <span className="font-medium text-sky-600 dark:text-sky-400">Camera detected</span>
          <p className="text-muted-foreground">
            A webcam surface (e.g. live hand tracking) can be offered here. No permission prompt
            fired - the gate only checks availability.
          </p>
        </div>
      </CapabilityGate>

      <CapabilityGate requires="indexeddb">
        <p className="text-sm text-muted-foreground">
          IndexedDB is available - models and vectors can persist on-device.
        </p>
      </CapabilityGate>
    </div>
  );
}
