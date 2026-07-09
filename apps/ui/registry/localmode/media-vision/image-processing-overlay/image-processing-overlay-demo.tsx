'use client';

import * as React from 'react';
import { ImageProcessingOverlay } from './image-processing-overlay';

/** Inline SVG data URL — no network request in the preview. */
const IMAGE = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="260"><rect width="400" height="260" fill="#1e293b"/><circle cx="200" cy="130" r="70" fill="#475569"/></svg>`,
)}`;

/**
 * Demo for the ImageProcessingOverlay, used by the docs live preview.
 * Toggles a simulated processing pass so both the spinner and the scan variant
 * are visible, and demonstrates that nothing renders when idle.
 */
export default function ImageProcessingOverlayDemo() {
  const [processing, setProcessing] = React.useState(false);
  const [variant, setVariant] = React.useState<'spinner' | 'scan'>('scan');

  function run() {
    setProcessing(true);
    setTimeout(() => setProcessing(false), 4000);
  }

  return (
    <div className="w-full max-w-md space-y-3">
      <div className="relative overflow-hidden rounded-lg border border-border">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={IMAGE}
          alt="demo"
          className={processing ? 'w-full opacity-50' : 'w-full'}
        />
        <ImageProcessingOverlay
          processing={processing}
          variant={variant}
          status="Detecting objects…"
          detail="yolos-tiny · running on WASM"
          onCancel={() => setProcessing(false)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={run}
          disabled={processing}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {processing ? 'Processing…' : 'Run (4s)'}
        </button>
        <button
          type="button"
          onClick={() => setVariant((v) => (v === 'scan' ? 'spinner' : 'scan'))}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-card-foreground"
        >
          Variant: {variant}
        </button>
      </div>
    </div>
  );
}
