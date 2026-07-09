/**
 * @file page.tsx
 * @description Public `/blocks/knowledge` category page — hosts the four
 * self-sufficient knowledge blocks (Semantic Search, Document QA, RAG Chat,
 * Vector Data Manager), each in its own BlockShell section with its own install
 * command, Code tab, and gated model load. Each owns its own corpus over the
 * promoted useKnowledgeBase engine layer; nothing downloads on page open.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { CategoryShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { SemanticSearchBlock } from './semantic-search/semantic-search';
import { DocumentQaBlock } from './document-qa/document-qa';
import { RagChatBlock } from './rag-chat/rag-chat';
import { VectorDataManagerBlock } from './vector-data-manager/vector-data-manager';

export const metadata: Metadata = {
  title: 'Knowledge blocks - LocalMode UI',
  alternates: { canonical: '/blocks/knowledge' },
  openGraph: {
    title: 'Knowledge',
    description: 'Four on-device knowledge blocks that each build and use their own document collection, entirely in the browser. Search your content by meaning, chat with it, ask direct questions, or manage the data behind it. Nothing downloads until you start.',
    url: '/blocks/knowledge',
    type: 'website',
    images: [ogImageUrl({ title: 'Knowledge', description: 'Four on-device knowledge blocks that each build and use their own document collection, entirely in the browser. Search your content by meaning, chat with it, ask direct questions, or manage the data behind it. Nothing downloads until you start.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Knowledge',
    description: 'Four on-device knowledge blocks that each build and use their own document collection, entirely in the browser. Search your content by meaning, chat with it, ask direct questions, or manage the data behind it. Nothing downloads until you start.',
    images: [ogImageUrl({ title: 'Knowledge', description: 'Four on-device knowledge blocks that each build and use their own document collection, entirely in the browser. Search your content by meaning, chat with it, ask direct questions, or manage the data behind it. Nothing downloads until you start.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function KnowledgeCategoryPage() {
  return (
    <CategoryShell
      title="Knowledge"
      description="Four on-device knowledge blocks that each build and use their own document collection, entirely in the browser. Search your content by meaning, chat with it, ask direct questions, or manage the data behind it. Nothing downloads until you start."
      blocks={[
        {
          slug: 'semantic-search',
          name: 'knowledge/semantic-search',
          title: 'Semantic Search',
          description:
            'Add content by pasting text, uploading PDFs, or scanning images, then search it by meaning. The most relevant passages are ranked to the top, all on your device.',
          source: readBlockSource('knowledge/semantic-search'),
          children: <SemanticSearchBlock />,
        },
        {
          slug: 'document-qa',
          name: 'knowledge/document-qa',
          title: 'Document QA',
          description:
            'Ask questions about your text or an uploaded image, like an invoice, and get a direct answer pulled from the source with a confidence rating.',
          source: readBlockSource('knowledge/document-qa'),
          children: <DocumentQaBlock />,
        },
        {
          slug: 'rag-chat',
          name: 'knowledge/rag-chat',
          title: 'RAG Chat',
          description:
            'Chat with your documents and get streaming answers grounded in your own text, with links back to the exact sources and pages they came from.',
          source: readBlockSource('knowledge/rag-chat'),
          children: <RagChatBlock />,
        },
        {
          slug: 'vector-data-manager',
          name: 'knowledge/vector-data-manager',
          title: 'Vector Data Manager',
          description:
            'Import, preview, and export the vector data behind your knowledge base, watch storage use, and re-index when your embedding model changes.',
          source: readBlockSource('knowledge/vector-data-manager'),
          children: <VectorDataManagerBlock />,
        },
      ]}
    />
  );
}
