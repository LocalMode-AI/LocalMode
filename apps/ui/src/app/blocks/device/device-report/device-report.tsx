'use client';

/**
 * @file device-report.tsx
 * @description Self-sufficient zero-download device capability report — hardware, six feature flags, storage, browser/OS, a reference-model readiness verdict, and adaptive batch sizing, all from browser APIs.
 * @constraint Renders entirely from browser APIs — zero network, zero model bytes on mount.
 */

import { useSyncExternalStore } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useAdaptiveBatchSize, useCapabilities, useStorageQuota } from '@localmode/react';
import { formatBytes } from '@localmode/core';

import { DeviceBadge } from '@/components/device-badge';
import { DeviceCapabilityGrid } from '@/components/device-capability-grid';
import { BrowserCompatCard } from '@/components/browser-compat-card';
import { StorageMeter } from '@/components/storage-meter';
import { AdaptiveBatchCard } from '@/components/adaptive-batch-card';

/** Descriptive readiness label (rendered as a wrapping line above the card). */
const REFERENCE_MODEL_LABEL = 'Readiness check: 1B-parameter Q4_K_M GGUF LLM';
/**
 * Short model name for BrowserCompatCard's `modelName` slot (which truncates) —
 * the full descriptive sentence renders above the card so it never clips.
 */
const REFERENCE_MODEL_SHORT = '1B Q4_K_M GGUF LLM';
/** Approximate RAM a 1B-param Q4_K_M GGUF needs at runtime, in GB. */
const REFERENCE_REQUIRED_GB = 1.2;
/** Documented fallback when `navigator.deviceMemory` is unavailable. */
const ASSUMED_MEMORY_GB = 4;

/** Drop any unbalanced trailing `(…` fragment so a GPU label never renders dangling parens. */
function sanitizeGpuLabel(raw: string): string {
  let out = raw.trim();
  while ((out.match(/\(/g) ?? []).length > (out.match(/\)/g) ?? []).length) {
    const cut = out.replace(/\s*\([^()]*$/, '').trim();
    if (cut === out) break;
    out = cut;
  }
  return out;
}

/**
 * Shorten a raw WebGL/ANGLE GPU renderer string to a human label — e.g.
 * `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0)…)` → `SwiftShader`
 * — always returning a balanced-parenthesis token instead of the noisy raw string.
 */
function simplifyGpuName(raw: string): string {
  const renderer = raw.match(/Renderer:\s*([^,()]+)/i);
  if (renderer?.[1]) return renderer[1].trim();
  if (/SwiftShader/i.test(raw)) return 'SwiftShader';
  if (/llvmpipe/i.test(raw)) return 'llvmpipe';
  const angle = raw.match(/^ANGLE\s*\((.*)\)\s*$/i);
  if (angle?.[1]) {
    const parts = angle[1]
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    const label = (parts[1] ?? parts[0] ?? '').replace(/\bDirect3D.*$/i, '').trim();
    if (label) return sanitizeGpuLabel(label);
  }
  return sanitizeGpuLabel(raw);
}

/**
 * The self-sufficient device capability report block: badges, capability grid,
 * browser/OS line, storage meter, reference readiness verdict, and adaptive
 * batch-size guidance — all from browser APIs, nothing downloaded.
 */
/** Stable `useSyncExternalStore` args: a never-changing store that reads `false`
 * on the server and `true` on the client — a setState-free mount flag. */
const subscribeNever = () => () => {};
const getTrue = () => true;
const getFalse = () => false;

export function DeviceReportBlock() {
  const { capabilities, isDetecting, error: capabilitiesError, refresh } = useCapabilities();
  const { quota, error: quotaError, refresh: refreshQuota } = useStorageQuota();
  const batch = useAdaptiveBatchSize({ taskType: 'embedding', modelDimensions: 384 });

  // The batch computation is synchronous and reads `navigator` at call time,
  // so its server-rendered fallback would mismatch the client's detected
  // values. Gate its output behind a client mount to keep hydration clean.
  const mounted = useSyncExternalStore(subscribeNever, getTrue, getFalse);

  const error = capabilitiesError ?? quotaError;
  const status = error ? 'error' : isDetecting || !capabilities ? 'detecting' : 'ready';

  const memoryGB = capabilities?.hardware.memory ?? null;
  const gpuName = capabilities?.hardware.gpu ?? null;
  const memoryUnknown = capabilities != null && memoryGB == null;

  const browserLine = capabilities
    ? [
        `${capabilities.browser.name} v${capabilities.browser.version}`,
        `${capabilities.device.os}${capabilities.device.osVersion ? ` ${capabilities.device.osVersion}` : ''}`,
        capabilities.device.type,
      ].join(' · ')
    : null;

  const estimatedSpeed = capabilities
    ? capabilities.features.webgpu
      ? 'Fast (WebGPU available)'
      : capabilities.features.simd
        ? 'Moderate (WASM SIMD)'
        : 'Slow (plain WASM)'
    : undefined;

  const readinessWarnings = memoryUnknown
    ? [
        `Device memory is unknown (navigator.deviceMemory unavailable in this browser) - assuming ${ASSUMED_MEMORY_GB} GB, so this verdict may be conservative or optimistic.`,
      ]
    : [];

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Block-root status for the platform no-download loop. */}
      <span data-state={status} className="sr-only">
        {status}
      </span>
      {/* sr-only raw state for the E2E driver. */}
      <span aria-label="Device report status" className="sr-only">
        {status}
      </span>
      {capabilities && (
        <span aria-label="Detected capabilities" className="sr-only">
          {JSON.stringify({
            cores: capabilities.hardware.cores,
            memoryGB,
            gpu: gpuName,
            webgpu: capabilities.features.webgpu,
            wasm: capabilities.features.wasm,
            simd: capabilities.features.simd,
            threads: capabilities.features.threads,
            indexeddb: capabilities.features.indexeddb,
            webworkers: capabilities.features.webworkers,
          })}
        </span>
      )}

      {/* Header: capability badges + browser/OS identification. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <DeviceBadge capability="webgpu" />
          <DeviceBadge capability="wasm" />
          <DeviceBadge capability="storage" />
        </div>
        {browserLine && (
          <p className="text-xs text-muted-foreground">
            {browserLine}
          </p>
        )}
      </div>

      {error && (
        <div
          className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
        >
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{error.message}</span>
          <button
            type="button"
            onClick={() => {
              void refresh();
              void refreshQuota();
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-background px-2 py-1 font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <RefreshCw className="size-3" aria-hidden="true" />
            Retry
          </button>
        </div>
      )}

      <div className="grid items-start gap-4 md:grid-cols-2">
        {/* Left: hardware + six feature flags + block-level parity supplements. */}
        <div className="flex flex-col gap-2">
          <div>
            {/* The canonical browser/OS identity is the header line above; suppress
                the grid's redundant built-in browser footer (its only <p>). */}
            <DeviceCapabilityGrid className="max-w-none [&_p]:hidden" />
          </div>
          {capabilities && (
            <p className="px-1 text-xs text-muted-foreground">
              GPU:{' '}
              <span className="font-medium text-foreground">
                {gpuName ? simplifyGpuName(gpuName) : 'None'}
              </span>
            </p>
          )}
          {memoryUnknown && (
            <p
              className="flex items-start gap-1.5 px-1 text-xs text-amber-600 dark:text-amber-400"
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>
                navigator.deviceMemory is unavailable in this browser - device memory is unknown;
                the readiness check assumes {ASSUMED_MEMORY_GB} GB.
              </span>
            </p>
          )}
        </div>

        {/* Right: storage, readiness verdict, adaptive batch sizing. */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div>
              <StorageMeter
                className="max-w-none"
                quota={
                  quota ? { usedBytes: quota.usedBytes, quotaBytes: quota.quotaBytes } : undefined
                }
              />
            </div>
            {quota && (
              <p
                aria-label="Storage availability"
                data-available-bytes={quota.availableBytes}
                data-quota-bytes={quota.quotaBytes}
                className="px-1 text-xs text-muted-foreground"
              >
                <span className="font-medium text-foreground">
                  {formatBytes(quota.availableBytes)}
                </span>{' '}
                available of {formatBytes(quota.quotaBytes)} quota
                {quota.isPersisted ? ' · persisted' : ''}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            {/* Full descriptive readiness label wraps here so it never clips the
                card's truncating model-name slot. */}
            <p className="px-1 text-sm font-medium text-foreground">{REFERENCE_MODEL_LABEL}</p>
            {capabilities ? (
              <BrowserCompatCard
                className="max-w-none"
                modelName={REFERENCE_MODEL_SHORT}
                requiredGB={REFERENCE_REQUIRED_GB}
                deviceGB={memoryGB ?? ASSUMED_MEMORY_GB}
                availableStorageGB={
                  quota ? Math.round((quota.availableBytes / 1024 ** 3) * 10) / 10 : undefined
                }
                crossOriginIsolated={capabilities.features.crossOriginisolated}
                estimatedSpeed={estimatedSpeed}
                warnings={readinessWarnings}
              />
            ) : (
              <div
                role="status"
                className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground"
              >
                Checking device readiness…
              </div>
            )}
          </div>

          <div>
            {mounted ? (
              <>
                {/* The hardware triple (cores / memory / GPU) is already the
                    dedicated DeviceCapabilityGrid above; suppress the batch
                    card's redundant mini-stat row so it appears once per view. */}
                <AdaptiveBatchCard
                  className="max-w-none [&_.grid-cols-3]:hidden"
                  result={batch}
                />
                <span
                  aria-label="Adaptive batch size"
                  data-batch-size={batch.batchSize}
                  className="sr-only"
                >
                  {batch.batchSize}
                </span>
                <span aria-label="Batch sizing reasoning" className="sr-only">
                  {batch.reasoning}
                </span>
              </>
            ) : (
              <div
                role="status"
                className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground"
              >
                Computing optimal batch size…
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
