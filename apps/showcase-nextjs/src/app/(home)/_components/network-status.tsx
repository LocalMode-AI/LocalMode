'use client';

import { useEffect, useState, useMemo, useSyncExternalStore, useCallback } from 'react';
import { cn } from '../_lib/utils';
import { Wifi, WifiOff, Loader2, CheckCircle2, XCircle, Download, Layers } from 'lucide-react';

// ============================================================================
// Network Log Entry Type (matches the inline script)
// ============================================================================

interface NetworkLogEntry {
  id: string;
  timestamp: Date;
  type: 'download' | 'upload';
  url: string;
  method: string;
  state: 'pending' | 'in-progress' | 'completed' | 'failed' | 'aborted';
  category: string;
  status?: number;
  statusText?: string;
  responseSize?: number;
  duration?: number;
  progress?: number;
  error?: string;
}

// Window type augmentation for the network monitor
declare global {
  interface Window {
    __networkMonitor?: {
      getLogs: () => NetworkLogEntry[];
      subscribe: (cb: (entry: NetworkLogEntry) => void) => () => void;
      clear: () => void;
    };
    __networkLogs?: NetworkLogEntry[];
  }
}

// ============================================================================
// Online Status Hook (avoids hydration issues)
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
  return true; // Always assume online on server
}

function useOnlineStatus() {
  return useSyncExternalStore(subscribeToOnlineStatus, getOnlineSnapshot, getServerSnapshot);
}

type ConnectionState = 'online' | 'offline' | 'downloading';

// ============================================================================
// Request Pattern Definitions
// ============================================================================

interface RequestPattern {
  pattern: RegExp | string;
  label: string;
  description: string;
  category: string;
}

const REQUEST_PATTERNS: RequestPattern[] = [
  // Next.js Development
  {
    pattern: '__nextjs_original-stack-frames',
    label: 'Stack Frames',
    description: 'Next.js error stack traces',
    category: 'Dev',
  },
  {
    pattern: '_next/static',
    label: 'Static Assets',
    description: 'Next.js static files (JS, CSS)',
    category: 'App',
  },
  {
    pattern: '_next/image',
    label: 'Images',
    description: 'Next.js optimized images',
    category: 'App',
  },
  {
    pattern: '_next/webpack-hmr',
    label: 'Hot Reload',
    description: 'Next.js hot module replacement',
    category: 'Dev',
  },
  {
    pattern: '__webpack_hmr',
    label: 'Hot Reload',
    description: 'Webpack hot module replacement',
    category: 'Dev',
  },
  {
    pattern: '_rsc',
    label: 'Server Components',
    description: 'React Server Components data',
    category: 'App',
  },
  // Hugging Face Models
  {
    pattern: /huggingface\.co.*\.bin$/,
    label: 'Model Weights',
    description: 'AI model binary weights',
    category: 'Model',
  },
  {
    pattern: /huggingface\.co.*\.json$/,
    label: 'Model Config',
    description: 'AI model configuration',
    category: 'Model',
  },
  {
    pattern: /huggingface\.co.*\.onnx$/,
    label: 'ONNX Model',
    description: 'ONNX runtime model',
    category: 'Model',
  },
  {
    pattern: /huggingface\.co.*tokenizer/,
    label: 'Tokenizer',
    description: 'Model tokenizer files',
    category: 'Model',
  },
  {
    pattern: /cdn-lfs.*huggingface/,
    label: 'Model Data',
    description: 'Large model files (LFS)',
    category: 'Model',
  },
  {
    pattern: 'huggingface.co',
    label: 'HuggingFace',
    description: 'Hugging Face resource',
    category: 'Model',
  },
  // API calls
  {
    pattern: '/api/',
    label: 'API Call',
    description: 'Application API request',
    category: 'API',
  },
  // Source maps
  {
    pattern: '.map',
    label: 'Source Map',
    description: 'JavaScript source maps',
    category: 'Dev',
  },
  // Fonts
  {
    pattern: /\.(woff2?|ttf|otf|eot)$/,
    label: 'Font',
    description: 'Web font file',
    category: 'Asset',
  },
  // Images
  {
    pattern: /\.(png|jpg|jpeg|gif|svg|webp|ico)$/,
    label: 'Image',
    description: 'Image asset',
    category: 'Asset',
  },
];

function getRequestInfo(url: string): { label: string; description: string; groupKey: string } {
  for (const pattern of REQUEST_PATTERNS) {
    const matches =
      typeof pattern.pattern === 'string'
        ? url.includes(pattern.pattern)
        : pattern.pattern.test(url);

    if (matches) {
      // Create a group key based on the pattern
      const groupKey =
        typeof pattern.pattern === 'string' ? pattern.pattern : pattern.label.toLowerCase();
      return {
        label: pattern.label,
        description: pattern.description,
        groupKey: `${pattern.category}:${groupKey}`,
      };
    }
  }

  // Default: use the filename as group key
  try {
    const urlObj = new URL(url);
    const filename = urlObj.pathname.split('/').pop() || 'unknown';
    return {
      label: filename.length > 20 ? filename.slice(0, 10) + '...' + filename.slice(-7) : filename,
      description: 'Network request',
      groupKey: `other:${filename}`,
    };
  } catch {
    return {
      label: 'Request',
      description: 'Network request',
      groupKey: 'other:unknown',
    };
  }
}

// ============================================================================
// Grouped Request Type
// ============================================================================

interface GroupedRequest {
  groupKey: string;
  label: string;
  description: string;
  count: number;
  requests: NetworkLogEntry[];
  latestState: NetworkLogEntry['state'];
  latestProgress?: number;
  totalSize?: number;
  downloadedSize?: number;
}

function groupRequests(requests: NetworkLogEntry[]): GroupedRequest[] {
  const groups = new Map<string, GroupedRequest>();

  for (const req of requests) {
    const info = getRequestInfo(req.url);

    if (!groups.has(info.groupKey)) {
      groups.set(info.groupKey, {
        groupKey: info.groupKey,
        label: info.label,
        description: info.description,
        count: 0,
        requests: [],
        latestState: req.state,
      });
    }

    const group = groups.get(info.groupKey)!;
    group.count++;
    group.requests.push(req);

    // Update state to the most "active" state
    const statePriority: Record<NetworkLogEntry['state'], number> = {
      'in-progress': 5,
      pending: 4,
      failed: 3,
      aborted: 2,
      completed: 1,
    };
    if (statePriority[req.state] > statePriority[group.latestState]) {
      group.latestState = req.state;
    }

    // Aggregate progress for in-progress requests
    if (req.state === 'in-progress' && req.progress !== undefined) {
      group.latestProgress = req.progress;
    }

    // Aggregate sizes
    if (req.responseSize) {
      group.totalSize = (group.totalSize || 0) + req.responseSize;
      if (req.progress !== undefined) {
        group.downloadedSize =
          (group.downloadedSize || 0) + (req.responseSize * req.progress) / 100;
      }
    }
  }

  // Sort by state priority (active first) then by count
  return Array.from(groups.values()).sort((a, b) => {
    const statePriority: Record<NetworkLogEntry['state'], number> = {
      'in-progress': 5,
      pending: 4,
      failed: 3,
      aborted: 2,
      completed: 1,
    };
    const stateCompare = statePriority[b.latestState] - statePriority[a.latestState];
    if (stateCompare !== 0) return stateCompare;
    return b.count - a.count;
  });
}

// ============================================================================
// Component
// ============================================================================

export function NetworkStatus() {
  // Use useSyncExternalStore to properly track online status without hydration issues
  const isOnline = useOnlineStatus();
  const [activeRequests, setActiveRequests] = useState<Map<string, NetworkLogEntry>>(new Map());
  const [recentRequests, setRecentRequests] = useState<NetworkLogEntry[]>([]);

  // Process an entry update
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

    // Update recent requests (keep last 100)
    setRecentRequests((prev) => {
      const index = prev.findIndex((p) => p.id === entry.id);
      if (index !== -1) {
        const newRecent = [...prev];
        newRecent[index] = entry;
        return newRecent;
      }
      return [entry, ...prev].slice(0, 100);
    });
  }, []);

  // Subscribe to network requests from the inline script
  useEffect(() => {
    // Load existing logs that were captured before React mounted
    if (typeof window !== 'undefined' && window.__networkMonitor) {
      const existingLogs = window.__networkMonitor.getLogs();
      // Process existing logs in reverse order (oldest first) to maintain order
      existingLogs.forEach((entry) => {
        processEntry(entry);
      });

      // Subscribe to new logs
      const unsubscribe = window.__networkMonitor.subscribe(processEntry);
      return () => unsubscribe();
    }
  }, [processEntry]);

  // Group requests for display
  const groupedRequests = useMemo(() => groupRequests(recentRequests), [recentRequests]);

  const activeCount = activeRequests.size;
  const isDownloading = activeCount > 0;

  // Determine connection state
  const connectionState: ConnectionState = !isOnline
    ? 'offline'
    : isDownloading
      ? 'downloading'
      : 'online';

  // Calculate total progress if available
  const progressValues = Array.from(activeRequests.values())
    .map((r) => r.progress)
    .filter((p): p is number => p !== undefined);

  const avgProgress =
    progressValues.length > 0
      ? progressValues.reduce((a, b) => a + b, 0) / progressValues.length
      : undefined;

  // Status config based on connection state
  const statusConfig = {
    online: {
      dotClass: 'bg-emerald-500',
      containerClass: 'bg-poster-surface/50 border-poster-border/30 text-poster-text-sub/90',
      label: 'System Ready',
      icon: <Wifi className="w-3.5 h-3.5 text-emerald-500" />,
    },
    offline: {
      dotClass: 'bg-red-500',
      containerClass: 'bg-red-500/10 border-red-500/30 text-red-400',
      label: 'Offline Mode',
      icon: <WifiOff className="w-3.5 h-3.5 text-red-500" />,
    },
    downloading: {
      dotClass: 'bg-blue-500 animate-pulse',
      containerClass: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
      label: `Active: ${activeCount}${avgProgress !== undefined ? ` (${Math.round(avgProgress)}%)` : ''}`,
      icon: <Download className="w-3.5 h-3.5 text-blue-500 animate-bounce" />,
    },
  };

  const config = statusConfig[connectionState];

  return (
    <div className="relative group cursor-help">
      <div
        className={cn(
          'flex items-center gap-2 px-4 py-1.5 rounded-full border transition-colors duration-300',
          config.containerClass
        )}
      >
        <span
          className={cn('w-2 h-2 rounded-full transition-colors duration-300', config.dotClass)}
        />

        <span className="text-sm font-medium">{config.label}</span>
      </div>

      {/* Hover Dropdown */}
      <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-96 bg-poster-bg border border-poster-border/50 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 transform origin-top overflow-hidden z-100">
        {/* Header */}
        <div className="p-3 border-b border-poster-border/10 bg-poster-surface/30 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-poster-text-sub">
            Network Activity
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-poster-text-sub/50">
              {recentRequests.length} requests
            </span>
            {config.icon}
          </div>
        </div>

        {/* Connection Status Banner */}
        <div
          className={cn(
            'px-3 py-2 text-xs flex items-center gap-2 border-b border-poster-border/10',
            connectionState === 'offline'
              ? 'bg-red-500/10 text-red-400'
              : connectionState === 'downloading'
                ? 'bg-blue-500/10 text-blue-400'
                : 'bg-emerald-500/10 text-emerald-400'
          )}
        >
          <span
            className={cn(
              'w-1.5 h-1.5 rounded-full',
              connectionState === 'offline'
                ? 'bg-red-500'
                : connectionState === 'downloading'
                  ? 'bg-blue-500 animate-pulse'
                  : 'bg-emerald-500'
            )}
          />
          <span>
            {connectionState === 'offline'
              ? 'App currently running in offline mode'
              : connectionState === 'downloading'
                ? `${activeCount} active request${activeCount > 1 ? 's' : ''} in progress`
                : 'Connected to all services'}
          </span>
        </div>

        {/* Grouped Request List */}
        <div className="max-h-72 overflow-y-auto p-2 space-y-1">
          {groupedRequests.length === 0 ? (
            <div className="p-4 text-center text-sm text-poster-text-sub/50">
              No recent network activity
            </div>
          ) : (
            groupedRequests.map((group) => (
              <div
                key={group.groupKey}
                className={cn(
                  'text-xs p-2.5 rounded-lg transition-colors',
                  group.latestState === 'in-progress' || group.latestState === 'pending'
                    ? 'bg-blue-500/5 border border-blue-500/20'
                    : group.latestState === 'failed'
                      ? 'bg-red-500/5 border border-red-500/20'
                      : 'hover:bg-poster-surface/50'
                )}
              >
                <div className="flex items-center justify-between mb-1 gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <StatusIcon state={group.latestState} />
                    <span className="font-medium truncate" title={group.description}>
                      {group.label}
                    </span>
                    {group.count > 1 && (
                      <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-poster-surface/80 text-poster-text-sub/70 shrink-0">
                        <Layers className="w-2.5 h-2.5" />
                        {group.count}
                      </span>
                    )}
                  </div>
                  <span
                    className={cn(
                      'px-1.5 py-0.5 rounded text-[10px] shrink-0',
                      group.groupKey.startsWith('Model')
                        ? 'bg-purple-500/20 text-purple-400'
                        : group.groupKey.startsWith('Dev')
                          ? 'bg-gray-500/20 text-gray-400'
                          : group.groupKey.startsWith('App')
                            ? 'bg-blue-500/20 text-blue-400'
                            : group.groupKey.startsWith('API')
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-poster-surface/50 text-poster-text-sub/70'
                    )}
                  >
                    {group.groupKey.split(':')[0]}
                  </span>
                </div>

                <div className="text-[10px] text-poster-text-sub/60 ml-5">{group.description}</div>

                {(group.latestState === 'in-progress' || group.latestState === 'pending') &&
                  group.latestProgress !== undefined && (
                    <div className="mt-2 ml-5">
                      <div className="h-1 w-full bg-poster-surface rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 transition-all duration-300 ease-out"
                          style={{ width: `${group.latestProgress}%` }}
                        />
                      </div>
                      {group.totalSize && (
                        <div className="mt-1 text-[10px] text-poster-text-sub/50 flex justify-between">
                          <span>{Math.round(group.latestProgress)}%</span>
                          <span>
                            {formatBytes(group.downloadedSize || 0)} /{' '}
                            {formatBytes(group.totalSize)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-2 border-t border-poster-border/10 bg-poster-surface/30 text-[10px] text-center text-poster-text-sub/50 flex justify-between px-3">
          <span>
            {groupedRequests.length} group{groupedRequests.length !== 1 ? 's' : ''}
          </span>
          <span>{recentRequests.length} total requests</span>
        </div>
      </div>
    </div>
  );
}

function StatusIcon({ state }: { state: NetworkLogEntry['state'] }) {
  switch (state) {
    case 'pending':
      return <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin shrink-0" />;
    case 'in-progress':
      return <Download className="w-3.5 h-3.5 text-blue-500 animate-pulse shrink-0" />;
    case 'completed':
      return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />;
    case 'failed':
      return <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />;
    case 'aborted':
      return <XCircle className="w-3.5 h-3.5 text-orange-500 shrink-0" />;
    default:
      return <Wifi className="w-3.5 h-3.5 text-gray-500 shrink-0" />;
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
