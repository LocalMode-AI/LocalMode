'use client';

import { useEffect, useState } from 'react';

import { ModelLoadingPanel } from './model-loading-panel';

/**
 * Demo for ModelLoadingPanel. Animates a simulated first-time download splash.
 * No real model is downloaded here.
 */
export default function ModelLoadingPanelDemo() {
  const [fraction, setFraction] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setFraction((f) => (f >= 1 ? 0 : Math.min(1, f + 0.03)));
    }, 200);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="w-full max-w-md">
      <ModelLoadingPanel
        name="Llama 3.2 1B Instruct"
        size="1.2 GB"
        contextLength={8192}
        category="Chat"
        progress={fraction}
      />
    </div>
  );
}
