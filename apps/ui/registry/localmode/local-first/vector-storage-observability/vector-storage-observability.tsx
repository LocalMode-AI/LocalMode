'use client';

import { formatBytes } from '@/lib/browser-utils';
import { Database, Gauge, Zap } from 'lucide-react';

import { cn } from '@/registry/localmode/lib/utils';

/** Compression stats (mirrors core `getCompressionStats()`). */
export interface CompressionStatsLike {
  /** Compression ratio (original / compressed). */
  ratio: number;
  /** Estimated uncompressed size in bytes. */
  originalSizeBytes: number;
  /** Estimated compressed size in bytes. */
  compressedSizeBytes: number;
  /** Number of stored vectors. */
  vectorCount?: number;
}

/** Active quantization tier. */
export type QuantizationTier = 'raw' | 'sq8' | 'pq';

/** Props for {@link VectorStorageObservability}. */
export interface VectorStorageObservabilityProps {
  /** Compression stats (from `getCompressionStats()`). */
  stats: CompressionStatsLike;
  /** The active quantization tier. */
  tier: QuantizationTier;
  /** Last search latency in milliseconds. */
  searchLatencyMs?: number;
  /** Whether search ran on a WebGPU-accelerated distance kernel. */
  webgpuAccelerated?: boolean;
  /** Additional class names merged onto the root element. */
  className?: string;
}

const TIERS: { key: QuantizationTier; label: string; factor: string }[] = [
  { key: 'raw', label: 'Raw F32', factor: '1×' },
  { key: 'sq8', label: 'SQ8', factor: '4×' },
  { key: 'pq', label: 'PQ', factor: '8-32×' },
];

/**
 * VectorDB-specific observability that complements `StorageMeter` (quota): a
 * compression-stats badge (SQ8 ratio + before/after size, e.g. "4.0× —
 * 15KB→3.7KB"), a three-tier storage estimate (Raw Float32 / SQ8 4× / PQ 8–32×
 * with the active tier highlighted), and a GPU-aware search-latency badge
 * (accented when WebGPU-accelerated). Values derive from `getCompressionStats()`
 * and search timing, passed in as props.
 *
 * @example
 * ```tsx
 * <VectorStorageObservability stats={getCompressionStats(db)} tier="sq8" searchLatencyMs={12} />
 * ```
 */
export function VectorStorageObservability({
  stats,
  tier,
  searchLatencyMs,
  webgpuAccelerated = false,
  className,
}: VectorStorageObservabilityProps) {
  return (
    <div
      className={cn(
        'flex w-full max-w-md flex-col gap-4 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary">
          <Database className="size-3.5" aria-hidden="true" />
          {stats.ratio.toFixed(1)}× - {formatBytes(stats.originalSizeBytes)}→
          {formatBytes(stats.compressedSizeBytes)}
        </span>
        {searchLatencyMs != null && (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
              webgpuAccelerated
                ? 'border-violet-500/40 bg-violet-500/5 text-violet-600 dark:text-violet-400'
                : 'border-border bg-muted text-muted-foreground',
            )}
          >
            {webgpuAccelerated ? (
              <Zap className="size-3.5" aria-hidden="true" />
            ) : (
              <Gauge className="size-3.5" aria-hidden="true" />
            )}
            {Math.round(searchLatencyMs)}ms
            {webgpuAccelerated && ' · GPU'}
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {TIERS.map((t) => {
          const active = t.key === tier;
          return (
            <div
              key={t.key}
              className={cn(
                'flex flex-col items-center gap-0.5 rounded-lg border py-2.5 text-center',
                active
                  ? 'border-primary bg-accent'
                  : 'border-border bg-background opacity-60',
              )}
            >
              <span className="text-xs font-semibold">{t.label}</span>
              <span className="text-[11px] text-muted-foreground">{t.factor}</span>
              {active ? (
                <span className="rounded bg-primary px-1.5 text-[10px] font-medium uppercase tracking-wide text-primary-foreground">
                  Active
                </span>
              ) : (
                <span aria-hidden="true" className="text-[10px] uppercase tracking-wide">
                  &nbsp;
                </span>
              )}
            </div>
          );
        })}
      </div>

      {stats.vectorCount != null && (
        <p className="text-xs text-muted-foreground">
          {stats.vectorCount.toLocaleString()} vectors stored
        </p>
      )}
    </div>
  );
}
