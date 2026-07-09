'use client';

import * as React from 'react';
import { BeforeAfterImageViewer } from './before-after-image-viewer';

/** Inline SVG data URL — avoids any network request in the live preview. */
function svgDataUrl(svg: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const ORIGINAL = svgDataUrl(
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#cbd5e1"/><circle cx="200" cy="150" r="80" fill="#64748b"/><text x="200" y="280" font-family="sans-serif" font-size="20" fill="#334155" text-anchor="middle">original (blurred)</text></svg>`,
);

// A result with real transparency around the subject (checkerboard shows through).
const PROCESSED = svgDataUrl(
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><circle cx="200" cy="150" r="80" fill="#0ea5e9"/><text x="200" y="280" font-family="sans-serif" font-size="20" fill="#f8fafc" stroke="#0f172a" stroke-width="0.75" paint-order="stroke" text-anchor="middle">subject (bg removed)</text></svg>`,
);

export default function BeforeAfterImageViewerDemo() {
  const [mode, setMode] = React.useState<'grid' | 'toggle'>('grid');

  return (
    <div className="w-full max-w-xl space-y-3">
      <div className="inline-flex rounded-lg border border-border bg-muted p-1 text-sm">
        <button
          type="button"
          onClick={() => setMode('grid')}
          className={mode === 'grid' ? 'rounded-md bg-background px-3 py-1 font-medium shadow-sm' : 'px-3 py-1 text-muted-foreground'}
        >
          Grid
        </button>
        <button
          type="button"
          onClick={() => setMode('toggle')}
          className={mode === 'toggle' ? 'rounded-md bg-background px-3 py-1 font-medium shadow-sm' : 'px-3 py-1 text-muted-foreground'}
        >
          Toggle
        </button>
      </div>

      <BeforeAfterImageViewer
        originalSrc={ORIGINAL}
        processedSrc={PROCESSED}
        mode={mode}
        processedLabel="Result"
        // Distinct alts so AT never hears the same description for both images.
        originalAlt="Original portrait before background removal"
        resultAlt="Portrait with the background removed"
      />
    </div>
  );
}
