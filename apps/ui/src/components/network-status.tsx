'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  CheckCircle2,
  Download,
  Layers,
  Loader2,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// Network log entry — mirrors public/network-monitor.js
// ============================================================================

type RequestState = 'pending' | 'in-progress' | 'completed' | 'failed';

interface NetworkLogEntry {
  id: string;
  timestamp: Date;
  type: 'download' | 'upload';
  url: string;
  method: string;
  state: RequestState;
  category: string;
  status?: number;
  statusText?: string;
  responseSize?: number;
  duration?: number;
  progress?: number;
  error?: string;
}

declare global {
  interface Window {
    __networkMonitor?: {
      getLogs: () => NetworkLogEntry[];
      subscribe: (cb: (entry: NetworkLogEntry) => void) => () => void;
      clear: () => void;
    };
    __networkLogs?: unknown[];
  }
}

type ConnectionState = 'online' | 'offline' | 'downloading';

// ============================================================================
// Online status (useSyncExternalStore avoids hydration mismatch)
// ============================================================================

function subscribeToOnlineStatus(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function getOnlineSnapshot() {
  return navigator.onLine;
}

function getServerSnapshot() {
  return true; // Assume online during SSR — no hydration mismatch.
}

function useOnlineStatus() {
  return useSyncExternalStore(subscribeToOnlineStatus, getOnlineSnapshot, getServerSnapshot);
}

// ============================================================================
// Request grouping — collapse many raw requests into a few stable rows
// ============================================================================

interface RequestPattern {
  pattern: RegExp | string;
  label: string;
  description: string;
  category: string;
}

const REQUEST_PATTERNS: RequestPattern[] = [
  {
    pattern: '__nextjs_original-stack-frames',
    label: 'Stack Frames',
    description: 'Next.js error stack traces',
    category: 'Dev',
  },
  { pattern: '_next/static', label: 'Static Assets', description: 'Next.js JS / CSS', category: 'App' },
  { pattern: '_next/image', label: 'Images', description: 'Next.js optimized images', category: 'App' },
  { pattern: '_next/webpack-hmr', label: 'Hot Reload', description: 'Hot module replacement', category: 'Dev' },
  { pattern: '__webpack_hmr', label: 'Hot Reload', description: 'Webpack hot reload', category: 'Dev' },
  { pattern: '_rsc', label: 'Server Components', description: 'React Server Components data', category: 'App' },
  { pattern: /huggingface\.co.*\.bin$/, label: 'Model Weights', description: 'AI model binary weights', category: 'Model' },
  { pattern: /huggingface\.co.*\.json$/, label: 'Model Config', description: 'AI model configuration', category: 'Model' },
  { pattern: /huggingface\.co.*\.onnx$/, label: 'ONNX Model', description: 'ONNX runtime model', category: 'Model' },
  { pattern: /huggingface\.co.*tokenizer/, label: 'Tokenizer', description: 'Model tokenizer files', category: 'Model' },
  { pattern: /cdn-lfs.*huggingface/, label: 'Model Data', description: 'Large model files (LFS)', category: 'Model' },
  { pattern: 'huggingface.co', label: 'HuggingFace', description: 'Hugging Face resource', category: 'Model' },
  { pattern: 'storage.googleapis.com/mediapipe', label: 'MediaPipe', description: 'MediaPipe model asset', category: 'Model' },
  { pattern: '/api/', label: 'API Call', description: 'Application API request', category: 'API' },
  { pattern: '.map', label: 'Source Map', description: 'JavaScript source maps', category: 'Dev' },
  { pattern: /\.(woff2?|ttf|otf|eot)$/, label: 'Font', description: 'Web font file', category: 'Asset' },
  { pattern: /\.(png|jpg|jpeg|gif|svg|webp|ico)$/, label: 'Image', description: 'Image asset', category: 'Asset' },
];

function getRequestInfo(url: string): { label: string; description: string; groupKey: string } {
  for (const pattern of REQUEST_PATTERNS) {
    const matches =
      typeof pattern.pattern === 'string' ? url.includes(pattern.pattern) : pattern.pattern.test(url);

    if (matches) {
      const key = typeof pattern.pattern === 'string' ? pattern.pattern : pattern.label.toLowerCase();
      return {
        label: pattern.label,
        description: pattern.description,
        groupKey: `${pattern.category}:${key}`,
      };
    }
  }

  // Fallback: group by filename.
  try {
    const filename = new URL(url).pathname.split('/').pop() || 'unknown';
    return {
      label: filename.length > 20 ? `${filename.slice(0, 10)}…${filename.slice(-7)}` : filename,
      description: 'Network request',
      groupKey: `Other:${filename}`,
    };
  } catch {
    return { label: 'Request', description: 'Network request', groupKey: 'Other:unknown' };
  }
}

interface GroupedRequest {
  groupKey: string;
  label: string;
  description: string;
  category: string;
  count: number;
  latestState: RequestState;
  latestProgress?: number;
  totalSize?: number;
  downloadedSize?: number;
}

const STATE_PRIORITY: Record<RequestState, number> = {
  'in-progress': 5,
  pending: 4,
  failed: 3,
  completed: 1,
};

function groupRequests(requests: NetworkLogEntry[]): GroupedRequest[] {
  const groups = new Map<string, GroupedRequest>();

  for (const req of requests) {
    const info = getRequestInfo(req.url);

    let group = groups.get(info.groupKey);
    if (!group) {
      group = {
        groupKey: info.groupKey,
        label: info.label,
        description: info.description,
        category: info.groupKey.split(':')[0],
        count: 0,
        latestState: req.state,
      };
      groups.set(info.groupKey, group);
    }

    group.count += 1;

    if (STATE_PRIORITY[req.state] > STATE_PRIORITY[group.latestState]) {
      group.latestState = req.state;
    }

    if (req.state === 'in-progress' && req.progress !== undefined) {
      group.latestProgress = req.progress;
    }

    if (req.responseSize) {
      group.totalSize = (group.totalSize ?? 0) + req.responseSize;
      if (req.progress !== undefined) {
        group.downloadedSize = (group.downloadedSize ?? 0) + (req.responseSize * req.progress) / 100;
      }
    }
  }

  return Array.from(groups.values()).sort((a, b) => {
    const byState = STATE_PRIORITY[b.latestState] - STATE_PRIORITY[a.latestState];
    return byState !== 0 ? byState : b.count - a.count;
  });
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// ============================================================================
// Component
// ============================================================================

export function NetworkStatus() {
  const isOnline = useOnlineStatus();
  const [activeRequests, setActiveRequests] = useState<Map<string, NetworkLogEntry>>(new Map());
  const [recentRequests, setRecentRequests] = useState<NetworkLogEntry[]>([]);

  const processEntry = useCallback((entry: NetworkLogEntry) => {
    setActiveRequests((prev) => {
      const next = new Map(prev);
      if (entry.state === 'pending' || entry.state === 'in-progress') {
        next.set(entry.id, entry);
      } else {
        next.delete(entry.id);
      }
      return next;
    });

    setRecentRequests((prev) => {
      const index = prev.findIndex((p) => p.id === entry.id);
      if (index !== -1) {
        const next = [...prev];
        next[index] = entry;
        return next;
      }
      return [entry, ...prev].slice(0, 100);
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.__networkMonitor) return;
    const monitor = window.__networkMonitor;
    let cancelled = false;

    // Backfill anything captured before React mounted. Deferred to a microtask
    // so the effect body itself performs no synchronous state updates.
    queueMicrotask(() => {
      if (cancelled) return;
      for (const entry of monitor.getLogs()) processEntry(entry);
    });

    const unsubscribe = monitor.subscribe(processEntry);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [processEntry]);

  const groupedRequests = useMemo(() => groupRequests(recentRequests), [recentRequests]);

  const activeCount = activeRequests.size;
  const isDownloading = activeCount > 0;

  const connectionState: ConnectionState = !isOnline
    ? 'offline'
    : isDownloading
      ? 'downloading'
      : 'online';

  const avgProgress = useMemo(() => {
    const values = Array.from(activeRequests.values())
      .map((r) => r.progress)
      .filter((p): p is number => p !== undefined);
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : undefined;
  }, [activeRequests]);

  const pillLabel =
    connectionState === 'offline'
      ? 'Offline'
      : connectionState === 'downloading'
        ? `Downloading ${activeCount}${avgProgress !== undefined ? ` (${Math.round(avgProgress)}%)` : ''}`
        : 'Ready';

  const config = {
    online: {
      dotClass: 'bg-emerald-500',
      containerClass: 'bg-card border-border text-muted-foreground',
      icon: <Wifi className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />,
      bannerClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      bannerDot: 'bg-emerald-500',
      bannerText: 'Connected - models run on-device',
    },
    offline: {
      dotClass: 'bg-red-500',
      containerClass: 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400',
      icon: <WifiOff className="h-3.5 w-3.5 text-red-500" aria-hidden="true" />,
      bannerClass: 'bg-red-500/10 text-red-600 dark:text-red-400',
      bannerDot: 'bg-red-500',
      bannerText: 'Offline — cached models still work',
    },
    downloading: {
      dotClass: 'bg-blue-500 animate-pulse',
      containerClass: 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400',
      icon: <Download className="h-3.5 w-3.5 animate-bounce text-blue-500" aria-hidden="true" />,
      bannerClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
      bannerDot: 'bg-blue-500 animate-pulse',
      bannerText: `${activeCount} active request${activeCount === 1 ? '' : 's'} in progress`,
    },
  }[connectionState];

  return (
    <div className="group relative inline-block">
      {/* Trigger pill — focusable + hoverable */}
      <div
        role="button"
        tabIndex={0}
        aria-label={`Network activity: ${pillLabel}. ${recentRequests.length} recent requests.`}
        aria-haspopup="true"
        className={cn(
          'flex cursor-help select-none items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors duration-300',
          'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          config.containerClass
        )}
      >
        <span
          className={cn('h-2 w-2 rounded-full transition-colors duration-300', config.dotClass)}
          aria-hidden="true"
        />
        <span>{pillLabel}</span>
      </div>

      {/* Dropdown — revealed on hover or keyboard focus */}
      <div
        role="status"
        aria-live="polite"
        className={cn(
          'invisible absolute left-1/2 top-full z-50 mt-2 w-96 max-w-[calc(100vw-2rem)] -translate-x-1/2 origin-top overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground opacity-0 shadow-2xl transition-all duration-200',
          'group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Network activity
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground/80">
              {recentRequests.length} requests
            </span>
            {config.icon}
          </div>
        </div>

        {/* Connection banner */}
        <div className={cn('flex items-center gap-2 border-b border-border px-3 py-2 text-xs', config.bannerClass)}>
          <span className={cn('h-1.5 w-1.5 rounded-full', config.bannerDot)} aria-hidden="true" />
          <span>{config.bannerText}</span>
        </div>

        {/* Grouped request list */}
        <div className="max-h-72 space-y-1 overflow-y-auto p-2">
          {groupedRequests.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground/80">
              No recent network activity
            </div>
          ) : (
            groupedRequests.map((group) => {
              const isActive =
                group.latestState === 'in-progress' || group.latestState === 'pending';
              return (
                <div
                  key={group.groupKey}
                  className={cn(
                    'rounded-lg p-2.5 text-xs transition-colors',
                    group.latestState === 'in-progress'
                      ? 'border border-blue-500/20 bg-blue-500/5'
                      : group.latestState === 'pending'
                        ? 'border border-amber-500/20 bg-amber-500/5'
                        : group.latestState === 'failed'
                          ? 'border border-red-500/20 bg-red-500/5'
                          : 'hover:bg-muted/60'
                  )}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <StatusIcon state={group.latestState} />
                      <span className="truncate font-medium text-foreground" title={group.description}>
                        {group.label}
                      </span>
                      {group.count > 1 && (
                        <span className="flex shrink-0 items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                          <Layers className="h-2.5 w-2.5" aria-hidden="true" />
                          {group.count}
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {group.category}
                    </span>
                  </div>

                  <div className="ml-5 text-[10px] text-muted-foreground/70">{group.description}</div>

                  {isActive && group.latestProgress !== undefined && (
                    <div className="ml-5 mt-2">
                      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-blue-500 transition-all duration-300 ease-out"
                          style={{ width: `${group.latestProgress}%` }}
                        />
                      </div>
                      {group.totalSize && (
                        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground/80">
                          <span>{Math.round(group.latestProgress)}%</span>
                          <span>
                            {formatBytes(group.downloadedSize ?? 0)} / {formatBytes(group.totalSize)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between border-t border-border bg-muted/40 px-3 py-2 text-[10px] text-muted-foreground/80">
          <span>
            {groupedRequests.length} group{groupedRequests.length === 1 ? '' : 's'}
          </span>
          <span>{recentRequests.length} total requests</span>
        </div>
      </div>
    </div>
  );
}

function StatusIcon({ state }: { state: RequestState }) {
  switch (state) {
    case 'pending':
      return <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-amber-500" aria-hidden="true" />;
    case 'in-progress':
      return <Download className="h-3.5 w-3.5 shrink-0 animate-pulse text-blue-500" aria-hidden="true" />;
    case 'completed':
      return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden="true" />;
    case 'failed':
      return <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" aria-hidden="true" />;
    default:
      return <Wifi className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />;
  }
}
