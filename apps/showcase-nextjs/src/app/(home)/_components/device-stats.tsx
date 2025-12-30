'use client';

import { useEffect, useState } from 'react';
import {
  Monitor,
  Cpu,
  HardDrive,
  Globe,
  CheckCircle,
  XCircle,
  Loader2,
  MemoryStick,
  Smartphone,
  Tablet,
  Laptop,
  Info,
} from 'lucide-react';
import { detectCapabilities, type DeviceCapabilities } from '@localmode/core';
import { formatBytes } from '../_lib/utils';

const FEATURE_INFO: Record<
  string,
  { name: string; description: string; importance: string; howToEnable?: string }
> = {
  WebGPU: {
    name: 'WebGPU',
    description: 'Next-gen graphics API for GPU-accelerated computing in the browser.',
    importance:
      'Enables 10-100x faster AI model inference by running computations on your GPU instead of CPU.',
    howToEnable:
      'Use Chrome 113+, Edge 113+, or enable "WebGPU" flag in chrome://flags. Safari support is experimental.',
  },
  WASM: {
    name: 'WebAssembly',
    description:
      'Low-level binary format for running compiled code in browsers at near-native speed.',
    importance: 'Required for running AI models efficiently. Most modern browsers support this.',
    howToEnable:
      'Update to any modern browser (Chrome, Firefox, Safari, Edge). Supported since 2017.',
  },
  SIMD: {
    name: 'SIMD (Single Instruction, Multiple Data)',
    description: 'CPU instruction set for parallel data processing.',
    importance:
      'Speeds up vector operations 2-4x, crucial for embedding calculations and model inference.',
    howToEnable:
      'Use Chrome 91+, Firefox 89+, or Safari 16.4+. Older browsers may need flags enabled.',
  },
  Threads: {
    name: 'Multi-Threading',
    description: 'Ability to run code in parallel across multiple CPU threads.',
    importance:
      'Allows AI workloads to utilize all CPU cores, significantly speeding up inference.',
    howToEnable:
      'Requires Cross-Origin Isolation (COI) headers. Site must serve COOP and COEP headers.',
  },
  IndexedDB: {
    name: 'IndexedDB',
    description: 'Browser database for storing large amounts of structured data locally.',
    importance: "Used to cache AI models locally so they don't need to be re-downloaded.",
    howToEnable: 'Supported in all modern browsers. Check if private/incognito mode is disabled.',
  },
  OPFS: {
    name: 'Origin Private File System',
    description: 'High-performance file system API for web applications.',
    importance:
      'Provides faster file I/O than IndexedDB, ideal for large model storage and streaming.',
    howToEnable: 'Use Chrome 86+, Edge 86+, Firefox 111+, or Safari 15.2+.',
  },
  Workers: {
    name: 'Web Workers',
    description: 'Background threads that run scripts without blocking the main UI.',
    importance: 'Essential for running AI inference without freezing the UI. Keeps app responsive.',
    howToEnable: 'Supported in all modern browsers since 2010.',
  },
  SAB: {
    name: 'SharedArrayBuffer',
    description: 'Shared memory between the main thread and workers.',
    importance:
      'Enables efficient data sharing for multi-threaded AI inference without copying data.',
    howToEnable:
      'Requires Cross-Origin Isolation. Site needs COOP: same-origin and COEP: require-corp headers.',
  },
  SW: {
    name: 'Service Worker',
    description: 'Background script for offline caching and network interception.',
    importance: 'Enables true offline support by caching models and app resources.',
    howToEnable: 'Supported in all modern browsers. Requires HTTPS (except localhost).',
  },
  COI: {
    name: 'Cross-Origin Isolated',
    description: 'Security mode that enables advanced features like SharedArrayBuffer.',
    importance:
      'Required for multi-threaded WASM. Without it, AI inference runs single-threaded (slower).',
    howToEnable:
      'Server must send headers: Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Embedder-Policy: require-corp.',
  },
};

function FeatureIndicator({ supported, label }: { supported: boolean; label: string }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const info = FEATURE_INFO[label];

  return (
    <div
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div
        className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono font-bold cursor-help transition-all ${
          supported
            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
            : 'bg-red-500/10 text-red-400/60 border border-red-500/10 hover:bg-red-500/20'
        }`}
      >
        {supported ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
        {label}
        <Info className="w-2.5 h-2.5 opacity-50" />
      </div>

      {showTooltip && info && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-3 bg-poster-bg border border-poster-border rounded-lg shadow-xl text-left animate-in fade-in zoom-in-95 duration-150">
          <div className="text-xs font-bold text-poster-text-main mb-1">{info.name}</div>
          <p className="text-[11px] text-poster-text-sub/80 mb-2">{info.description}</p>

          <div className="text-[10px] font-semibold text-poster-accent-teal mb-0.5">
            Why it matters:
          </div>
          <p className="text-[10px] text-poster-text-sub/70 mb-2">{info.importance}</p>

          {!supported && info.howToEnable && (
            <>
              <div className="text-[10px] font-semibold text-poster-accent-orange mb-0.5">
                How to enable:
              </div>
              <p className="text-[10px] text-poster-text-sub/70">{info.howToEnable}</p>
            </>
          )}

          {supported && (
            <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
              <CheckCircle className="w-3 h-3" />
              Supported in your browser
            </div>
          )}

          <div
            className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0"
            style={{
              borderLeft: '8px solid transparent',
              borderRight: '8px solid transparent',
              borderTop: '8px solid var(--poster-border, #333)',
            }}
          />
          <div
            className="absolute top-full left-1/2 -translate-x-1/2 -mt-px w-0 h-0"
            style={{
              borderLeft: '7px solid transparent',
              borderRight: '7px solid transparent',
              borderTop: '7px solid var(--poster-bg, #1a1a1a)',
            }}
          />
        </div>
      )}
    </div>
  );
}

function StatBadge({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => hint && setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div className="flex items-center gap-2 bg-poster-surface px-3 py-1.5 rounded border border-white/5 group cursor-default">
        <span className="text-poster-text-sub/60">{icon}</span>
        <span className="text-[10px] font-mono text-poster-text-sub/60">{label}:</span>
        <span className="text-[10px] font-mono font-bold text-poster-text-sub/80">{value}</span>
        {hint && (
          <Info className="w-3 h-3 text-poster-text-sub/30 group-hover:text-poster-text-sub/60 transition-colors" />
        )}
      </div>

      {showTooltip && hint && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2.5 bg-poster-bg border border-poster-border rounded-lg shadow-xl text-left animate-in fade-in zoom-in-95 duration-150">
          <p className="text-[11px] text-poster-text-sub/80 leading-relaxed">{hint}</p>
          <div
            className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0"
            style={{
              borderLeft: '8px solid transparent',
              borderRight: '8px solid transparent',
              borderTop: '8px solid var(--poster-border, #333)',
            }}
          />
          <div
            className="absolute top-full left-1/2 -translate-x-1/2 -mt-px w-0 h-0"
            style={{
              borderLeft: '7px solid transparent',
              borderRight: '7px solid transparent',
              borderTop: '7px solid var(--poster-bg, #1a1a1a)',
            }}
          />
        </div>
      )}
    </div>
  );
}

function getDeviceIcon(type: string) {
  switch (type) {
    case 'mobile':
      return <Smartphone className="w-3.5 h-3.5" />;
    case 'tablet':
      return <Tablet className="w-3.5 h-3.5" />;
    default:
      return <Laptop className="w-3.5 h-3.5" />;
  }
}

export function DeviceStats() {
  const [capabilities, setCapabilities] = useState<DeviceCapabilities | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    detectCapabilities()
      .then(setCapabilities)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 text-poster-text-sub/40">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-xs font-mono">Detecting capabilities...</span>
      </div>
    );
  }

  if (!capabilities) {
    return null;
  }

  const { browser, device, hardware, features, storage } = capabilities;

  const storageUsedPercent =
    storage.quotaBytes > 0 ? Math.round((storage.usedBytes / storage.quotaBytes) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="text-center mb-1">
        <span className="text-[10px] font-mono text-poster-text-sub/40 uppercase tracking-wider">
          Browser-Reported Capabilities
        </span>
      </div>
      <div className="flex flex-wrap gap-2 justify-center">
        <StatBadge
          icon={<Globe className="w-3.5 h-3.5" />}
          label="Browser"
          value={`${browser.name} ${browser.version.split('.')[0]}`}
        />
        <StatBadge
          icon={getDeviceIcon(device.type)}
          label="Device"
          value={`${device.os} ${device.osVersion}`}
        />
        <StatBadge
          icon={<Cpu className="w-3.5 h-3.5" />}
          label="Cores"
          value={`${hardware.cores}`}
          hint="Number of logical CPU cores available to your browser for parallel processing."
        />
        {hardware.memory && (
          <StatBadge
            icon={<MemoryStick className="w-3.5 h-3.5" />}
            label="Browser Memory"
            value={`${hardware.memory} GB`}
            hint="RAM allocated to your browser (not total device memory). Browsers limit this for security. Actual device RAM may be higher."
          />
        )}
        <StatBadge
          icon={<HardDrive className="w-3.5 h-3.5" />}
          label="Browser Storage"
          value={`${formatBytes(storage.usedBytes)} / ${formatBytes(storage.quotaBytes)} (${storageUsedPercent}%)`}
          hint="Storage quota allocated by your browser for this site (not total disk space). Browsers typically allow 10-60% of free disk space per origin."
        />
        {hardware.gpu && (
          <StatBadge
            icon={<Monitor className="w-3.5 h-3.5" />}
            label="GPU"
            value={hardware.gpu.length > 30 ? hardware.gpu.substring(0, 30) + '...' : hardware.gpu}
            hint="Graphics processor detected by your browser. Used for WebGPU acceleration of AI models."
          />
        )}
      </div>

      <div className="text-center mb-1">
        <span className="text-[10px] font-mono text-poster-text-sub/40 uppercase tracking-wider">
          Feature Support (hover for details)
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5 justify-center">
        <FeatureIndicator supported={features.webgpu} label="WebGPU" />
        <FeatureIndicator supported={features.wasm} label="WASM" />
        <FeatureIndicator supported={features.simd} label="SIMD" />
        <FeatureIndicator supported={features.threads} label="Threads" />
        <FeatureIndicator supported={features.indexeddb} label="IndexedDB" />
        <FeatureIndicator supported={features.opfs} label="OPFS" />
        <FeatureIndicator supported={features.webworkers} label="Workers" />
        <FeatureIndicator supported={features.sharedarraybuffer} label="SAB" />
        <FeatureIndicator supported={features.serviceworker} label="SW" />
        <FeatureIndicator supported={features.crossOriginisolated} label="COI" />
      </div>
    </div>
  );
}
