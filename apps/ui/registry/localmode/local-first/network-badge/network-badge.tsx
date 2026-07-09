'use client';

import { CloudOff, Wifi, WifiOff } from 'lucide-react';
import { useNetworkStatus } from '@/lib/use-environment';

import { cn } from '@/registry/localmode/lib/utils';

/** Props for {@link NetworkBadge}. */
export interface NetworkBadgeProps {
  /** When true, render a compact dot-only badge without text. @default false */
  compact?: boolean;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/**
 * A reactive online/offline indicator sourced from `useNetworkStatus`. Because
 * local models keep working without a network, "offline" here is informational,
 * not an error — pair it with {@link OfflineReady} to tell users the app still
 * functions.
 *
 * @example
 * ```tsx
 * <NetworkBadge />
 * ```
 */
export function NetworkBadge({ compact = false, className }: NetworkBadgeProps) {
  const { isOnline } = useNetworkStatus();

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-card-foreground',
        className,
      )}
    >
      {isOnline ? (
        <Wifi className="size-3.5 text-emerald-500" aria-hidden="true" />
      ) : (
        <WifiOff className="size-3.5 text-amber-500" aria-hidden="true" />
      )}
      {!compact && <span>{isOnline ? 'Online' : 'Offline'}</span>}
    </div>
  );
}

/** Props for {@link OfflineReady}. */
export interface OfflineReadyProps {
  /**
   * Whether the model(s) the app needs are cached on-device. When true the app
   * can run with no network.
   */
  ready: boolean;
  /** Optional label override. */
  label?: string;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/**
 * Indicates whether the app can run entirely offline — i.e. its required model
 * is cached on-device. Combine with `useNetworkStatus` and your cache check to
 * reassure users that local AI keeps working without connectivity.
 *
 * @example
 * ```tsx
 * <OfflineReady ready={isModelCached} />
 * ```
 */
export function OfflineReady({ ready, label, className }: OfflineReadyProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium',
        ready
          ? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400'
          : 'border-border bg-card text-muted-foreground',
        className,
      )}
    >
      {ready ? (
        <Wifi className="size-3.5" aria-hidden="true" />
      ) : (
        <CloudOff className="size-3.5" aria-hidden="true" />
      )}
      <span>{label ?? (ready ? 'Offline-ready' : 'Needs download')}</span>
    </div>
  );
}
