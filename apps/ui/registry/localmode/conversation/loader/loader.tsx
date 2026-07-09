'use client';

/**
 * @file loader.tsx
 * @description A small family of "busy" indicators shown while a local model
 * warms up or streams its first token. `Loader` selects a variant (dots / pulse
 * / typing / spinner); `Shimmer` renders skeleton-text lines for
 * streamed-but-not-yet-arrived content.
 */
import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/registry/localmode/lib/utils';

/** Loader visual variant. */
export type LoaderVariant = 'dots' | 'pulse' | 'typing' | 'spinner';

/** Props for {@link Loader}. */
export interface LoaderProps extends React.ComponentProps<'div'> {
  /**
   * Which animated indicator to show.
   * @default "dots"
   */
  variant?: LoaderVariant;
  /** Optional label rendered after the indicator (e.g. "Thinking…"). */
  label?: string;
}

/**
 * A busy indicator for pending assistant content.
 *
 * @example
 * ```tsx
 * {isStreaming && messages.at(-1)?.content === '' && <Loader variant="typing" />}
 * ```
 */
export function Loader({
  variant = 'dots',
  label,
  className,
  ...props
}: LoaderProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label ?? 'Loading'}
      data-slot="loader"
      data-variant={variant}
      className={cn('inline-flex items-center gap-2 text-muted-foreground', className)}
      {...props}
    >
      {variant === 'spinner' && <Loader2 className="size-4 animate-spin" />}

      {variant === 'pulse' && (
        <span className="inline-block size-3 animate-pulse rounded-full bg-current" />
      )}

      {(variant === 'dots' || variant === 'typing') && (
        <span className="inline-flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={cn(
                'inline-block rounded-full bg-current',
                variant === 'typing' ? 'size-1.5' : 'size-2',
              )}
              style={{
                animation: 'localmode-loader-bounce 1.2s infinite ease-in-out',
                animationDelay: `${i * 0.16}s`,
              }}
            />
          ))}
        </span>
      )}

      {label && <span className="text-sm">{label}</span>}

      <style>{`
        @keyframes localmode-loader-bounce {
          0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
          40% { opacity: 1; transform: translateY(-3px); }
        }
      `}</style>
    </div>
  );
}

/** Props for {@link Shimmer}. */
export interface ShimmerProps extends React.ComponentProps<'div'> {
  /** Number of skeleton lines to render. @default 3 */
  lines?: number;
}

/**
 * Skeleton-text placeholder for content that is expected but not yet arrived.
 */
export function Shimmer({ lines = 3, className, ...props }: ShimmerProps) {
  return (
    <div
      data-slot="shimmer"
      aria-hidden="true"
      className={cn('w-full space-y-2', className)}
      {...props}
    >
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'h-3.5 animate-pulse rounded bg-muted',
            i === lines - 1 ? 'w-2/3' : 'w-full',
          )}
        />
      ))}
    </div>
  );
}
