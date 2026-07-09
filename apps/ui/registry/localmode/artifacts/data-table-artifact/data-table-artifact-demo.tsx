'use client';

/**
 * @file data-table-artifact-demo.tsx
 * @description Demo for DataTableArtifact, used by the docs live preview. Renders
 * local model-catalog rows (no model download needed) and lets you click a
 * column header to sort entirely client-side.
 */

import { DataTableArtifact } from './data-table-artifact';

interface ModelRow extends Record<string, unknown> {
  model: string;
  params: string;
  sizeMB: number;
  contextK: number;
}

const ROWS: ModelRow[] = [
  { model: 'SmolLM2 135M', params: '135M', sizeMB: 92, contextK: 8 },
  { model: 'SmolLM2 360M', params: '360M', sizeMB: 230, contextK: 8 },
  { model: 'Qwen2.5 0.5B', params: '500M', sizeMB: 398, contextK: 32 },
  { model: 'Llama 3.2 1B', params: '1B', sizeMB: 808, contextK: 128 },
  { model: 'Gemma 2 2B', params: '2B', sizeMB: 1640, contextK: 8 },
];

export default function DataTableArtifactDemo() {
  return (
    <DataTableArtifact<ModelRow>
      rows={ROWS}
      caption="Click a column header to sort - runs entirely in your browser."
      columns={[
        { key: 'model', header: 'Model' },
        { key: 'params', header: 'Params' },
        { key: 'sizeMB', header: 'Size (MB)', align: 'right' },
        { key: 'contextK', header: 'Context (K)', align: 'right' },
      ]}
      className="w-full min-w-0 max-w-lg"
    />
  );
}
