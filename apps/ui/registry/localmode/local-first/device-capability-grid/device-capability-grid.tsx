'use client';

import { Cpu, Loader2, MemoryStick, Sparkles } from 'lucide-react';
import { useCapabilities } from '@/lib/use-environment';

import { cn } from '@/registry/localmode/lib/utils';

/** Props for {@link DeviceCapabilityGrid}. */
export interface DeviceCapabilityGridProps {
  /** Additional class names merged onto the root element. */
  className?: string;
}

/** The feature flags surfaced in the grid, in display order. */
const FEATURES: { key: string; label: string }[] = [
  { key: 'webgpu', label: 'WebGPU' },
  { key: 'wasm', label: 'WASM' },
  { key: 'simd', label: 'SIMD' },
  { key: 'threads', label: 'Threads' },
  { key: 'indexeddb', label: 'IndexedDB' },
  { key: 'webworkers', label: 'Workers' },
];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/**
 * A full device-capability diagnostic card — the expanded sibling of
 * `DeviceBadge`. Reads `useCapabilities` and renders a stats bar (CPU cores /
 * memory / GPU), a status row per feature flag (WebGPU, WASM, SIMD, Threads,
 * IndexedDB, Web Workers), a storage row, and a browser/OS footer. A spinner
 * shows while detection runs. It does not replace `DeviceBadge`.
 *
 * @example
 * ```tsx
 * <DeviceCapabilityGrid />
 * ```
 */
export function DeviceCapabilityGrid({ className }: DeviceCapabilityGridProps) {
  const { capabilities, isDetecting } = useCapabilities();

  if (isDetecting || capabilities == null) {
    return (
      <div
        role="status"
        aria-busy="true"
        className={cn(
          'flex items-center justify-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground',
          className,
        )}
      >
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Detecting device capabilities…
      </div>
    );
  }

  const hardware = asRecord(capabilities.hardware);
  const features = asRecord(capabilities.features);
  const storage = asRecord(capabilities.storage);
  const browser = asRecord(capabilities.browser);
  const device = asRecord(capabilities.device);

  const cores = typeof hardware.cores === 'number' ? hardware.cores : null;
  const memory = typeof hardware.memory === 'number' ? hardware.memory : null;
  const gpu = typeof hardware.gpu === 'string' ? hardware.gpu : null;

  const featureFlag = (key: string) => Boolean(features[key]);

  return (
    <div
      className={cn(
        '@container flex w-full max-w-md flex-col gap-4 rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm',
        className,
      )}
    >
      <div className="grid grid-cols-3 gap-2">
        <Stat icon={<Cpu className="size-4" />} label="Cores" value={cores != null ? String(cores) : '-'} />
        <Stat
          icon={<MemoryStick className="size-4" />}
          label="Memory"
          value={memory != null ? `${memory} GB` : '-'}
        />
        <Stat
          icon={<Sparkles className="size-4" />}
          label="GPU"
          value={gpu ? 'Yes' : featureFlag('webgpu') ? 'WebGPU' : '-'}
        />
      </div>

      <ul className="grid grid-cols-1 gap-1.5 @sm:grid-cols-2">
        {FEATURES.map((f) => {
          const on = featureFlag(f.key);
          return (
            <li
              key={f.key}
              className="flex min-w-fit items-center justify-between gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs"
            >
              <span className="truncate whitespace-nowrap font-medium">{f.label}</span>
              <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-muted-foreground">
                <span
                  className={cn(
                    'inline-block size-2 rounded-full',
                    on ? 'bg-emerald-500' : 'bg-muted-foreground/40',
                  )}
                  aria-hidden="true"
                />
                {on ? 'Yes' : 'No'}
              </span>
            </li>
          );
        })}
      </ul>

      {typeof storage.quotaBytes === 'number' && (
        <div className="flex items-center justify-between rounded-md border border-border bg-background px-2.5 py-1.5 text-xs">
          <span className="font-medium">Storage</span>
          <span className="tabular-nums text-muted-foreground">
            {Math.round(Number(storage.quotaBytes) / 1e9)} GB quota
          </span>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {[browser.name, browser.version && `v${browser.version}`, device.os]
          .filter(Boolean)
          .join(' · ') || 'Unknown environment'}
      </p>
    </div>
  );
}

/** Internal stat tile for the top stats bar. */
function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-border bg-background py-2.5">
      <span className="text-muted-foreground" aria-hidden="true">
        {icon}
      </span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
