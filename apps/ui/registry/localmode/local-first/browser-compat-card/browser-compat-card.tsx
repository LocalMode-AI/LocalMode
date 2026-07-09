'use client';

import { AlertTriangle, CheckCircle2, Cpu, HardDrive, XCircle } from 'lucide-react';

import { cn } from '@/registry/localmode/lib/utils';

/** Props for {@link RAMUsageBar}. */
export interface RAMUsageBarProps {
  /** Memory the model needs, in GB. */
  requiredGB: number;
  /** Memory the device has, in GB. */
  deviceGB: number;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/**
 * A pass/fail RAM-headroom bar: the model's memory requirement against the
 * device's RAM. Independently usable. The bar turns destructive and reports
 * "exceeds" when the requirement is larger than available memory.
 *
 * @example
 * ```tsx
 * <RAMUsageBar requiredGB={4} deviceGB={8} />
 * ```
 */
export function RAMUsageBar({ requiredGB, deviceGB, className }: RAMUsageBarProps) {
  const fits = deviceGB >= requiredGB;
  const fraction =
    deviceGB > 0 ? Math.max(0, Math.min(1, requiredGB / deviceGB)) : 1;
  const percent = Math.round(fraction * 100);

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium">
          <Cpu className="size-3.5" aria-hidden="true" />
          Memory
        </span>
        <span
          className={cn(
            'tabular-nums',
            fits ? 'text-muted-foreground' : 'text-destructive',
          )}
        >
          {requiredGB} GB / {deviceGB} GB {fits ? 'fits' : 'exceeds'}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="relative h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300',
            fits ? 'bg-emerald-500' : 'bg-destructive',
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/** Props for {@link BrowserCompatCard}. */
export interface BrowserCompatCardProps {
  /** Model display name. */
  modelName: string;
  /** Model memory requirement, in GB. */
  requiredGB: number;
  /** Device RAM, in GB. */
  deviceGB: number;
  /** Available origin storage, in GB. */
  availableStorageGB?: number;
  /** Whether the runtime is cross-origin isolated (multi-thread WASM). */
  crossOriginIsolated?: boolean;
  /** Estimated inference speed label (e.g. "Fast", "~20 tok/s"). */
  estimatedSpeed?: string;
  /** Warnings/recommendations explaining a fail or caveat. */
  warnings?: string[];
  /**
   * Whether the model can run on this device. When omitted, derived as
   * `deviceGB >= requiredGB`.
   */
  canRun?: boolean;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/**
 * A per-model runnability report for the current device — the feasibility check
 * you want *before* a multi-GB download. Combines a {@link RAMUsageBar}
 * (model RAM vs device RAM), available storage, threading (cross-origin
 * isolation) status, estimated speed, and a warnings list. A `canRun` boolean
 * gates a success vs error header. Extends the spirit of `CapabilityGate`.
 *
 * @example
 * ```tsx
 * <BrowserCompatCard modelName="Llama 3 8B" requiredGB={6} deviceGB={8} />
 * ```
 */
export function BrowserCompatCard({
  modelName,
  requiredGB,
  deviceGB,
  availableStorageGB,
  crossOriginIsolated,
  estimatedSpeed,
  warnings = [],
  canRun,
  className,
}: BrowserCompatCardProps) {
  const runnable = canRun ?? deviceGB >= requiredGB;

  return (
    <div
      className={cn(
        '@container flex w-full max-w-md flex-col gap-4 rounded-xl border bg-card p-5 text-card-foreground shadow-sm',
        runnable ? 'border-border' : 'border-destructive/40',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {runnable ? (
          <CheckCircle2 className="size-5 shrink-0 text-emerald-500" aria-hidden="true" />
        ) : (
          <XCircle className="size-5 shrink-0 text-destructive" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{modelName}</p>
          <p
            className={cn(
              'text-xs',
              runnable ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive',
            )}
          >
            {runnable ? 'Can run on this device' : 'Cannot run on this device'}
          </p>
        </div>
      </div>

      <RAMUsageBar requiredGB={requiredGB} deviceGB={deviceGB} />

      <dl className="grid grid-cols-1 gap-2 text-xs @sm:grid-cols-2">
        {availableStorageGB != null && (
          <div className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-border bg-background px-2.5 py-1.5">
            <dt className="flex items-center gap-1.5 font-medium">
              <HardDrive className="size-3.5 shrink-0" aria-hidden="true" />
              Storage
            </dt>
            <dd className="shrink-0 whitespace-nowrap tabular-nums text-muted-foreground">
              {availableStorageGB} GB free
            </dd>
          </div>
        )}
        {crossOriginIsolated != null && (
          <div className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-border bg-background px-2.5 py-1.5">
            <dt className="font-medium">Threads</dt>
            <dd className="shrink-0 whitespace-nowrap text-muted-foreground">
              {crossOriginIsolated ? 'Multi-thread' : 'Single-thread'}
            </dd>
          </div>
        )}
        {estimatedSpeed && (
          <div className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-border bg-background px-2.5 py-1.5">
            <dt className="font-medium">Speed</dt>
            <dd className="shrink-0 whitespace-nowrap text-muted-foreground">{estimatedSpeed}</dd>
          </div>
        )}
      </dl>

      {warnings.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {warnings.map((w, i) => (
            <li
              key={i}
              className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400"
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
