'use client';

import { CacheBadge } from './cache-badge';

/**
 * Demo for CacheBadge. Shows a cached annotation with and without latency next
 * to a mock assistant reply; the un-cached variant renders nothing.
 */
export default function CacheBadgeDemo() {
  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
        <span className="flex-1">The capital of France is Paris.</span>
        <CacheBadge cached latencyMs={12} />
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
        <span className="flex-1">Served from cache, no latency shown.</span>
        <CacheBadge cached />
      </div>
    </div>
  );
}
