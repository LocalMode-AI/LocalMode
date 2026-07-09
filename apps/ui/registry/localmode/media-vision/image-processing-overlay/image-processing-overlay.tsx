'use client';

import * as React from 'react';
import { Loader2, ScanLine, X } from 'lucide-react';
import { cn } from '@/registry/localmode/lib/utils';

/**
 * Scan-line / scan-grid keyframes, shipped inline so the component works
 * standalone after `shadcn add` (no global CSS required). The showcase
 * centralizes these in `globals.css`; here they are scoped to the overlay.
 */
const SCAN_KEYFRAMES = `
@keyframes lm-scan-sweep {
  0% { transform: translateY(-100%); opacity: 0; }
  20% { opacity: 1; }
  80% { opacity: 1; }
  100% { transform: translateY(2000%); opacity: 0; }
}
@keyframes lm-scan-grid {
  0% { background-position: 0 0; }
  100% { background-position: 0 24px; }
}
`;

/** Props for {@link ImageProcessingOverlay}. */
export interface ImageProcessingOverlayProps {
  /**
   * Whether inference is running. When `false`, the overlay renders nothing
   * (the element is absent from the DOM). Wire this to a vision hook's
   * `isLoading` / `isProcessing`.
   */
  processing: boolean;
  /** Headline status text. @default "Processing image…" */
  status?: string;
  /** Optional sub-line under the status (e.g. model name or progress). */
  detail?: string;
  /**
   * Visual variant. `"spinner"` shows a spinner ring + icon; `"scan"` adds an
   * animated scan-line/scan-grid sweep over the source.
   * @default "spinner"
   */
  variant?: 'spinner' | 'scan';
  /** Icon rendered inside the spinner ring. @default a scan-line icon */
  icon?: React.ReactNode;
  /**
   * When provided, render a "Cancel" link that calls this — wire it to the
   * hook's `cancel` to abort the in-flight operation.
   */
  onCancel?: () => void;
  /** Cancel link label. @default "Cancel" */
  cancelLabel?: string;
  /** Additional class names merged onto the overlay root. */
  className?: string;
}

/**
 * A full-bleed overlay shown over a dimmed source image while vision inference
 * runs: a spinner ring + centered icon, a status headline + optional sub-line,
 * and an optional cancel link. The `"scan"` variant adds an animated scan-line
 * sweep + scan-grid (keyframes shipped inline).
 *
 * Renders NOTHING when `processing` is false. Place it as a sibling of the
 * `<img>` inside a `relative` container.
 *
 * @example
 * ```tsx
 * <div className="relative">
 *   <img src={src} alt="" className={isLoading ? 'opacity-50' : ''} />
 *   <ImageProcessingOverlay
 *     processing={isLoading}
 *     variant="scan"
 *     status="Detecting objects…"
 *     onCancel={cancel}
 *   />
 * </div>
 * ```
 */
export function ImageProcessingOverlay({
  processing,
  status = 'Processing image…',
  detail,
  variant = 'spinner',
  icon,
  onCancel,
  cancelLabel = 'Cancel',
  className,
}: ImageProcessingOverlayProps) {
  if (!processing) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 overflow-hidden rounded-[inherit] bg-background/70 backdrop-blur-sm',
        className,
      )}
    >
      <style>{SCAN_KEYFRAMES}</style>

      {variant === 'scan' && (
        <>
          {/* Scan grid */}
          <div
            className="pointer-events-none absolute inset-0 opacity-20 motion-reduce:hidden"
            style={{
              backgroundImage:
                'linear-gradient(to right, var(--primary, currentColor) 1px, transparent 1px), linear-gradient(to bottom, var(--primary, currentColor) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
              animation: 'lm-scan-grid 1.5s linear infinite',
              color: 'var(--primary)',
            }}
            aria-hidden="true"
          />
          {/* Scan line sweep */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-primary shadow-[0_0_12px_2px_var(--primary)] motion-reduce:hidden"
            style={{ animation: 'lm-scan-sweep 1.8s ease-in-out infinite' }}
            aria-hidden="true"
          />
        </>
      )}

      {/* Spinner ring + centered icon */}
      <div className="relative flex size-12 items-center justify-center">
        <Loader2
          className="absolute size-12 animate-spin text-primary/60 motion-reduce:animate-none"
          aria-hidden="true"
        />
        <span className="text-primary" aria-hidden="true">
          {icon ?? <ScanLine className="size-5" />}
        </span>
      </div>

      <div className="space-y-0.5 text-center">
        <p className="text-sm font-medium text-foreground">{status}</p>
        {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      </div>

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <X className="size-3" aria-hidden="true" />
          {cancelLabel}
        </button>
      )}
    </div>
  );
}
