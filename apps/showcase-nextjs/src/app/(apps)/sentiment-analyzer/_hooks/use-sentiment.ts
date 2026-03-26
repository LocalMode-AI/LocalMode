/**
 * @file use-sentiment.ts
 * @description Hook for managing sentiment analysis operations using useSequentialBatch
 */
import { useState } from 'react';
import { useSequentialBatch, toAppError } from '@localmode/react';
import { classify } from '@localmode/core';
import { transformers } from '@localmode/transformers';
import { MODEL_ID } from '../_lib/constants';
import type { SentimentResult } from '../_lib/types';

/** Cached model instance shared across renders */
const sentimentModel = transformers.classifier(MODEL_ID);

/** Hook for sentiment analysis operations */
export function useSentiment() {
  const [results, setResults] = useState<SentimentResult[]>([]);

  const batch = useSequentialBatch({
    fn: async (text: string, signal: AbortSignal) => {
      return classify({ model: sentimentModel, text, abortSignal: signal });
    },
  });

  const analyze = async (text: string) => {
    const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length === 0) return;

    const batchResults = await batch.execute(lines);

    // Map non-null results to SentimentResult[], preserving correct line association
    const collected: SentimentResult[] = [];
    for (let i = 0; i < batchResults.length; i++) {
      const r = batchResults[i];
      if (r !== null) {
        collected.push({ text: lines[i], label: r.label as 'POSITIVE' | 'NEGATIVE', score: r.score });
      }
    }

    if (collected.length > 0) setResults(collected);
  };

  // Convert { current, total } progress to 0-1 number
  const progress = batch.progress.total > 0 ? batch.progress.current / batch.progress.total : 0;

  return {
    results, isAnalyzing: batch.isRunning, progress,
    error: toAppError(batch.error),
    analyze, cancel: batch.cancel, clearError: batch.reset, clearResults: () => setResults([]),
  };
}
