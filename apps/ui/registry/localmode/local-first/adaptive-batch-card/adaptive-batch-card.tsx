'use client';

import { useState } from 'react';
import { ChevronDown, Cpu, Layers, MemoryStick, Sparkles } from 'lucide-react';

import { cn } from '@/registry/localmode/lib/utils';

/** The device profile from `useAdaptiveBatchSize`. */
export interface BatchDeviceProfile {
  /** Logical CPU cores. */
  cores: number;
  /** Device memory in GB. */
  memoryGB: number;
  /** Whether a GPU is available. */
  hasGPU: boolean;
  /** Where the profile values came from. */
  source: 'detected' | 'override' | 'fallback';
}

/** The adaptive batch result from `useAdaptiveBatchSize`. */
export interface AdaptiveBatchResult {
  /** The computed optimal batch size. */
  batchSize: number;
  /** Human-readable explanation of how the batch size was computed. */
  reasoning: string;
  /** Hardware values + their origin. */
  deviceProfile: BatchDeviceProfile;
}

/** Props for {@link AdaptiveBatchCard}. */
export interface AdaptiveBatchCardProps {
  /** The adaptive batch result (from `useAdaptiveBatchSize`). */
  result: AdaptiveBatchResult;
  /** Additional class names merged onto the root element. */
  className?: string;
}

const SOURCE_LABEL: Record<BatchDeviceProfile['source'], string> = {
  detected: 'Detected',
  override: 'Override',
  fallback: 'Estimated',
};

/**
 * Surfaces `useAdaptiveBatchSize` output: a prominent computed optimal batch
 * number, a hardware summary (cores / RAM / GPU), the detection source
 * (detected / estimated / override), and a collapsible reasoning string. Use it
 * to explain why your `embedMany`/`ingest` batch size is what it is on this
 * device.
 *
 * @example
 * ```tsx
 * <AdaptiveBatchCard result={useAdaptiveBatchSize({ taskType: 'embedding' })} />
 * ```
 */
export function AdaptiveBatchCard({ result, className }: AdaptiveBatchCardProps) {
  const [open, setOpen] = useState(false);
  const { batchSize, reasoning, deviceProfile: d } = result;

  return (
    <div
      className={cn(
        'flex w-full max-w-md flex-col gap-4 rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm',
        className,
      )}
    >
      <div className="flex items-center gap-4">
        <span className="flex size-16 min-w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-xl bg-primary/10 px-2 text-primary">
          <Layers className="size-4" aria-hidden="true" />
          <span className="text-lg font-bold leading-none tabular-nums">
            {batchSize}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Optimal batch size</p>
          <span className="inline-flex min-w-fit items-center whitespace-nowrap rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {SOURCE_LABEL[d.source]}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <Stat icon={<Cpu className="size-3.5" />} label="Cores" value={String(d.cores)} />
        <Stat
          icon={<MemoryStick className="size-3.5" />}
          label="RAM"
          value={`${d.memoryGB} GB`}
        />
        <Stat
          icon={<Sparkles className="size-3.5" />}
          label="GPU"
          value={d.hasGPU ? 'Yes' : 'No'}
        />
      </div>

      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
      >
        Reasoning
        <ChevronDown
          className={cn('size-3.5 transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>
      {open && <p className="text-xs text-muted-foreground">{reasoning}</p>}
    </div>
  );
}

/** Props for {@link AdaptiveBatchBadge}. */
export interface AdaptiveBatchBadgeProps {
  /** The adaptive batch result. */
  result: AdaptiveBatchResult;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/**
 * A compact header-badge variant of {@link AdaptiveBatchCard} (e.g. "Batch: 32")
 * with a click-to-expand device-profile popover.
 *
 * @example
 * ```tsx
 * <AdaptiveBatchBadge result={result} />
 * ```
 */
export function AdaptiveBatchBadge({ result, className }: AdaptiveBatchBadgeProps) {
  const [open, setOpen] = useState(false);
  const { batchSize, deviceProfile: d } = result;

  return (
    <div className={cn('relative inline-block', className)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-card-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <Layers className="size-3.5 text-primary" aria-hidden="true" />
        Batch: <span className="tabular-nums">{batchSize}</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 w-[min(12rem,calc(100vw-2rem))] rounded-lg border border-border bg-popover p-3 text-xs text-popover-foreground shadow-md">
          <p className="mb-1.5 font-medium">Device profile</p>
          <dl className="flex flex-col gap-1 text-muted-foreground">
            <Row label="Cores" value={String(d.cores)} />
            <Row label="RAM" value={`${d.memoryGB} GB`} />
            <Row label="GPU" value={d.hasGPU ? 'Yes' : 'No'} />
            <Row label="Source" value={SOURCE_LABEL[d.source]} />
          </dl>
        </div>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-border bg-background py-2">
      <span className="text-muted-foreground" aria-hidden="true">
        {icon}
      </span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt>{label}</dt>
      <dd className="font-medium text-foreground tabular-nums">{value}</dd>
    </div>
  );
}
