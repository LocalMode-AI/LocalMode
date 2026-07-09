'use client';

import { useState } from 'react';

import {
  CachedAnnotation,
  SemanticCacheStatusBar,
} from './semantic-cache-status-bar';

/**
 * Demo for SemanticCacheStatusBar / CachedAnnotation. Toggle and clear are wired
 * to local state; in your app bind `stats` to useSemanticCache().stats and
 * `onClear` to cache.clear().
 */
export default function SemanticCacheStatusBarDemo() {
  const [enabled, setEnabled] = useState(true);
  const [entries, setEntries] = useState(24);

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <SemanticCacheStatusBar
        stats={{ entries, hitRate: 0.62 }}
        enabled={enabled}
        onToggle={setEnabled}
        onClear={() => setEntries(0)}
      />
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
        <span className="flex-1">Paris is the capital of France.</span>
        <CachedAnnotation latencyMs={38} />
      </div>
    </div>
  );
}
