'use client';

import { HardDrive } from 'lucide-react';
import { formatBytes } from '@/lib/browser-utils';
import { useStorageQuota } from '@/lib/use-environment';

import { cn } from '@/registry/localmode/lib/utils';

/** Props for {@link StorageMeter}. */
export interface StorageMeterProps {
  /**
   * Fraction (0–1) at which the meter enters its warning state.
   * @default 0.8
   */
  warnThreshold?: number;
  /**
   * Override the live quota source (used / total bytes). When omitted the
   * component reads `useStorageQuota()`.
   */
  quota?: { usedBytes: number; quotaBytes: number };
  /** Additional class names merged onto the root element. */
  className?: string;
}

/**
 * Shows origin / IndexedDB storage usage against quota as a meter, with a
 * warning state past a configurable threshold. Storage estimates are
 * approximate and blocked in some browsers (e.g. Safari private mode), so the
 * component degrades to a graceful "unavailable" state rather than erroring.
 *
 * Bind it to `useStorageQuota` (the default) or pass an explicit `quota`.
 *
 * @example
 * ```tsx
 * <StorageMeter warnThreshold={0.9} />
 * ```
 */
export function StorageMeter({
  warnThreshold = 0.8,
  quota,
  className,
}: StorageMeterProps) {
  const live = useStorageQuota();
  const source = quota ?? live.quota;
  const loading = quota ? false : live.isLoading;

  if (!source || source.quotaBytes <= 0) {
    return (
      <div
        role="status"
        className={cn(
          'flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground',
          className,
        )}
      >
        <HardDrive className="size-4" aria-hidden="true" />
        {loading ? 'Estimating storage…' : 'Storage estimate unavailable'}
      </div>
    );
  }

  const fraction = Math.max(0, Math.min(1, source.usedBytes / source.quotaBytes));
  const percent = Math.round(fraction * 100);
  const warning = fraction >= warnThreshold;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex w-full max-w-xs flex-col gap-2 rounded-lg border border-border bg-card p-3 text-card-foreground',
        className,
      )}
    >
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium">
          <HardDrive className="size-3.5" aria-hidden="true" />
          Storage
        </span>
        <span
          className={cn(
            'tabular-nums',
            warning ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
          )}
        >
          {formatBytes(source.usedBytes)} / {formatBytes(source.quotaBytes)}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="relative h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300',
            warning ? 'bg-amber-500' : 'bg-primary',
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      {warning && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Storage is {percent}% full - consider clearing cached models.
        </p>
      )}
    </div>
  );
}
