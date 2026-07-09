/**
 * @file page.tsx
 * @description Canonical `/blocks/knowledge/semantic-search` — the Semantic
 * Search block wrapped in single-block BlockShell chrome. No model bytes
 * download until an explicit in-block action.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { BlockShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { SemanticSearchBlock } from './semantic-search';

export const metadata: Metadata = {
  title: 'Semantic Search block - LocalMode UI',
  alternates: { canonical: '/blocks/knowledge/semantic-search' },
  openGraph: {
    title: 'Semantic Search',
    description: 'Build a searchable knowledge base right in your browser. Add content three ways: paste text, upload PDFs, or scan images with OCR. Then search by meaning instead of exact keywords, with the most relevant passages ranked to the top. Everything runs on your device, and nothing downloads until you start.',
    url: '/blocks/knowledge/semantic-search',
    type: 'website',
    images: [ogImageUrl({ title: 'Semantic Search', description: 'Build a searchable knowledge base right in your browser. Add content three ways: paste text, upload PDFs, or scan images with OCR. Then search by meaning instead of exact keywords, with the most relevant passages ranked to the top. Everything runs on your device, and nothing downloads until you start.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Semantic Search',
    description: 'Build a searchable knowledge base right in your browser. Add content three ways: paste text, upload PDFs, or scan images with OCR. Then search by meaning instead of exact keywords, with the most relevant passages ranked to the top. Everything runs on your device, and nothing downloads until you start.',
    images: [ogImageUrl({ title: 'Semantic Search', description: 'Build a searchable knowledge base right in your browser. Add content three ways: paste text, upload PDFs, or scan images with OCR. Then search by meaning instead of exact keywords, with the most relevant passages ranked to the top. Everything runs on your device, and nothing downloads until you start.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function SemanticSearchBlockPage() {
  return (
    <BlockShell
      title="Semantic Search"
      description="Build a searchable knowledge base right in your browser. Add content three ways: paste text, upload PDFs, or scan images with OCR. Then search by meaning instead of exact keywords, with the most relevant passages ranked to the top. Everything runs on your device, and nothing downloads until you start."
      name="knowledge/semantic-search"
      source={readBlockSource('knowledge/semantic-search')}
    >
      <SemanticSearchBlock />
    </BlockShell>
  );
}
