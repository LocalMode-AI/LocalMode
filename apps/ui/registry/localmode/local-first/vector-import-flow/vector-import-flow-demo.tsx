'use client';

import { useState } from 'react';

import { VectorImportFlow, type ImportStatsLike } from './vector-import-flow';

const RESULT: ImportStatsLike = {
  imported: 980,
  skipped: 12,
  reEmbedded: 8,
  totalParsed: 1000,
  format: 'pinecone',
  durationMs: 4200,
};

/**
 * Demo for VectorImportFlow. Shows the pre-import preview panel with a
 * record-preview table, then a result banner on Confirm. Wire preview/progress/
 * stats to useImportExport in your app.
 */
export default function VectorImportFlowDemo() {
  const [done, setDone] = useState(false);

  return (
    <VectorImportFlow
      preview={{
        format: 'pinecone',
        totalRecords: 1000,
        recordsWithVectors: 992,
        recordsWithTextOnly: 8,
        dimensions: 384,
      }}
      targetDimensions={384}
      records={[
        { id: 'doc-1', text: 'Local-first AI runs in the browser.', hasVector: true },
        { id: 'doc-2', text: 'No servers, no API keys.', hasVector: true },
        { id: 'doc-3', text: 'Re-embed on import.', hasVector: false },
      ]}
      stats={done ? RESULT : null}
      onConfirm={() => setDone(true)}
      onCancel={() => setDone(false)}
    />
  );
}
