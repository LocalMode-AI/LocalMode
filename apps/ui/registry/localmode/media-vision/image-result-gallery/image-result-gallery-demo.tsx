'use client';

import * as React from 'react';
import { ImageResultGallery } from './image-result-gallery';
import type { ImageResultCard } from './image-result-gallery';

/** Inline solid-color SVG thumbnails — no network request in the preview. */
function tile(color: string, text: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="${color}"/><text x="100" y="108" font-family="sans-serif" font-size="18" fill="#fff" text-anchor="middle">${text}</text></svg>`,
  )}`;
}

const INITIAL: ImageResultCard[] = [
  { id: '1', src: tile('#0ea5e9', 'cat'), label: 'tabby cat', category: 'animal', score: 0.97 },
  { id: '2', src: tile('#22c55e', 'tree'), label: 'oak tree', category: 'nature', score: 0.88 },
  { id: '3', src: tile('#f59e0b', 'car'), label: 'sports car', category: 'vehicle', score: 0.62 },
  { id: '4', src: tile('#ec4899', 'bird'), label: 'robin', category: 'animal', score: 0.79 },
  { id: '5', src: tile('#14b8a6', 'cup'), label: 'coffee cup', category: 'object', score: 0.91 },
  { id: '6', src: tile('#f43f5e', 'rose'), label: 'red rose', category: 'nature', score: 0.84 },
  { id: '7', src: tile('#6366f1', 'book'), label: 'paperback', category: 'object', score: 0.55 },
  { id: '8', src: tile('#8b5cf6', '…'), label: 'analyzing…', category: 'pending', processing: true },
];

// Cross-modal CLIP similarity scores compress into ~0.15–0.35 — with the
// default 0.8/0.5 tiers every strong match would render as a red "low" badge, so
// this row passes CLIP-tuned `scoreThresholds` to color them correctly.
const CLIP_RESULTS: ImageResultCard[] = [
  { id: 'c1', src: tile('#0ea5e9', 'A'), label: 'best match', category: 'search', score: 0.34 },
  { id: 'c2', src: tile('#22c55e', 'B'), label: 'good match', category: 'search', score: 0.27 },
  { id: 'c3', src: tile('#f59e0b', 'C'), label: 'weak match', category: 'search', score: 0.16 },
];

/**
 * Demo for the ImageResultGallery, used by the docs live preview. Static cards
 * (no model download) exercise grid/list layout switching, multi-select,
 * delete, the per-card processing overlay, the persistent (non-hover) metadata
 * caption, and the CLIP-tuned `scoreThresholds` prop.
 */
export default function ImageResultGalleryDemo() {
  const [cards, setCards] = React.useState(INITIAL);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [layout, setLayout] = React.useState<'grid' | 'list'>('grid');

  return (
    <div className="w-full max-w-xl space-y-3">
      <div className="inline-flex rounded-lg border border-border bg-muted p-1 text-sm">
        <button
          type="button"
          onClick={() => setLayout('grid')}
          className={layout === 'grid' ? 'rounded-md bg-background px-3 py-1 font-medium shadow-sm' : 'px-3 py-1 text-muted-foreground'}
        >
          Grid
        </button>
        <button
          type="button"
          onClick={() => setLayout('list')}
          className={layout === 'list' ? 'rounded-md bg-background px-3 py-1 font-medium shadow-sm' : 'px-3 py-1 text-muted-foreground'}
        >
          List
        </button>
      </div>

      <ImageResultGallery
        cards={cards}
        layout={layout}
        selectedIds={selected}
        onSelect={(id, on) =>
          setSelected((prev) => (on ? [...prev, id] : prev.filter((x) => x !== id)))
        }
        onDelete={(id) => {
          setCards((prev) => prev.filter((c) => c.id !== id));
          setSelected((prev) => prev.filter((x) => x !== id));
        }}
      />

      {selected.length > 0 && (
        <p className="text-sm text-muted-foreground">{selected.length} selected</p>
      )}

      <div className="space-y-2 border-t border-border pt-3">
        <p className="text-sm font-medium">
          CLIP-scale scores{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            scoreThresholds={'{{ high: 0.35, medium: 0.2 }}'}
          </code>
        </p>
        <p className="text-xs text-muted-foreground">
          Cross-modal similarity lands ~0.15-0.35; tuned thresholds keep strong
          matches from rendering as a red &ldquo;low&rdquo; badge.
        </p>
        <ImageResultGallery
          cards={CLIP_RESULTS}
          layout="grid"
          scoreThresholds={{ high: 0.35, medium: 0.2 }}
        />
      </div>
    </div>
  );
}
