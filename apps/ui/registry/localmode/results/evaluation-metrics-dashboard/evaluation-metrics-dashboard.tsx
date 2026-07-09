'use client';

import { cn } from '@/lib/utils';

/** A single KPI/stat tile (value + optional delta indicator). */
export interface StatTile {
  /** Tile label (e.g. "Dataset size"). */
  label: string;
  /** The displayed value (already formatted). */
  value: string | number;
  /**
   * Optional change vs a baseline. Positive renders up/green, negative
   * down/red, in the `value` units.
   */
  delta?: number;
  /** Optional unit suffix shown after the delta (e.g. "pts", "ms"). */
  deltaUnit?: string;
}

/** A labeled metric card (e.g. accuracy / precision / recall / F1). */
export interface MetricCard {
  /** Metric label. */
  label: string;
  /** Metric value in the inclusive range 0–1 (rendered as a percentage). */
  value: number;
}

/**
 * A structured confusion matrix, matching `@localmode/core`'s `confusionMatrix`
 * shape: `matrix[i][j]` = count of true `labels[i]` predicted as `labels[j]`.
 */
export interface ConfusionMatrixData {
  /** Sorted unique class labels defining row/column order. */
  labels: string[];
  /** 2D count matrix. */
  matrix: number[][];
}

/** Threshold-calibration panel data (from `useCalibrateThreshold`). */
export interface CalibrationData {
  /** The empirically calibrated threshold. */
  threshold: number;
  /** The percentile used to select it. */
  percentile?: number;
  /** A preset/reference threshold to compare against. */
  presetThreshold?: number;
  /** Similarity-distribution statistics. */
  distribution?: {
    mean: number;
    median: number;
    stdDev: number;
    min: number;
    max: number;
    count: number;
  };
}

/** Props for {@link EvaluationMetricsDashboard}. */
export interface EvaluationMetricsDashboardProps {
  /** KPI stat-tile row (value + delta). */
  stats?: StatTile[];
  /** Metric cards (accuracy / precision / recall / F1, etc.). */
  metrics?: MetricCard[];
  /** Confusion matrix (color-scaled, with legend). */
  confusionMatrix?: ConfusionMatrixData;
  /**
   * Metrics to plot on the radar/spider sub-view. Defaults to the `metrics`
   * array when omitted; pass an empty array to hide the radar.
   */
  radarMetrics?: MetricCard[];
  /** Threshold-calibration panel data. */
  calibration?: CalibrationData;
  /** Additional class names merged onto the root element. */
  className?: string;
}

const SUCCESS = 'var(--color-emerald-500, #10b981)';
const ERROR = 'var(--color-rose-500, #f43f5e)';

function pct(value: number) {
  return `${(Math.min(1, Math.max(0, value)) * 100).toFixed(1)}%`;
}

/** KPI stat-tile row. */
function StatRow({ stats }: { stats: StatTile[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3">
      {stats.map((stat) => {
        const up = (stat.delta ?? 0) > 0;
        const down = (stat.delta ?? 0) < 0;
        return (
          <div
            key={stat.label}
            className="rounded-lg border border-border bg-card px-4 py-3"
          >
            <div className="text-xs text-muted-foreground">{stat.label}</div>
            <div className="mt-1 text-xl font-bold tabular-nums text-foreground">
              {stat.value}
            </div>
            {typeof stat.delta === 'number' && (
              <div
                className="mt-0.5 text-xs font-medium tabular-nums"
                style={{ color: up ? SUCCESS : down ? ERROR : undefined }}
              >
                {up ? '▲' : down ? '▼' : '-'} {Math.abs(stat.delta)}
                {stat.deltaUnit ? ` ${stat.deltaUnit}` : ''}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Metric-card grid. */
function MetricGrid({ metrics }: { metrics: MetricCard[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 @xl:grid-cols-4">
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className="rounded-lg border border-border bg-card px-4 py-3"
        >
          <div className="text-xs text-muted-foreground">{metric.label}</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">
            {pct(metric.value)}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: pct(metric.value) }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Color-scaled N×N confusion matrix with legend. */
function ConfusionMatrixView({ data }: { data: ConfusionMatrixData }) {
  const max = Math.max(1, ...data.matrix.flat());
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-foreground">
          Confusion matrix
        </h4>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span
              className="size-2.5 rounded-sm"
              style={{ backgroundColor: SUCCESS }}
            />
            correct
          </span>
          <span className="inline-flex items-center gap-1">
            <span
              className="size-2.5 rounded-sm"
              style={{ backgroundColor: ERROR }}
            />
            misclassified
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-1 text-xs">
          <thead>
            <tr>
              <th className="p-1 text-left font-normal text-muted-foreground">
                true ＼ pred
              </th>
              {data.labels.map((label) => (
                <th
                  key={label}
                  className="p-1 font-medium text-muted-foreground"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.matrix.map((row, i) => (
              <tr key={data.labels[i]}>
                <th className="p-1 text-left font-medium text-muted-foreground">
                  {data.labels[i]}
                </th>
                {row.map((count, j) => {
                  const intensity = count / max;
                  const base = i === j ? SUCCESS : ERROR;
                  return (
                    <td
                      key={j}
                      className={cn(
                        'size-9 rounded-sm text-center align-middle font-medium tabular-nums text-foreground',
                        // Non-color cue: diagonal (correct) cells get a neutral ring.
                        i === j && 'ring-1 ring-inset ring-foreground/25',
                      )}
                      style={{
                        // Tint capped so `foreground` text clears AA in both themes.
                        backgroundColor:
                          count === 0
                            ? 'var(--color-muted, #f1f5f9)'
                            : `color-mix(in srgb, ${base} ${Math.round(15 + intensity * 25)}%, transparent)`,
                      }}
                      title={`true ${data.labels[i]} → pred ${data.labels[j]}: ${count}`}
                    >
                      {count}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Minimal SVG radar/spider chart (no external chart lib). */
function RadarView({ metrics }: { metrics: MetricCard[] }) {
  const size = 200;
  const center = size / 2;
  const radius = center - 28;
  const n = metrics.length;

  const point = (value: number, index: number) => {
    const angle = (Math.PI * 2 * index) / n - Math.PI / 2;
    const r = radius * Math.min(1, Math.max(0, value));
    return [center + r * Math.cos(angle), center + r * Math.sin(angle)];
  };
  const axisPoint = (index: number) => {
    const angle = (Math.PI * 2 * index) / n - Math.PI / 2;
    return [center + radius * Math.cos(angle), center + radius * Math.sin(angle)];
  };

  const polygon = metrics
    .map((m, i) => point(m.value, i).join(','))
    .join(' ');

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h4 className="mb-2 text-sm font-semibold text-foreground">
        Metric radar
      </h4>
      <svg
        width="100%"
        viewBox={`-28 0 ${size + 56} ${size}`}
        className="mx-auto max-w-[260px]"
        role="img"
        aria-label="Radar chart of metrics"
      >
        {[0.25, 0.5, 0.75, 1].map((ring) => (
          <circle
            key={ring}
            cx={center}
            cy={center}
            r={radius * ring}
            fill="none"
            stroke="var(--color-border, #e5e7eb)"
            strokeWidth={1}
          />
        ))}
        {metrics.map((m, i) => {
          const [x, y] = axisPoint(i);
          return (
            <line
              key={m.label}
              x1={center}
              y1={center}
              x2={x}
              y2={y}
              stroke="var(--color-border, #e5e7eb)"
              strokeWidth={1}
            />
          );
        })}
        <polygon
          points={polygon}
          fill="color-mix(in srgb, var(--color-primary) 25%, transparent)"
          stroke="var(--color-primary)"
          strokeWidth={2}
        />
        {metrics.map((m, i) => {
          const [x, y] = axisPoint(i);
          const dx = x < center ? 2 : x > center ? -2 : 0;
          const shortLabel = m.label.length > 10 ? `${m.label.slice(0, 9)}…` : m.label;
          return (
            <text
              key={m.label}
              x={x + dx}
              y={y < center ? y - 4 : y + 10}
              textAnchor={x < center - 4 ? 'start' : x > center + 4 ? 'end' : 'middle'}
              className="fill-foreground/70 text-[10px]"
            >
              <title>{m.label}</title>
              {shortLabel}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

/** Threshold-calibration panel. */
function CalibrationPanel({ data }: { data: CalibrationData }) {
  const stats: Array<[string, string]> = [];
  if (typeof data.percentile === 'number')
    stats.push(['Percentile', `${data.percentile}`]);
  if (typeof data.presetThreshold === 'number')
    stats.push(['Preset', data.presetThreshold.toFixed(3)]);
  if (data.distribution) {
    stats.push(['Mean', data.distribution.mean.toFixed(3)]);
    stats.push(['Median', data.distribution.median.toFixed(3)]);
    stats.push(['Std dev', data.distribution.stdDev.toFixed(3)]);
    stats.push(['Samples', `${data.distribution.count}`]);
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-baseline justify-between">
        <h4 className="text-sm font-semibold text-foreground">
          Calibrated threshold
        </h4>
        <span className="text-2xl font-bold tabular-nums text-primary">
          {data.threshold.toFixed(3)}
        </span>
      </div>
      {stats.length > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs @md:grid-cols-3">
          {stats.map(([key, value]) => (
            <div key={key} className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{key}</dt>
              <dd className="font-medium tabular-nums text-foreground">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/**
 * A composite evaluation dashboard: a labeled KPI/stat-tile row (value + delta),
 * a responsive grid of metric cards (accuracy / precision / recall / F1), a
 * color-coded N×N confusion matrix (diagonal success-tinted, off-diagonal
 * error-tinted, intensity scaled to the max cell, with legend), a radar/spider
 * sub-view, and a threshold-calibration panel. Driven by `useEvaluateModel` +
 * `useCalibrateThreshold`. All charts are minimal in-component SVG — no external
 * chart library.
 *
 * Each section is optional; pass only the data you have.
 *
 * @example
 * ```tsx
 * <EvaluationMetricsDashboard
 *   stats={[{ label: 'Dataset', value: 200 }, { label: 'Duration', value: '1.2s' }]}
 *   metrics={[{ label: 'Accuracy', value: 0.91 }, { label: 'F1', value: 0.88 }]}
 *   confusionMatrix={{ labels: ['pos', 'neg'], matrix: [[42, 8], [5, 45]] }}
 *   calibration={{ threshold: 0.62, percentile: 90 }}
 * />
 * ```
 */
export function EvaluationMetricsDashboard({
  stats,
  metrics,
  confusionMatrix,
  radarMetrics,
  calibration,
  className,
}: EvaluationMetricsDashboardProps) {
  const radar = radarMetrics ?? metrics;

  return (
    <div className={cn('@container flex w-full flex-col gap-4', className)}>
      {stats && stats.length > 0 && <StatRow stats={stats} />}
      {metrics && metrics.length > 0 && <MetricGrid metrics={metrics} />}
      {((confusionMatrix && confusionMatrix.labels.length > 0) ||
        (radar && radar.length >= 3)) && (
        <div className="grid gap-4 @2xl:grid-cols-2">
          {confusionMatrix && confusionMatrix.labels.length > 0 && (
            <ConfusionMatrixView data={confusionMatrix} />
          )}
          {radar && radar.length >= 3 && <RadarView metrics={radar} />}
        </div>
      )}
      {calibration && <CalibrationPanel data={calibration} />}
    </div>
  );
}
