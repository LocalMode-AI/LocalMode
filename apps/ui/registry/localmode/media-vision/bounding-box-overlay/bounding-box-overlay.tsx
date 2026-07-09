'use client';

import * as React from 'react';
import { cn } from '@/registry/localmode/lib/utils';

/**
 * A pixel-coordinate bounding box, matching `@localmode/core`'s `BoundingBox`
 * ({@link https://localmode.dev}). Coordinates are in the image's NATURAL pixel
 * space (origin top-left).
 */
export interface DetectionBox {
  /** X of the top-left corner, in natural image pixels. */
  x: number;
  /** Y of the top-left corner, in natural image pixels. */
  y: number;
  /** Box width, in natural image pixels. */
  width: number;
  /** Box height, in natural image pixels. */
  height: number;
}

/**
 * One detection result: `{ label, score, box }`. Matches `useDetectObjects`
 * directly; `useDetectFace` / `useDetectHands` / `useDetectPose` return
 * different shapes (no `label`, and landmarks rather than a box), so map those
 * into this shape before passing them in.
 */
export interface Detection {
  /** Class label, e.g. "person", "face". Used for color-coding + the legend. */
  label: string;
  /** Confidence score in `[0, 1]`. Rendered as a percentage on the chip. */
  score?: number;
  /** Bounding box in natural image pixels. */
  box: DetectionBox;
}

/** Tailwind class tuples (border + chip background + legend dot) per color slot. */
const COLOR_SLOTS = [
  { border: 'border-emerald-500', chip: 'bg-emerald-500', dot: 'bg-emerald-500' },
  { border: 'border-sky-500', chip: 'bg-sky-500', dot: 'bg-sky-500' },
  { border: 'border-amber-500', chip: 'bg-amber-500', dot: 'bg-amber-500' },
  { border: 'border-violet-500', chip: 'bg-violet-500', dot: 'bg-violet-500' },
  { border: 'border-rose-500', chip: 'bg-rose-500', dot: 'bg-rose-500' },
  { border: 'border-cyan-500', chip: 'bg-cyan-500', dot: 'bg-cyan-500' },
  { border: 'border-orange-500', chip: 'bg-orange-500', dot: 'bg-orange-500' },
  { border: 'border-lime-500', chip: 'bg-lime-500', dot: 'bg-lime-500' },
] as const;

/**
 * Build a stable label → color-slot map so the same class always gets the same
 * color across the overlay and the legend.
 */
export function buildColorMap(labels: string[]): Map<string, (typeof COLOR_SLOTS)[number]> {
  const map = new Map<string, (typeof COLOR_SLOTS)[number]>();
  let next = 0;
  for (const label of labels) {
    if (!map.has(label)) {
      map.set(label, COLOR_SLOTS[next % COLOR_SLOTS.length]);
      next += 1;
    }
  }
  return map;
}

/** Props for {@link BoundingBoxOverlay}. */
export interface BoundingBoxOverlayProps {
  /** Detections to render. Boxes are in natural-pixel coordinates. */
  detections: Detection[];
  /**
   * The image's NATURAL width in pixels (e.g. `imgEl.naturalWidth`). Required
   * to convert pixel boxes to display-independent percentage offsets.
   */
  naturalWidth: number;
  /** The image's NATURAL height in pixels (e.g. `imgEl.naturalHeight`). */
  naturalHeight: number;
  /**
   * Hide the per-box label chip (border-only boxes). Useful for dense
   * landmark/pose output.
   * @default false
   */
  hideLabels?: boolean;
  /** Additional class names merged onto the overlay root. */
  className?: string;
}

/**
 * Renders detection boxes as absolutely-positioned, color-coded overlays over a
 * parent image. Pixel boxes are converted to PERCENTAGE offsets using the
 * image's natural width/height, so placement is correct at any display size.
 *
 * Place it as a sibling of the `<img>` inside a `relative` container; it fills
 * the container (`absolute inset-0`) and is non-interactive. It renders any
 * `{ label, score, box }[]` — `useDetectObjects` produces that directly; map
 * face/hand/pose results into the same shape first.
 *
 * @example
 * ```tsx
 * <div className="relative">
 *   <img ref={imgRef} src={src} alt="" className="w-full" />
 *   <BoundingBoxOverlay
 *     detections={result.objects}
 *     naturalWidth={imgRef.current?.naturalWidth ?? 0}
 *     naturalHeight={imgRef.current?.naturalHeight ?? 0}
 *   />
 * </div>
 * ```
 */
export function BoundingBoxOverlay({
  detections,
  naturalWidth,
  naturalHeight,
  hideLabels = false,
  className,
}: BoundingBoxOverlayProps) {
  if (naturalWidth <= 0 || naturalHeight <= 0) return null;

  const colorMap = buildColorMap(detections.map((d) => d.label));

  return (
    <div
      className={cn('pointer-events-none absolute inset-0', className)}
      aria-hidden="true"
    >
      {detections.map((detection, index) => {
        const { box, label, score } = detection;
        const slot = colorMap.get(label) ?? COLOR_SLOTS[0];

        const style: React.CSSProperties = {
          left: `${(box.x / naturalWidth) * 100}%`,
          top: `${(box.y / naturalHeight) * 100}%`,
          width: `${(box.width / naturalWidth) * 100}%`,
          height: `${(box.height / naturalHeight) * 100}%`,
        };

        return (
          <div
            key={`${label}-${index}`}
            className={cn(
              'absolute rounded-sm border-2',
              slot.border,
            )}
            style={style}
          >
            {!hideLabels && (
              <span
                className={cn(
                  'absolute left-0 top-0 inline-flex -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded-sm px-1.5 py-0.5 text-[0.625rem] font-semibold leading-none text-white shadow-sm',
                  slot.chip,
                )}
              >
                <span>{label}</span>
                {score != null && (
                  <span className="opacity-90">{Math.round(score * 100)}%</span>
                )}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Props for {@link DetectionLabelLegend}. */
export interface DetectionLabelLegendProps {
  /**
   * Detected class labels (duplicates allowed — they are de-duplicated). Colors
   * match {@link BoundingBoxOverlay} for the same label set/order.
   */
  labels: string[];
  /** Additional class names merged onto the root. */
  className?: string;
}

/**
 * A wrapping strip of color → class pills that matches the colors used by
 * {@link BoundingBoxOverlay}. Pass the same labels (in the same order) you fed
 * the overlay so the color assignment lines up.
 *
 * @example
 * ```tsx
 * <DetectionLabelLegend labels={result.objects.map((o) => o.label)} />
 * ```
 */
export function DetectionLabelLegend({
  labels,
  className,
}: DetectionLabelLegendProps) {
  const colorMap = buildColorMap(labels);
  const unique = Array.from(colorMap.keys());

  if (unique.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {unique.map((label) => {
        const slot = colorMap.get(label) ?? COLOR_SLOTS[0];
        return (
          <span
            key={label}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-card-foreground"
          >
            <span
              className={cn('size-2 rounded-full', slot.dot)}
              aria-hidden="true"
            />
            {label}
          </span>
        );
      })}
    </div>
  );
}
