/**
 * @file use-text-similarity.ts
 * @description Hook for computing semantic similarity between two texts
 */
'use client';

import { useState } from 'react';
import { getTextEmbedder } from '../_services/mediapipe.service';
import type { AppError } from '../_lib/types';

/** Cosine similarity between two equal-length vectors. */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Hook for computing the cosine similarity of two text inputs using
 * MediaPipe text embeddings.
 */
export function useTextSimilarity() {
  const [textA, setTextA] = useState('');
  const [textB, setTextB] = useState('');
  const [similarity, setSimilarity] = useState<number | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  /** Embed both texts and compute their cosine similarity. */
  const compare = async () => {
    if (!textA.trim() || !textB.trim()) return;
    setIsComputing(true);
    setError(null);
    setSimilarity(null);
    try {
      const { embed } = await import('@localmode/core');
      const model = getTextEmbedder();
      const [a, b] = await Promise.all([
        embed({ model, value: textA }),
        embed({ model, value: textB }),
      ]);
      setSimilarity(cosineSimilarity(a.embedding, b.embedding));
    } catch (err) {
      setError({
        message: err instanceof Error ? err.message : 'Text embedding failed',
        recoverable: true,
      });
    } finally {
      setIsComputing(false);
    }
  };

  return {
    textA,
    setTextA,
    textB,
    setTextB,
    similarity,
    isComputing,
    error,
    compare,
    clearError: () => setError(null),
  };
}
