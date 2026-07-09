'use client';

import { CheckCircle2, CloudDownload, Loader2, TriangleAlert } from 'lucide-react';

import { cn } from '@/registry/localmode/lib/utils';

/**
 * Chrome's on-device model state for one capability.
 *
 * The first four are Chrome's own `availability()` values; `unsupported` means the
 * API is not present in this browser at all.
 */
export type ChromeAvailabilityState =
  | 'available'
  | 'downloadable'
  | 'downloading'
  | 'unavailable'
  | 'unsupported';

/** Props for {@link ChromeAIDownloadGate}. */
export interface ChromeAIDownloadGateProps {
  /** Chrome's reported state for the capability this gate guards. */
  availability: ChromeAvailabilityState;
  /** Human-readable capability name (e.g. "Summarizer", "Gemini Nano"). */
  label: string;
  /** Approximate download size (e.g. "~1.5 GB"). Shown on the prompt. */
  size?: string;
  /**
   * Called when the user clicks Download. Chrome only starts the download from a
   * user activation, so this MUST be wired to a real click — it cannot be
   * triggered on mount.
   */
  onDownload: () => void;
  /** True while the download is in flight. */
  isDownloading?: boolean;
  /** Download completion as a 0–1 fraction. Renders an indeterminate bar when omitted. */
  progress?: number;
  /** Message shown when the last download attempt failed. */
  error?: string | null;
  /** What the app will use instead while the model is missing (e.g. "Transformers.js"). */
  fallbackLabel?: string;
  /** Additional class names merged onto the root element. */
  className?: string;
}

function clampPercent(fraction: number): number {
  return Math.max(0, Math.min(100, Math.round(fraction * 100)));
}

/**
 * The gate a user sees when a Chrome Built-in AI capability exists but its
 * on-device model has not been fetched yet.
 *
 * Chrome refuses to start the model download outside a user activation, so a
 * button is not a convenience here — it is the only way to trigger it. This
 * component renders that button, the in-flight progress, and the terminal states
 * (ready / unsupported / this-device-cannot).
 *
 * Presentational and hook-driven: bind `availability`, `progress`, and
 * `isDownloading` to a provider-fallback hook's Chrome state and pass its
 * download action as `onDownload`. It owns no orchestration and starts nothing
 * itself.
 *
 * Renders `null` when the model is already `available` — a ready capability needs
 * no gate.
 *
 * @example
 * ```tsx
 * <ChromeAIDownloadGate
 *   availability={chromeAvailability.summarize ?? 'unsupported'}
 *   label="Chrome Summarizer"
 *   size="~1.5 GB"
 *   isDownloading={downloadingCapability === 'summarize'}
 *   progress={chromeDownloadProgress?.progress}
 *   onDownload={() => requestChromeDownload('summarize')}
 *   fallbackLabel="Transformers.js"
 * />
 * ```
 */
export function ChromeAIDownloadGate({
  availability,
  label,
  size,
  onDownload,
  isDownloading = false,
  progress,
  error,
  fallbackLabel,
  className,
}: ChromeAIDownloadGateProps) {
  // A ready capability needs no gate.
  if (availability === 'available' && !isDownloading) return null;

  // Nothing to offer: the browser has no such API, or this device cannot run it.
  if (availability === 'unsupported' || availability === 'unavailable') {
    const reason =
      availability === 'unsupported'
        ? `${label} is not available in this browser.`
        : `${label} cannot run on this device.`;
    return (
      <div
        className={cn(
          'flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm',
          className,
        )}
      >
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="text-muted-foreground">
          {reason}
          {fallbackLabel ? ` Using ${fallbackLabel} instead.` : null}
        </p>
      </div>
    );
  }

  const downloading = isDownloading || availability === 'downloading';
  const percent = typeof progress === 'number' ? clampPercent(progress) : null;

  return (
    <div className={cn('rounded-lg border border-border bg-card p-3', className)}>
      <div className="flex items-start gap-3">
        <CloudDownload className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {label} needs a one-time download
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Chrome downloads this model once and shares it across every site
            {size ? ` (${size})` : ''}.
            {fallbackLabel ? ` Until then, ${fallbackLabel} is used.` : null}
          </p>

          {downloading ? (
            <div className="mt-3">
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent ?? undefined}
                aria-label={`Downloading ${label}`}
              >
                <div
                  className={cn(
                    'h-full rounded-full bg-primary transition-[width] duration-300',
                    percent === null && 'w-1/3 animate-pulse',
                  )}
                  style={percent === null ? undefined : { width: `${percent}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground" role="status">
                <Loader2 className="mr-1 inline size-3 animate-spin" aria-hidden="true" />
                {percent === null ? 'Downloading…' : `Downloading… ${percent}%`}
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={onDownload}
              className={cn(
                'mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5',
                'text-xs font-medium text-primary-foreground',
                'transition-colors hover:bg-primary/90',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              )}
            >
              <CloudDownload className="size-3.5" aria-hidden="true" />
              {/** KEEP */}
              {/* The accessible name must not contain a host block's run-button name
                  (e.g. "Download Chrome Summarizer" substring-matches "Summarize"),
                  or role+name lookups resolve two controls. The capability is named
                  in the heading above instead. */}
              Download model
            </button>
          )}

          {error ? (
            <p className="mt-2 text-xs text-destructive" role="status">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Props for {@link ChromeAIReadyBadge}. */
export interface ChromeAIReadyBadgeProps {
  /** Capability name shown in the badge. */
  label: string;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/**
 * A compact "model is on-device" confirmation, for use once
 * {@link ChromeAIDownloadGate} has returned `null`.
 */
export function ChromeAIReadyBadge({ label, className }: ChromeAIReadyBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-border',
        'bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground',
        className,
      )}
    >
      <CheckCircle2 className="size-3 text-emerald-500" aria-hidden="true" />
      {label} ready
    </span>
  );
}
