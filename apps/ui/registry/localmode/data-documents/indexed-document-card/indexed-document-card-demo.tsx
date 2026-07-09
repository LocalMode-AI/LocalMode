'use client';

import * as React from 'react';
import { IndexedDocumentCard } from './indexed-document-card';

interface DemoDoc {
  id: string;
  filename: string;
  pageCount?: number;
  chunkCount: number;
  sizeBytes: number;
}

const INITIAL_DOCS: DemoDoc[] = [
  {
    id: '1',
    filename: 'annual-report-2024-final-with-appendices.pdf',
    pageCount: 42,
    chunkCount: 128,
    sizeBytes: 2_400_000,
  },
  {
    id: '2',
    filename: 'customers.csv',
    chunkCount: 64,
    sizeBytes: 312_000,
  },
  { id: '3', filename: 'meeting-notes.md', pageCount: 1, chunkCount: 6, sizeBytes: 4_200 },
];

/**
 * Demo for the IndexedDocumentCard component, used by the docs live preview.
 * Hover a card to reveal its delete control; deleting shows a brief loading
 * state before removing the row. Fully presentational — no model download.
 */
export default function IndexedDocumentCardDemo() {
  const [docs, setDocs] = React.useState<DemoDoc[]>(INITIAL_DOCS);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const remove = (id: string) => {
    setDeletingId(id);
    // Simulate the async VectorDB delete.
    setTimeout(() => {
      setDocs((prev) => prev.filter((d) => d.id !== id));
      setDeletingId(null);
    }, 700);
  };

  return (
    <div className="w-full max-w-md space-y-2">
      {docs.map((doc) => (
        <IndexedDocumentCard
          key={doc.id}
          filename={doc.filename}
          pageCount={doc.pageCount}
          chunkCount={doc.chunkCount}
          sizeBytes={doc.sizeBytes}
          deleting={deletingId === doc.id}
          onDelete={() => remove(doc.id)}
        />
      ))}
      {docs.length === 0 && (
        <p className="text-sm text-muted-foreground">No indexed documents.</p>
      )}
    </div>
  );
}
