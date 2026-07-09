/**
 * @file capabilities-panel.tsx
 * @description App-chrome client panel that reports everything the retired showcase
 * device-stats showed: browser + device + hardware (cores/memory/storage/GPU) and
 * 12 on-device feature flags, sourced from @localmode/core's detectCapabilities().
 * Every stat-with-hint and every feature pill exposes a proper (radix) keyboard-
 * accessible tooltip via the ui/tooltip primitive. Styled with shadcn/ui CSS-variable
 * tokens ONLY (no daisyUI, no raw hex). Detection is client-only and SSR-safe: it runs
 * in an effect after mount and renders a stable dash-placeholder skeleton until then,
 * so it never hydration-mismatches. Nothing is measured on a server; nothing leaves
 * the device. This is app chrome (not a registry primitive), so importing @localmode/*
 * is allowed here.
 */
'use client';

import { useEffect, useState } from 'react';
import { detectCapabilities, type DeviceCapabilities } from '@localmode/core';
import {
  Gauge,
  Zap,
  Globe,
  Smartphone,
  Tablet,
  Laptop,
  Cpu,
  MemoryStick,
  HardDrive,
  Monitor,
  Info,
  CheckCircle2,
  Circle,
  Check,
} from 'lucide-react';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/registry/localmode/ui/tooltip';
import { cn } from '@/lib/utils';

/** Placeholder shown for every value before detection resolves (dash, not em-dash). */
const PENDING = '--';

/** Copy for a single feature pill: what it is, why it matters, how to turn it on. */
interface FeatureInfo {
  /** Key into DeviceCapabilities.features. */
  key: keyof DeviceCapabilities['features'];
  /** Short pill label. */
  label: string;
  /** Human-friendly feature name (bold in the tooltip). */
  name: string;
  /** One-line description. */
  description: string;
  /** Why it matters for on-device AI. */
  importance: string;
  /** How to enable it when unsupported. */
  howToEnable: string;
}

/**
 * The 12 features rendered as pills, in display order. Content is translated from the
 * retired showcase device-stats (not copied verbatim wording where adaptation helps).
 */
const FEATURES: FeatureInfo[] = [
  {
    key: 'webgpu',
    label: 'WebGPU',
    name: 'WebGPU',
    description: 'Next-gen graphics API for GPU-accelerated computing in the browser.',
    importance:
      'Enables 10-100x faster AI model inference by running computations on your GPU instead of CPU.',
    howToEnable:
      'Use Chrome 113+, Edge 113+, Safari 18+ (macOS 15+ / iOS 26+), or enable the WebGPU flag in chrome://flags.',
  },
  {
    key: 'webnn',
    label: 'WebNN',
    name: 'WebNN',
    description: 'Web Neural Network API for hardware-accelerated ML.',
    importance: 'Lets models run on dedicated NPUs/accelerators when available.',
    howToEnable: 'Chrome/Edge behind a flag; still experimental.',
  },
  {
    key: 'wasm',
    label: 'WASM',
    name: 'WebAssembly',
    description:
      'Low-level binary format for running compiled code in browsers at near-native speed.',
    importance: 'Required for running AI models efficiently. Most modern browsers support this.',
    howToEnable:
      'Update to any modern browser (Chrome, Firefox, Safari, Edge). Supported since 2017.',
  },
  {
    key: 'simd',
    label: 'SIMD',
    name: 'SIMD (Single Instruction, Multiple Data)',
    description: 'CPU instruction set for parallel data processing.',
    importance:
      'Speeds up vector operations 2-4x, crucial for embedding calculations and model inference.',
    howToEnable:
      'Use Chrome 91+, Firefox 89+, or Safari 16.4+. Older browsers may need flags enabled.',
  },
  {
    key: 'threads',
    label: 'Threads',
    name: 'Multi-Threading',
    description: 'Ability to run code in parallel across multiple CPU threads.',
    importance:
      'Allows AI workloads to utilize all CPU cores, significantly speeding up inference.',
    howToEnable:
      'Requires Cross-Origin Isolation (COI) headers. Site must serve COOP and COEP headers.',
  },
  {
    key: 'indexeddb',
    label: 'IndexedDB',
    name: 'IndexedDB',
    description: 'Browser database for storing large amounts of structured data locally.',
    importance: "Used to cache AI models locally so they don't need to be re-downloaded.",
    howToEnable:
      'Supported in all modern browsers. Check if private/incognito mode is disabled.',
  },
  {
    key: 'opfs',
    label: 'OPFS',
    name: 'Origin Private File System',
    description: 'High-performance file system API for web applications.',
    importance:
      'Provides faster file I/O than IndexedDB, ideal for large model storage and streaming.',
    howToEnable: 'Use Chrome 86+, Edge 86+, Firefox 111+, or Safari 15.2+.',
  },
  {
    key: 'webworkers',
    label: 'Workers',
    name: 'Web Workers',
    description: 'Background threads that run scripts without blocking the main UI.',
    importance:
      'Essential for running AI inference without freezing the UI. Keeps the app responsive.',
    howToEnable: 'Supported in all modern browsers since 2010.',
  },
  {
    key: 'sharedarraybuffer',
    label: 'SAB',
    name: 'SharedArrayBuffer',
    description: 'Shared memory between the main thread and workers.',
    importance:
      'Enables efficient data sharing for multi-threaded AI inference without copying data.',
    howToEnable:
      'Requires Cross-Origin Isolation. Site needs COOP: same-origin and COEP: require-corp headers.',
  },
  {
    key: 'serviceworker',
    label: 'SW',
    name: 'Service Worker',
    description: 'Background script for offline caching and network interception.',
    importance: 'Enables true offline support by caching models and app resources.',
    howToEnable: 'Supported in all modern browsers. Requires HTTPS (except localhost).',
  },
  {
    key: 'crossOriginisolated',
    label: 'COI',
    name: 'Cross-Origin Isolated',
    description: 'Security mode that enables advanced features like SharedArrayBuffer.',
    importance:
      'Required for multi-threaded WASM. Without it, AI inference runs single-threaded (slower).',
    howToEnable:
      'Server must send Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Embedder-Policy: require-corp.',
  },
  {
    key: 'chromeAI',
    label: 'Chrome AI',
    name: 'Chrome Built-in AI',
    description:
      'Browser-native AI via Gemini Nano, zero-download summarization and translation. Requires Chrome 138+ on desktop.',
    importance:
      'Instant AI inference with no model downloads, no bundle-size impact, and no API keys. Data never leaves the device.',
    howToEnable:
      'Use Chrome 138+ desktop, enable chrome://flags/#optimization-guide-on-device-model and chrome://flags/#prompt-api-for-gemini-nano, restart, and wait for the Gemini Nano model to download.',
  },
];

/** Formats a byte count as a decimal GB/MB/KB string, or "Unknown" for missing values. */
function formatBytes(bytes: number | undefined | null): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return 'Unknown';
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  if (bytes >= 1e3) return `${Math.round(bytes / 1e3)} KB`;
  return `${bytes} B`;
}

/** Returns the major version segment of a dotted version string (e.g. "138.0.1" -> "138"). */
function majorVersion(version: string | undefined): string {
  if (!version) return '';
  return version.split('.')[0] ?? '';
}

/** Picks the lucide icon for a device type. */
function deviceIcon(type: DeviceCapabilities['device']['type']) {
  if (type === 'mobile') return Smartphone;
  if (type === 'tablet') return Tablet;
  return Laptop; // desktop | unknown
}

/**
 * One bordered stat cell. When `hint` is set, an Info affordance acts as a proper radix
 * tooltip trigger (focusable, so it works with keyboard too). `detail` renders above the
 * hint inside the tooltip (used for the full, un-truncated GPU string).
 */
function StatCard({
  icon,
  label,
  value,
  hint,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  detail?: string;
}) {
  return (
    <div className="flex items-center gap-2 overflow-auto rounded-md border border-border bg-background px-3 py-2">
      <span aria-hidden="true" className="shrink-0 text-muted-foreground">
        {icon}
      </span>
      <span className="shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
      <span className="ml-auto min-w-0 truncate text-sm font-semibold tabular-nums text-foreground">
        {value}
      </span>
      {hint ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`About ${label}`}
              className="inline-flex shrink-0 cursor-help rounded text-muted-foreground/60 outline-none transition-colors hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Info className="size-3.5" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-72 p-3 text-left">
            {detail ? (
              <p className="mb-1 font-medium break-words text-background">{detail}</p>
            ) : null}
            <p className="text-background/85">{hint}</p>
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}

/**
 * One feature-support pill. The entire pill is a focusable radix tooltip trigger
 * (keyboard-accessible via tabIndex), and the tooltip carries the rich name /
 * description / importance / enablement copy.
 */
function FeaturePill({ info, supported }: { info: FeatureInfo; supported: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={cn(
            'inline-flex cursor-help items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            supported
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
              : 'border-border bg-muted text-muted-foreground',
          )}
        >
          {supported ? (
            <CheckCircle2 className="size-3" aria-hidden="true" />
          ) : (
            <Circle className="size-3 text-muted-foreground/60" aria-hidden="true" />
          )}
          {info.label}
          <span className="sr-only">{supported ? ': supported' : ': not supported'}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 space-y-1.5 p-3 text-left">
        <p className="font-semibold text-background">{info.name}</p>
        <p className="text-background/85">{info.description}</p>
        <p className="text-background/85">
          <span className="font-medium text-background">Why it matters:</span> {info.importance}
        </p>
        {supported ? (
          <p className="flex items-center gap-1 font-medium text-background">
            <Check className="size-3.5" aria-hidden="true" /> Supported in your browser
          </p>
        ) : (
          <p className="text-background/85">
            <span className="font-medium text-background">How to enable:</span> {info.howToEnable}
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Browser-Reported Capabilities + Feature Support panel.
 *
 * Section 1 shows six hardware/environment stats (browser, device, CPU cores, browser
 * memory, browser storage, GPU) from @localmode/core's detectCapabilities(); Section 2
 * shows 12 feature-support pills. Every stat-with-hint and every pill has a proper,
 * keyboard-accessible radix tooltip. Detection runs client-side after mount, so the
 * panel is SSR-safe and privacy-local: nothing is measured during render, nothing leaves
 * the device.
 */
export function CapabilitiesPanel() {
  const [caps, setCaps] = useState<DeviceCapabilities | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    detectCapabilities()
      .then((detected) => {
        if (!cancelled) setCaps(detected);
      })
      .catch(() => {
        // Detection is best-effort; keep the placeholder rather than throwing.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Derived display strings. Stable dash placeholders keep the server + first client
  // render identical (no hydration mismatch) until detection resolves.
  const browserValue = caps
    ? `${caps.browser.name} ${majorVersion(caps.browser.version)}`.trim()
    : PENDING;

  const deviceValue = caps ? `${caps.device.os} ${caps.device.osVersion}`.trim() || 'Unknown' : PENDING;
  const DeviceIcon = deviceIcon(caps?.device.type ?? 'unknown');

  const coresValue = caps ? (caps.hardware.cores > 0 ? String(caps.hardware.cores) : 'Unknown') : PENDING;

  const memoryValue = caps
    ? caps.hardware.memory != null && caps.hardware.memory > 0
      ? `${caps.hardware.memory} GB`
      : 'Unknown'
    : PENDING;

  const storageValue = caps
    ? caps.storage.quotaBytes > 0
      ? `${formatBytes(caps.storage.usedBytes)} / ${formatBytes(caps.storage.quotaBytes)} (${Math.round(
          (caps.storage.usedBytes / caps.storage.quotaBytes) * 100,
        )}%)`
      : 'Unknown'
    : PENDING;

  const gpuFull = caps?.hardware.gpu?.trim() || '';
  const gpuValue = caps ? gpuFull || 'Unknown' : PENDING;

  return (
    <TooltipProvider delayDuration={150}>
      <section
        aria-label="Browser capabilities and feature support"
        aria-busy={loading}
        className="rounded-xl border border-border bg-card p-5 sm:p-6"
      >
        {/* Section 1: Browser-Reported Capabilities */}
        <div className="flex items-center gap-2">
          <Gauge className="size-4 text-muted-foreground" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-foreground">Browser-Reported Capabilities</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Detected locally in your browser. Nothing is sent anywhere.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            icon={<Globe className="size-4" />}
            label="Browser"
            value={browserValue}
            hint="The browser and version LocalMode detected from your user agent."
          />
          <StatCard
            icon={<DeviceIcon className="size-4" />}
            label="Device"
            value={deviceValue}
            hint="Your operating system and device type, detected locally from your browser."
          />
          <StatCard
            icon={<Cpu className="size-4" />}
            label="CPU Cores"
            value={coresValue}
            hint="Number of logical CPU cores available to your browser for parallel processing."
          />
          <StatCard
            icon={<MemoryStick className="size-4" />}
            label="Browser Memory"
            value={memoryValue}
            hint="RAM allocated to your browser (not total device memory). Browsers limit this for security. Actual device RAM may be higher."
          />
          <StatCard
            icon={<HardDrive className="size-4" />}
            label="Browser Storage"
            value={storageValue}
            hint="Storage quota allocated by your browser for this site (not total disk space). Browsers typically allow 10-60% of free disk space per origin."
          />
          <StatCard
            icon={<Monitor className="size-4" />}
            label="GPU"
            value={gpuValue}
            detail={gpuFull || undefined}
            hint="Graphics processor detected by your browser. Used for WebGPU acceleration of AI models."
          />
        </div>

        {/* Section 2: Feature Support */}
        <div className="mt-6 flex items-center gap-2">
          <Zap className="size-4 text-muted-foreground" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-foreground">
            Feature Support{' '}
            <span className="font-normal text-muted-foreground">(hover for details)</span>
          </h3>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {FEATURES.map((info) => (
            <FeaturePill key={info.key} info={info} supported={!!caps?.features[info.key]} />
          ))}
        </div>
      </section>
    </TooltipProvider>
  );
}
