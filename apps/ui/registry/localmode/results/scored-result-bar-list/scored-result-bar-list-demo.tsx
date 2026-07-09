'use client';

import { useState } from 'react';
import { ScoredResultBarList } from './scored-result-bar-list';

const SAMPLE = [
  { label: 'technology', score: 0.91 },
  { label: 'business', score: 0.62 },
  { label: 'sports', score: 0.34 },
  { label: 'politics', score: 0.12 },
];

/**
 * Demo for the ScoredResultBarList component, used by the docs live preview.
 * Toggles between a static ranked list, the skeleton-loading state, and the
 * empty state. Fully local — no model download.
 */
export default function ScoredResultBarListDemo() {
  const [mode, setMode] = useState<'data' | 'loading' | 'empty'>('data');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {(['data', 'loading', 'empty'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={
              'rounded-md border border-border px-3 py-1 text-xs font-medium ' +
              (mode === m
                ? 'bg-primary text-primary-foreground'
                : 'bg-card text-card-foreground hover:bg-accent')
            }
          >
            {m}
          </button>
        ))}
      </div>
      <ScoredResultBarList
        results={mode === 'data' ? SAMPLE : []}
        isLoading={mode === 'loading'}
      />
    </div>
  );
}
