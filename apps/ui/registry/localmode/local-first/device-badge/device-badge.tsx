'use client';

import { useCapabilities } from '@/lib/use-environment';
import { cn } from '@/lib/utils';

/** Props for {@link DeviceBadge}. */
export interface DeviceBadgeProps {
  /**
   * Which capability to surface. `webgpu` reports GPU acceleration availability;
   * `wasm` reports WebAssembly support; `storage` reports IndexedDB persistence.
   * @default "webgpu"
   */
  capability?: 'webgpu' | 'wasm' | 'storage';
  /**
   * Label shown before the status. Defaults to a human-readable capability name.
   */
  label?: string;
  /**
   * When true, render a compact dot-only badge without the text label.
   * @default false
   */
  compact?: boolean;
  /** Additional class names merged onto the root element. */
  className?: string;
}

const CAPABILITY_KEYS = {
  webgpu: { key: 'webgpu', label: 'WebGPU' },
  wasm: { key: 'wasm', label: 'WASM' },
  storage: { key: 'indexeddb', label: 'Storage' },
} as const;

/**
 * A local-first capability badge. Detects the browser's AI capabilities via
 * the copy-owned `useCapabilities()` (from `@/lib/use-environment`) and renders a themed status pill —
 * green when the capability is available, amber when it is not, muted while
 * detection is in flight. Useful for gating model-download UIs behind device
 * support (e.g. "WebGPU available → load the fast model").
 *
 * Styled with shadcn/ui CSS variables so it inherits the consumer's theme.
 *
 * @example
 * ```tsx
 * <DeviceBadge capability="webgpu" />
 * ```
 */
export function DeviceBadge({
  capability = 'webgpu',
  label,
  compact = false,
  className,
}: DeviceBadgeProps) {
  const { capabilities, isDetecting } = useCapabilities();
  const config = CAPABILITY_KEYS[capability];

  const available =
    capabilities == null ? null : Boolean(capabilities.features[config.key]);

  const status: 'pending' | 'available' | 'unavailable' =
    isDetecting || available == null
      ? 'pending'
      : available
        ? 'available'
        : 'unavailable';

  const dotClass = cn(
    'inline-block size-2 rounded-full',
    status === 'available' && 'bg-emerald-500',
    status === 'unavailable' && 'bg-amber-500',
    status === 'pending' && 'bg-muted-foreground animate-pulse',
  );

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'inline-flex max-w-full min-w-fit items-center gap-2 whitespace-nowrap rounded-full border border-border bg-card text-xs font-medium text-card-foreground',
        // Tight chip around the lone dot in compact mode; roomier pill when labeled.
        compact ? 'p-1.5' : 'px-3 py-1',
        className,
      )}
    >
      <span className={dotClass} aria-hidden="true" />
      {!compact && (
        <span className="min-w-0 truncate">
          {label ?? config.label}
          {': '}
          {status === 'pending'
            ? 'checking…'
            : status === 'available'
              ? 'available'
              : 'unavailable'}
        </span>
      )}
    </div>
  );
}
