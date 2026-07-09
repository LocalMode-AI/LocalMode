'use client';

import { useEffect, useState } from 'react';

import { EmbeddingDriftBanner } from './embedding-drift-banner';

/**
 * Demo for EmbeddingDriftBanner. Simulates a re-embed run advancing through the
 * embedding phase. Wire onReindex/progress to useReindex in your app.
 */
export default function EmbeddingDriftBannerDemo() {
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(0);
  const total = 240;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setCompleted((c) => {
        if (c >= total) {
          setRunning(false);
          return 0;
        }
        return Math.min(total, c + 20);
      });
    }, 300);
    return () => clearInterval(id);
  }, [running]);

  return (
    <EmbeddingDriftBanner
      storedModelId="Xenova/bge-small-en-v1.5"
      currentModelId="Xenova/all-MiniLM-L6-v2"
      isReindexing={running}
      progress={running ? { completed, total, phase: 'embedding' } : null}
      onReindex={() => {
        setCompleted(0);
        setRunning(true);
      }}
      onCancel={() => setRunning(false)}
    />
  );
}
