/**
 * @file text-embed-tab.tsx
 * @description Text embedding similarity tab
 */
'use client';

import { Info } from 'lucide-react';
import { useTextSimilarity } from '../_hooks';
import { Button, Spinner } from './ui';
import { ErrorAlert } from './error-boundary';

/** Describe a similarity score in plain language. */
function describeSimilarity(score: number): string {
  if (score >= 0.75) return 'Very similar';
  if (score >= 0.5) return 'Related';
  if (score >= 0.25) return 'Loosely related';
  return 'Unrelated';
}

/** Text classify & embed tab — semantic similarity via MediaPipe text embeddings. */
export function TextEmbedTab() {
  const {
    textA,
    setTextA,
    textB,
    setTextB,
    similarity,
    isComputing,
    error,
    compare,
    clearError,
  } = useTextSimilarity();

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-2 bg-poster-surface p-5">
          <h3 className="text-sm font-semibold text-poster-text-main">First text</h3>
          <textarea
            className="textarea textarea-bordered min-h-[120px] w-full text-sm"
            placeholder="The cat sat on the mat"
            value={textA}
            onChange={(e) => setTextA(e.target.value)}
          />
        </div>
        <div className="card space-y-2 bg-poster-surface p-5">
          <h3 className="text-sm font-semibold text-poster-text-main">Second text</h3>
          <textarea
            className="textarea textarea-bordered min-h-[120px] w-full text-sm"
            placeholder="A feline rested on the rug"
            value={textB}
            onChange={(e) => setTextB(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          onClick={compare}
          loading={isComputing}
          disabled={!textA.trim() || !textB.trim()}
        >
          Compare Similarity
        </Button>
        {isComputing && <Spinner size="sm" />}
      </div>

      {similarity !== null && (
        <div className="card bg-poster-surface p-5 text-center">
          <p className="text-3xl font-bold text-poster-primary">
            {similarity.toFixed(3)}
          </p>
          <p className="mt-1 text-sm text-poster-text-sub">
            Cosine similarity — {describeSimilarity(similarity)}
          </p>
        </div>
      )}

      {error && <ErrorAlert message={error.message} onDismiss={clearError} onRetry={compare} />}

      <div className="alert">
        <Info className="h-4 w-4" />
        <span className="text-xs">
          Text <strong>classification</strong> with MediaPipe requires a custom-trained
          model built with MediaPipe Model Maker. This tab demonstrates text{' '}
          <strong>embeddings</strong>, which power semantic search and similarity.
        </span>
      </div>
    </div>
  );
}
