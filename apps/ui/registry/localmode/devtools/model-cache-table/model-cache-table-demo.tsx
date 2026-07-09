'use client';

import * as React from 'react';
import { ModelCacheTable, type ModelCacheEntryLike } from './model-cache-table';

/** Fixture cache entries with last-used timestamps relative to mount. */
function buildFixtureEntries(): Record<string, ModelCacheEntryLike> {
  const now = Date.now();
  return {
    'Xenova/bge-small-en-v1.5': {
      modelId: 'Xenova/bge-small-en-v1.5',
      status: 'loaded',
      loadDurationMs: 1840,
      lastUsed: new Date(now - 42_000).toISOString(),
      sizeBytes: 34_100_000,
    },
    'onnx-community/Qwen2.5-0.5B-Instruct': {
      modelId: 'onnx-community/Qwen2.5-0.5B-Instruct',
      status: 'loading',
      loadDurationMs: 0,
      lastUsed: new Date(now).toISOString(),
    },
    'Xenova/whisper-tiny.en': {
      modelId: 'Xenova/whisper-tiny.en',
      status: 'error',
      loadDurationMs: 460,
      lastUsed: new Date(now - 5 * 60_000).toISOString(),
    },
  };
}

/**
 * Demo for ModelCacheTable. Renders three fixture entries — a loaded
 * embedding model carrying a size, an LLM mid-load (pulsing badge, no load
 * time yet), and a failed Whisper load (destructive badge). Evicting removes
 * the row from local state; evicting all three reveals the empty state. Wire
 * `entries` to `useDevToolsModelCache()` from `@localmode/devtools/react` in
 * your app. Fully presentational — no model download.
 */
export default function ModelCacheTableDemo() {
  const [entries, setEntries] =
    React.useState<Record<string, ModelCacheEntryLike>>(buildFixtureEntries);

  const evict = (modelId: string) => {
    setEntries((prev) => {
      const next = { ...prev };
      delete next[modelId];
      return next;
    });
  };

  return <ModelCacheTable entries={entries} onEvict={evict} />;
}
