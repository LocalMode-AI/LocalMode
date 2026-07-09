'use client';

/**
 * @file system-notice-banner.tsx
 * @description An in-conversation banner notice rendered inside the chat surface
 * (not as a user/assistant bubble) for local-first state changes:
 * offline/online transitions, model switch, capability-unavailable, WebGPU→WASM
 * fallback, cache eviction, or download-required notices. Data source:
 * `useNetworkStatus` / `useCapabilities`.
 */
import * as React from 'react';
import {
  CloudOff,
  Cpu,
  Download,
  Info,
  RefreshCw,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { cn } from '@/registry/localmode/lib/utils';
import { Button } from '@/registry/localmode/ui/button';

/** The kind of notice (drives icon + default copy). */
export type NoticeKind =
  | 'offline'
  | 'online'
  | 'fallback'
  | 'capability-unavailable'
  | 'model-switch'
  | 'eviction'
  | 'download-required'
  | 'info';

/** Visual tone. */
export type NoticeTone = 'info' | 'warning';

const KIND_META: Record<
  NoticeKind,
  { icon: React.ReactNode; tone: NoticeTone; defaultMessage: string }
> = {
  offline: {
    icon: <CloudOff className="size-4" />,
    tone: 'warning',
    defaultMessage: "You're offline - cached models still work.",
  },
  online: {
    icon: <Info className="size-4" />,
    tone: 'info',
    defaultMessage: 'Back online.',
  },
  fallback: {
    icon: <Cpu className="size-4" />,
    tone: 'warning',
    defaultMessage: 'WebGPU unavailable - falling back to WASM (slower).',
  },
  'capability-unavailable': {
    icon: <TriangleAlert className="size-4" />,
    tone: 'warning',
    defaultMessage: 'A required capability is unavailable on this device.',
  },
  'model-switch': {
    icon: <RefreshCw className="size-4" />,
    tone: 'info',
    defaultMessage: 'Switched models.',
  },
  eviction: {
    icon: <Trash2 className="size-4" />,
    tone: 'warning',
    defaultMessage: 'A cached model was evicted to free storage.',
  },
  'download-required': {
    icon: <Download className="size-4" />,
    tone: 'info',
    defaultMessage: 'This model needs to download before first use.',
  },
  info: {
    icon: <Info className="size-4" />,
    tone: 'info',
    defaultMessage: '',
  },
};

/** Props for {@link SystemNoticeBanner}. */
export interface SystemNoticeBannerProps extends React.ComponentProps<'div'> {
  /** The notice kind (sets the icon, tone, and default copy). @default "info" */
  kind?: NoticeKind;
  /** Override the tone independently of `kind`. */
  tone?: NoticeTone;
  /** Notice text (falls back to the kind's default copy). */
  message?: string;
  /** Optional trailing action (e.g. a "Download" or "Retry" button). */
  action?: React.ReactNode;
  /** When provided, renders a dismiss control. */
  onDismiss?: () => void;
}

/**
 * An inline local-first state banner.
 *
 * @example
 * ```tsx
 * const { isOnline } = useNetworkStatus();
 * {!isOnline && <SystemNoticeBanner kind="offline" onDismiss={hide} />}
 * ```
 */
export function SystemNoticeBanner({
  kind = 'info',
  tone,
  message,
  action,
  onDismiss,
  className,
  children,
  ...props
}: SystemNoticeBannerProps) {
  const meta = KIND_META[kind];
  const resolvedTone = tone ?? meta.tone;
  return (
    <div
      role="status"
      data-slot="system-notice-banner"
      data-kind={kind}
      data-tone={resolvedTone}
      className={cn(
        'mx-auto flex w-full max-w-3xl flex-wrap items-start gap-2 rounded-md border px-3 py-1.5 text-xs sm:flex-nowrap',
        resolvedTone === 'warning'
          ? 'border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400'
          : 'border-border bg-muted/40 text-muted-foreground',
        className,
      )}
      {...props}
    >
      <span className="mt-0.5 shrink-0">{meta.icon}</span>
      <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
        {children ?? message ?? meta.defaultMessage}
      </span>
      {action ? <span className="shrink-0">{action}</span> : null}
      {onDismiss && (
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="-mt-0.5 shrink-0"
        >
          <X className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
