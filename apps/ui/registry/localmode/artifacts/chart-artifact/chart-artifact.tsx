'use client';

/**
 * @file chart-artifact.tsx
 * @description Client-side data-viz chart (line / bar / area / scatter / radar /
 * gauge) rendered from LOCAL data — embedding-similarity distributions,
 * evaluation curves (precision/recall/F1 radar), drift-over-time, latency/tok-s
 * trends, or 2D embedding projections (PCA/UMAP scatter). A minimal dependency-
 * free SVG renderer keeps the copied component small. Not a generic BI widget —
 * it visualizes what runs in the browser.
 */

import * as React from 'react';
import { cn } from '@/registry/localmode/lib/utils';

/** A single chart data point. `x`/`y` for cartesian charts; `label`/`value` for radar/gauge/bar. */
export interface ChartPoint {
  /** Numeric x value (line/area/scatter). */
  x?: number;
  /** Numeric y/value. */
  y?: number;
  /** Category label (bar/radar axes). */
  label?: string;
  /** Numeric value (bar/radar/gauge). */
  value?: number;
}

/** Supported chart kinds. */
export type ChartType =
  | 'line'
  | 'bar'
  | 'area'
  | 'scatter'
  | 'radar'
  | 'gauge';

/** Props for {@link ChartArtifact}. */
export interface ChartArtifactProps {
  /** Chart kind. */
  type: ChartType;
  /** Data points. Shape requirements vary by `type` (see each field's docs). */
  data: ChartPoint[];
  /** Drawing width in px. @default 360 */
  width?: number;
  /** Drawing height in px. @default 220 */
  height?: number;
  /**
   * For `gauge`: the maximum value (the dial's full-scale). Defaults to the
   * single data point's `value` if ≤ 1 then 1, else the value itself.
   */
  max?: number;
  /** Accessible label / title for the chart region. */
  title?: string;
  /** Additional class names merged onto the root SVG wrapper. */
  className?: string;
}

const PADDING = 28;
/** Stroke/fill use `currentColor` so the chart inherits the consumer's theme. */
const SERIES_CLASS = 'text-primary';
const GRID_CLASS = 'text-border';
const AXIS_TEXT_CLASS = 'fill-muted-foreground text-[10px]';

/** Scale a numeric domain `[min,max]` to a pixel range `[lo,hi]`. */
function scale(value: number, min: number, max: number, lo: number, hi: number) {
  if (max === min) return (lo + hi) / 2;
  return lo + ((value - min) / (max - min)) * (hi - lo);
}

/**
 * A dependency-free SVG chart for local metrics. Pick a `type` and pass `data`:
 * - `line` / `area`: `{ x, y }` points (e.g. drift-over-time, latency).
 * - `bar`: `{ label, value }` points.
 * - `scatter`: `{ x, y }` points (e.g. 2D embedding projection).
 * - `radar`: `{ label, value }` axes (e.g. precision/recall/F1, values 0–1).
 * - `gauge`: a single `{ value }` (0–`max`).
 *
 * Everything renders in-browser via inline SVG; colors come from `currentColor`
 * + shadcn/ui tokens so the chart matches the consumer's theme.
 *
 * @example
 * ```tsx
 * <ChartArtifact
 *   type="radar"
 *   data={[
 *     { label: 'Precision', value: 0.91 },
 *     { label: 'Recall', value: 0.84 },
 *     { label: 'F1', value: 0.87 },
 *   ]}
 * />
 * ```
 */
export function ChartArtifact({
  type,
  data,
  width = 360,
  height = 220,
  max,
  title,
  className,
}: ChartArtifactProps) {
  const body =
    data.length === 0 ? null : type === 'radar' ? (
      <RadarChart data={data} width={width} height={height} />
    ) : type === 'gauge' ? (
      <GaugeChart data={data} width={width} height={height} max={max} />
    ) : type === 'bar' ? (
      <BarChart data={data} width={width} height={height} />
    ) : (
      <CartesianChart type={type} data={data} width={width} height={height} />
    );

  return (
    <div
      data-slot="chart-artifact"
      data-chart-type={type}
      className={cn(
        'rounded-lg border border-border bg-card p-2 text-card-foreground',
        className,
      )}
    >
      {title ? (
        <p className="px-2 pb-1 pt-1 text-xs font-medium text-muted-foreground">
          {title}
        </p>
      ) : null}
      {data.length === 0 ? (
        <p className="px-2 py-6 text-center text-sm text-muted-foreground">
          No data
        </p>
      ) : (
        <svg
          role="img"
          aria-label={title ?? `${type} chart`}
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          className="overflow-hidden"
        >
          {body}
        </svg>
      )}
    </div>
  );
}

/** Line / area / scatter over `{ x, y }` points. */
function CartesianChart({
  type,
  data,
  width,
  height,
}: {
  type: 'line' | 'area' | 'scatter';
  data: ChartPoint[];
  width: number;
  height: number;
}) {
  const xs = data.map((d, i) => d.x ?? i);
  const ys = data.map((d) => d.y ?? 0);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(0, ...ys);
  const yMax = Math.max(...ys);

  const px = (x: number) => scale(x, xMin, xMax, PADDING, width - PADDING);
  const py = (y: number) => scale(y, yMin, yMax, height - PADDING, PADDING);

  const points = data.map((d, i) => ({
    cx: px(d.x ?? i),
    cy: py(d.y ?? 0),
  }));
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.cx} ${p.cy}`)
    .join(' ');
  const baselineY = py(Math.max(0, yMin));
  const areaPath = `${path} L ${points[points.length - 1].cx} ${baselineY} L ${points[0].cx} ${baselineY} Z`;

  return (
    <g>
      {/* baseline axis */}
      <line
        x1={PADDING}
        y1={baselineY}
        x2={width - PADDING}
        y2={baselineY}
        className={GRID_CLASS}
        stroke="currentColor"
        strokeWidth={1}
      />
      {type === 'area' ? (
        <path
          d={areaPath}
          className={SERIES_CLASS}
          fill="currentColor"
          fillOpacity={0.15}
          stroke="none"
        />
      ) : null}
      {type !== 'scatter' ? (
        <path
          d={path}
          className={SERIES_CLASS}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.cx}
          cy={p.cy}
          r={type === 'scatter' ? 3.5 : 2.5}
          className={SERIES_CLASS}
          fill="currentColor"
        />
      ))}
      <text x={PADDING} y={height - 6} className={AXIS_TEXT_CLASS}>
        {formatNum(xMin)}
      </text>
      <text
        x={width - PADDING}
        y={height - 6}
        textAnchor="end"
        className={AXIS_TEXT_CLASS}
      >
        {formatNum(xMax)}
      </text>
    </g>
  );
}

/** Vertical bars over `{ label, value }` points. */
function BarChart({
  data,
  width,
  height,
}: {
  data: ChartPoint[];
  width: number;
  height: number;
}) {
  const values = data.map((d) => d.value ?? d.y ?? 0);
  const yMax = Math.max(1, ...values);
  const plotW = width - PADDING * 2;
  const slot = plotW / data.length;
  const barW = slot * 0.6;
  const baseY = height - PADDING;

  return (
    <g>
      <line
        x1={PADDING}
        y1={baseY}
        x2={width - PADDING}
        y2={baseY}
        className={GRID_CLASS}
        stroke="currentColor"
        strokeWidth={1}
      />
      {data.map((d, i) => {
        const value = d.value ?? d.y ?? 0;
        const barH = scale(value, 0, yMax, 0, height - PADDING * 2);
        const x = PADDING + i * slot + (slot - barW) / 2;
        return (
          <g key={i}>
            <rect
              x={x}
              y={baseY - barH}
              width={barW}
              height={barH}
              rx={2}
              className={SERIES_CLASS}
              fill="currentColor"
            />
            <text
              x={x + barW / 2}
              y={height - 6}
              textAnchor="middle"
              className={AXIS_TEXT_CLASS}
            >
              {d.label ?? i}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** Radar / spider over `{ label, value }` axes (values normalized to their max). */
function RadarChart({
  data,
  width,
  height,
}: {
  data: ChartPoint[];
  width: number;
  height: number;
}) {
  const cx = width / 2;
  const cy = height / 2;
  // Inset the draw radius extra so the axis labels placed at `radius + 10`
  // (anchored on the side spokes) sit clear of the card edge instead of
  // crowding/clipping it.
  const radius = Math.min(width, height) / 2 - PADDING * 1.6;
  const values = data.map((d) => d.value ?? 0);
  const maxValue = Math.max(1, ...values);
  const n = data.length;

  const angleAt = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const coordAt = (i: number, r: number) => ({
    x: cx + r * Math.cos(angleAt(i)),
    y: cy + r * Math.sin(angleAt(i)),
  });

  const rings = [0.25, 0.5, 0.75, 1];
  const polygon = data
    .map((d, i) => {
      const r = scale(d.value ?? 0, 0, maxValue, 0, radius);
      const p = coordAt(i, r);
      return `${p.x},${p.y}`;
    })
    .join(' ');

  return (
    <g>
      {rings.map((ring) => (
        <polygon
          key={ring}
          points={data
            .map((_, i) => {
              const p = coordAt(i, radius * ring);
              return `${p.x},${p.y}`;
            })
            .join(' ')}
          className={GRID_CLASS}
          fill="none"
          stroke="currentColor"
          strokeWidth={0.75}
        />
      ))}
      {data.map((_, i) => {
        const p = coordAt(i, radius);
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={p.x}
            y2={p.y}
            className={GRID_CLASS}
            stroke="currentColor"
            strokeWidth={0.75}
          />
        );
      })}
      <polygon
        points={polygon}
        className={SERIES_CLASS}
        fill="currentColor"
        fillOpacity={0.2}
        stroke="currentColor"
        strokeWidth={2}
      />
      {data.map((d, i) => {
        const p = coordAt(i, radius + 10);
        // Anchor side labels toward the center so they grow inward (away from
        // the card edge) rather than overflowing it. Top/bottom stay centered.
        const dx = p.x - cx;
        const anchor =
          Math.abs(dx) < 1 ? 'middle' : dx > 0 ? 'end' : 'start';
        return (
          <text
            key={i}
            x={p.x}
            y={p.y}
            textAnchor={anchor}
            dominantBaseline="middle"
            className={AXIS_TEXT_CLASS}
          >
            <title>{d.label ?? String(i)}</title>
            {d.label && d.label.length > 12 ? `${d.label.slice(0, 11)}…` : (d.label ?? i)}
          </text>
        );
      })}
    </g>
  );
}

/** Single-value semicircular gauge over the first `{ value }` point. */
function GaugeChart({
  data,
  width,
  height,
  max,
}: {
  data: ChartPoint[];
  width: number;
  height: number;
  max?: number;
}) {
  const value = data[0]?.value ?? data[0]?.y ?? 0;
  const fullScale = max ?? (value <= 1 ? 1 : value);
  const fraction = Math.max(0, Math.min(1, fullScale === 0 ? 0 : value / fullScale));

  const cx = width / 2;
  const cy = height - PADDING;
  const radius = Math.min(width / 2, height) - PADDING;

  // Semicircle from 180° (left) to 0° (right).
  const pointOnArc = (frac: number) => {
    const angle = Math.PI - Math.PI * frac;
    return { x: cx + radius * Math.cos(angle), y: cy - radius * Math.sin(angle) };
  };
  const start = pointOnArc(0);
  const end = pointOnArc(1);
  const valueEnd = pointOnArc(fraction);

  const arc = (from: { x: number; y: number }, to: { x: number; y: number }) =>
    `M ${from.x} ${from.y} A ${radius} ${radius} 0 0 1 ${to.x} ${to.y}`;

  return (
    <g>
      <path
        d={arc(start, end)}
        className={GRID_CLASS}
        fill="none"
        stroke="currentColor"
        strokeWidth={10}
        strokeLinecap="round"
      />
      <path
        d={arc(start, valueEnd)}
        className={SERIES_CLASS}
        fill="none"
        stroke="currentColor"
        strokeWidth={10}
        strokeLinecap="round"
      />
      <text
        x={cx}
        y={cy - 4}
        textAnchor="middle"
        className="fill-foreground text-[20px] font-semibold"
      >
        {fullScale <= 1 ? `${Math.round(fraction * 100)}%` : formatNum(value)}
      </text>
    </g>
  );
}

/** Compact numeric formatter for axis labels. */
function formatNum(value: number) {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2);
}
