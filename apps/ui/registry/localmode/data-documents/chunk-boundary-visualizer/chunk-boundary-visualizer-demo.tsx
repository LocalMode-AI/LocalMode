'use client';

import * as React from 'react';
import {
  ChunkBoundaryVisualizer,
  type ChunkInfo,
} from './chunk-boundary-visualizer';

// Sample of the shape `useSemanticChunk` produces (mapped to ChunkInfo).
// A low rightSimilarity (0.31) marks the strong topic break between the
// privacy chunks and the deployment chunk.
const CHUNKS: ChunkInfo[] = [
  {
    text: 'LocalMode runs ML models entirely in the browser. Data never leaves the device, and there are no servers or API keys to manage.',
    chunkIndex: 0,
    rightSimilarity: 0.78,
  },
  {
    text: 'Embeddings, vector search, and chat all work offline after the initial model download is cached on-device.',
    chunkIndex: 1,
    rightSimilarity: 0.31,
  },
  {
    text: 'To deploy, point Vercel at the app directory and set the public site URL. The build step prerenders the registry JSON.',
    chunkIndex: 2,
    rightSimilarity: null,
  },
];

/**
 * Demo for the ChunkBoundaryVisualizer component, used by the docs live
 * preview. Toggle between semantic mode (shows inter-chunk `sim:` labels) and
 * fixed mode (segments only). Fully presentational — fed pre-computed
 * `ChunkInfo[]`, no model download.
 */
export default function ChunkBoundaryVisualizerDemo() {
  const [semantic, setSemantic] = React.useState(true);

  return (
    <div className="w-full max-w-xl space-y-3">
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={semantic}
          onChange={(e) => setSemantic(e.target.checked)}
        />
        Semantic mode (show boundary similarities)
      </label>

      <ChunkBoundaryVisualizer
        chunks={CHUNKS}
        mode={semantic ? 'semantic' : 'fixed'}
      />
    </div>
  );
}
