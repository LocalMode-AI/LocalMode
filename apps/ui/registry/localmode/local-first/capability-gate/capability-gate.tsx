'use client';

import type { ReactNode } from 'react';
import { useCapabilities } from '@/lib/use-environment';

import { cn } from '@/registry/localmode/lib/utils';

/**
 * A device feature a {@link CapabilityGate} can require.
 *
 * `camera` / `microphone` gate on media-input AVAILABILITY (secure context +
 * `getUserMedia` present + `enumerateDevices()` reports a device of that
 * kind — detection never prompts). Runtime permission denial is deliberately
 * NOT gated: handle a `getUserMedia` rejection as a recoverable in-app error.
 */
export type GateCapability =
  | 'webgpu'
  | 'wasm'
  | 'webnn'
  | 'simd'
  | 'threads'
  | 'indexeddb'
  | 'webworkers'
  | 'sharedarraybuffer'
  | 'camera'
  | 'microphone';

/** Props for {@link CapabilityGate}. */
export interface CapabilityGateProps {
  /** The device capability the children require. */
  requires: GateCapability;
  /** Rendered only when the capability is supported. */
  children: ReactNode;
  /**
   * Rendered when the capability is unsupported. Defaults to a themed notice
   * explaining the requirement.
   */
  fallback?: ReactNode;
  /** Rendered while detection is in flight. Defaults to a muted placeholder. */
  pending?: ReactNode;
  /** Additional class names merged onto the default fallback notice. */
  className?: string;
}

const LABELS: Record<GateCapability, string> = {
  webgpu: 'WebGPU',
  wasm: 'WebAssembly',
  webnn: 'WebNN',
  simd: 'WASM SIMD',
  threads: 'WASM Threads',
  indexeddb: 'IndexedDB',
  webworkers: 'Web Workers',
  sharedarraybuffer: 'SharedArrayBuffer',
  camera: 'Camera',
  microphone: 'Microphone',
};

/**
 * Media-input capabilities get a hardware-oriented fallback sentence (the
 * feature exists in every modern browser — what's missing is the device).
 */
const MEDIA_CAPABILITIES: ReadonlySet<GateCapability> = new Set(['camera', 'microphone']);

/**
 * A true gate: renders its children only when the device meets the stated
 * requirement (via `useCapabilities`), otherwise a `fallback` slot with
 * guidance. Local models have hard device requirements — e.g. LiteRT Gemma is
 * WebGPU-only — so gating prevents a broken experience and gives a clear,
 * themeable explanation instead.
 *
 * @example
 * ```tsx
 * <CapabilityGate requires="webgpu" fallback={<p>WebGPU required.</p>}>
 *   <FastWebGPUModel />
 * </CapabilityGate>
 * ```
 */
export function CapabilityGate({
  requires,
  children,
  fallback,
  pending,
  className,
}: CapabilityGateProps) {
  const { capabilities, isDetecting } = useCapabilities();
  const label = LABELS[requires];

  if (isDetecting || capabilities == null) {
    return (
      <>
        {pending ?? (
          <div
            role="status"
            aria-busy="true"
            className={cn(
              'rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground',
              className,
            )}
          >
            Checking {label} support…
          </div>
        )}
      </>
    );
  }

  const supported = Boolean(capabilities.features[requires]);

  if (supported) return <>{children}</>;

  return (
    <>
      {fallback ?? (
        <div
          role="status"
          className={cn(
            'flex flex-col gap-1 rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm',
            className,
          )}
        >
          <span className="font-medium text-amber-700 dark:text-amber-400">
            {label} required
          </span>
          <span className="text-muted-foreground">
            {MEDIA_CAPABILITIES.has(requires)
              ? `This feature needs ${label.toLowerCase()} access, but no ${label.toLowerCase()} was detected on this device (or the page is not a secure context).`
              : `This feature needs ${label}, which your browser or device does not support. Try a recent Chrome/Edge build, or use a WASM-based model.`}
          </span>
        </div>
      )}
    </>
  );
}
