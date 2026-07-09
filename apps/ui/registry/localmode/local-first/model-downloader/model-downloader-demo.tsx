'use client';

import { useEffect, useState } from 'react';

import { DownloadProgress, ModelDownloader } from './model-downloader';

/**
 * Demo for ModelDownloader / DownloadProgress. Animates a simulated download
 * from 0→100% to show the "Downloading…" → ready transition, plus a standalone
 * DownloadProgress bar and a cache-load card. No real model is downloaded here.
 */
export default function ModelDownloaderDemo() {
  const [fraction, setFraction] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setFraction((f) => (f >= 1 ? 0 : Math.min(1, f + 0.04)));
    }, 200);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex w-full max-w-md flex-col gap-6">
      <ModelDownloader
        name="Llama 3.2 1B Instruct"
        size="1.2 GB"
        contextLength={8192}
        category="Chat"
        progress={fraction}
      />
      <ModelDownloader
        name="bge-small-en-v1.5"
        size="34 MB"
        contextLength={512}
        category="Embedding"
        progress={{ percent: 0.6, cached: true }}
      />
      <div className="flex flex-col gap-1.5">
        <p className="text-xs text-muted-foreground">
          Standalone <code className="font-mono">DownloadProgress</code> bar
        </p>
        <DownloadProgress value={fraction} />
      </div>
    </div>
  );
}
