/**
 * @file page.tsx
 * @description Canonical `/blocks/knowledge/vector-data-manager` — the Vector
 * Data Manager block wrapped in single-block BlockShell chrome. No model bytes
 * download until an explicit in-block action.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { BlockShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { VectorDataManagerBlock } from './vector-data-manager';

export const metadata: Metadata = {
  title: 'Vector Data Manager block - LocalMode UI',
  alternates: { canonical: '/blocks/knowledge/vector-data-manager' },
  openGraph: {
    title: 'Vector Data Manager',
    description: 'Manage the data behind your knowledge base. Import vectors from formats like Pinecone, ChromaDB, CSV, or JSON, preview them, then export your data back out whenever you want. Keep an eye on storage use and re-index when your embedding model changes. Nothing downloads until you start.',
    url: '/blocks/knowledge/vector-data-manager',
    type: 'website',
    images: [ogImageUrl({ title: 'Vector Data Manager', description: 'Manage the data behind your knowledge base. Import vectors from formats like Pinecone, ChromaDB, CSV, or JSON, preview them, then export your data back out whenever you want. Keep an eye on storage use and re-index when your embedding model changes. Nothing downloads until you start.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Vector Data Manager',
    description: 'Manage the data behind your knowledge base. Import vectors from formats like Pinecone, ChromaDB, CSV, or JSON, preview them, then export your data back out whenever you want. Keep an eye on storage use and re-index when your embedding model changes. Nothing downloads until you start.',
    images: [ogImageUrl({ title: 'Vector Data Manager', description: 'Manage the data behind your knowledge base. Import vectors from formats like Pinecone, ChromaDB, CSV, or JSON, preview them, then export your data back out whenever you want. Keep an eye on storage use and re-index when your embedding model changes. Nothing downloads until you start.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function VectorDataManagerBlockPage() {
  return (
    <BlockShell
      title="Vector Data Manager"
      description="Manage the data behind your knowledge base. Import vectors from formats like Pinecone, ChromaDB, CSV, or JSON, preview them, then export your data back out whenever you want. Keep an eye on storage use and re-index when your embedding model changes. Nothing downloads until you start."
      name="knowledge/vector-data-manager"
      source={readBlockSource('knowledge/vector-data-manager')}
    >
      <VectorDataManagerBlock />
    </BlockShell>
  );
}
