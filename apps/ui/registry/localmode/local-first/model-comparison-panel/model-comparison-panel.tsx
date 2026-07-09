'use client';

import { X } from 'lucide-react';

import { cn } from '@/registry/localmode/lib/utils';

/** A scored entry for side-by-side comparison. */
export interface ComparisonEntry {
  /** Stable model id. */
  modelId: string;
  /** Display name. */
  name: string;
  /** Score (0–100). */
  score: number;
  /** Size in MB (numeric, for "smaller is better" comparison). */
  sizeMB?: number;
  /** Human-readable size label (display). */
  size?: string;
  /** Speed tier. */
  speedTier?: 'fast' | 'medium' | 'slow';
  /** Quality tier. */
  qualityTier?: 'low' | 'medium' | 'high';
  /** Recommended device. */
  device?: 'webgpu' | 'wasm' | 'cpu';
  /** Embedding dimensions. */
  dimensions?: number;
}

/** Props for {@link ModelComparisonPanel}. */
export interface ModelComparisonPanelProps {
  /** The two entries to compare. */
  entries: [ComparisonEntry, ComparisonEntry];
  /** Fired when the comparison is dismissed. */
  onClear?: () => void;
  /** Additional class names merged onto the root element. */
  className?: string;
}

const SPEED_RANK = { fast: 3, medium: 2, slow: 1 } as const;
const QUALITY_RANK = { high: 3, medium: 2, low: 1 } as const;

type Winner = 'a' | 'b' | 'tie';

/** Higher value wins. */
function winnerHigher(a?: number, b?: number): Winner {
  if (a == null || b == null) return 'tie';
  if (a > b) return 'a';
  if (b > a) return 'b';
  return 'tie';
}

/** Lower value wins (e.g. size). */
function winnerLower(a?: number, b?: number): Winner {
  if (a == null || b == null) return 'tie';
  if (a < b) return 'a';
  if (b < a) return 'b';
  return 'tie';
}

interface Row {
  label: string;
  a: string;
  b: string;
  winner: Winner;
}

/**
 * A side-by-side comparison of two scored model entries with labeled rows
 * (Score, Size, Speed, Quality, Device, Dimensions). The better value in each
 * row is accent-highlighted and the other dimmed — win-highlighting is derived
 * purely from props (no orchestration state). `onClear` dismisses the panel.
 * Bind to `useModelRecommendations`.
 *
 * @example
 * ```tsx
 * <ModelComparisonPanel entries={[a, b]} onClear={clear} />
 * ```
 */
export function ModelComparisonPanel({
  entries,
  onClear,
  className,
}: ModelComparisonPanelProps) {
  const [a, b] = entries;

  const rows: Row[] = [
    {
      label: 'Score',
      a: String(Math.round(a.score)),
      b: String(Math.round(b.score)),
      winner: winnerHigher(a.score, b.score),
    },
    {
      label: 'Size',
      a: a.size ?? (a.sizeMB != null ? `${a.sizeMB} MB` : '-'),
      b: b.size ?? (b.sizeMB != null ? `${b.sizeMB} MB` : '-'),
      winner: winnerLower(a.sizeMB, b.sizeMB),
    },
    {
      label: 'Speed',
      a: a.speedTier ?? '-',
      b: b.speedTier ?? '-',
      winner: winnerHigher(
        a.speedTier ? SPEED_RANK[a.speedTier] : undefined,
        b.speedTier ? SPEED_RANK[b.speedTier] : undefined,
      ),
    },
    {
      label: 'Quality',
      a: a.qualityTier ?? '-',
      b: b.qualityTier ?? '-',
      winner: winnerHigher(
        a.qualityTier ? QUALITY_RANK[a.qualityTier] : undefined,
        b.qualityTier ? QUALITY_RANK[b.qualityTier] : undefined,
      ),
    },
    { label: 'Device', a: a.device ?? '-', b: b.device ?? '-', winner: 'tie' },
    {
      label: 'Dimensions',
      a: a.dimensions != null ? String(a.dimensions) : '-',
      b: b.dimensions != null ? String(b.dimensions) : '-',
      winner: winnerHigher(a.dimensions, b.dimensions),
    },
  ];

  const cellClass = (side: 'a' | 'b', winner: Winner) =>
    cn(
      'w-fit justify-self-start rounded-md px-2 py-1 text-sm font-medium capitalize tabular-nums',
      winner === side
        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
        : winner === 'tie'
          ? 'text-foreground'
          : 'text-muted-foreground/60',
    );

  return (
    <div
      className={cn(
        'flex w-full max-w-lg flex-col gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm',
        className,
      )}
    >
      <div className="grid min-w-0 grid-cols-[7.5rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Metric
        </span>
        <span className="truncate px-2 text-sm font-semibold">{a.name}</span>
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className="truncate px-2 text-sm font-semibold">{b.name}</span>
          {onClear && (
            <button
              type="button"
              aria-label="Clear comparison"
              onClick={onClear}
              className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[7.5rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-3 border-t border-border pt-1 first:border-t-0"
          >
            <span className="text-xs text-muted-foreground">{row.label}</span>
            <span className={cellClass('a', row.winner)}>{row.a}</span>
            <span className={cellClass('b', row.winner)}>{row.b}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
