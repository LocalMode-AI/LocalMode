'use client';

import { useState } from 'react';

import {
  ChromeAIDownloadGate,
  ChromeAIReadyBadge,
  type ChromeAvailabilityState,
} from './chrome-ai-download-gate';

/**
 * Demo for ChromeAIDownloadGate. Simulates the full lifecycle a user sees —
 * downloadable → downloading (with progress) → available — plus the two terminal
 * states. No real model is downloaded and no browser API is called.
 */
export default function ChromeAIDownloadGateDemo() {
  const [availability, setAvailability] = useState<ChromeAvailabilityState>('downloadable');
  const [progress, setProgress] = useState<number | undefined>(undefined);
  const [isDownloading, setIsDownloading] = useState(false);

  function simulateDownload() {
    setIsDownloading(true);
    setProgress(0);
    let p = 0;
    const id = setInterval(() => {
      p = Math.min(1, p + 0.08);
      setProgress(p);
      if (p >= 1) {
        clearInterval(id);
        setIsDownloading(false);
        setProgress(undefined);
        setAvailability('available');
      }
    }, 150);
  }

  function reset() {
    setAvailability('downloadable');
    setProgress(undefined);
    setIsDownloading(false);
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <ChromeAIDownloadGate
        availability={availability}
        label="Chrome Summarizer"
        size="~1.5 GB"
        isDownloading={isDownloading}
        progress={progress}
        onDownload={simulateDownload}
        fallbackLabel="Transformers.js"
      />

      {availability === 'available' && !isDownloading ? (
        <div className="flex items-center gap-3">
          <ChromeAIReadyBadge label="Chrome Summarizer" />
          <button
            type="button"
            onClick={reset}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Reset demo
          </button>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <p className="text-xs font-medium text-muted-foreground">Terminal states</p>
        <ChromeAIDownloadGate
          availability="unsupported"
          label="Chrome Prompt API"
          onDownload={() => {}}
          fallbackLabel="Transformers.js"
        />
        <ChromeAIDownloadGate
          availability="unavailable"
          label="Chrome Summarizer"
          onDownload={() => {}}
          fallbackLabel="Transformers.js"
        />
      </div>
    </div>
  );
}
