import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { BlockShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { DocumentQaBlock } from './document-qa';

export const metadata: Metadata = {
  title: 'Document QA block - LocalMode UI',
  alternates: { canonical: '/blocks/knowledge/document-qa' },
  openGraph: {
    title: 'Document QA',
    description: 'Ask questions about your own documents and get direct answers, all on your device. It pulls each answer straight from your text and shows how confident it is. You can also ask about an uploaded image, like an invoice or a scanned page. Nothing downloads until you start.',
    url: '/blocks/knowledge/document-qa',
    type: 'website',
    images: [ogImageUrl({ title: 'Document QA', description: 'Ask questions about your own documents and get direct answers, all on your device. It pulls each answer straight from your text and shows how confident it is. You can also ask about an uploaded image, like an invoice or a scanned page. Nothing downloads until you start.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Document QA',
    description: 'Ask questions about your own documents and get direct answers, all on your device. It pulls each answer straight from your text and shows how confident it is. You can also ask about an uploaded image, like an invoice or a scanned page. Nothing downloads until you start.',
    images: [ogImageUrl({ title: 'Document QA', description: 'Ask questions about your own documents and get direct answers, all on your device. It pulls each answer straight from your text and shows how confident it is. You can also ask about an uploaded image, like an invoice or a scanned page. Nothing downloads until you start.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function DocumentQaBlockPage() {
  return (
    <BlockShell
      title="Document QA"
      description="Ask questions about your own documents and get direct answers, all on your device. It pulls each answer straight from your text and shows how confident it is. You can also ask about an uploaded image, like an invoice or a scanned page. Nothing downloads until you start."
      name="knowledge/document-qa"
      source={readBlockSource('knowledge/document-qa')}
    >
      <DocumentQaBlock />
    </BlockShell>
  );
}
