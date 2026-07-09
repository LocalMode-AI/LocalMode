/**
 * @file page.tsx
 * @description Canonical `/blocks/text-insights/text-classifier` — the Text
 * Classifier block wrapped in single-block BlockShell chrome. No model bytes
 * download until an explicit in-block action.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { BlockShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { TextClassifierBlock } from './text-classifier';

export const metadata: Metadata = {
  title: 'Text Classifier block - LocalMode UI',
  alternates: { canonical: '/blocks/text-insights/text-classifier' },
  openGraph: {
    title: 'Text Classifier',
    description: 'Sort any message into your own set of labels. Add or remove categories, then see which label wins and how every other label ranked. The model loads only when you press Run.',
    url: '/blocks/text-insights/text-classifier',
    type: 'website',
    images: [ogImageUrl({ title: 'Text Classifier', description: 'Sort any message into your own set of labels. Add or remove categories, then see which label wins and how every other label ranked. The model loads only when you press Run.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Text Classifier',
    description: 'Sort any message into your own set of labels. Add or remove categories, then see which label wins and how every other label ranked. The model loads only when you press Run.',
    images: [ogImageUrl({ title: 'Text Classifier', description: 'Sort any message into your own set of labels. Add or remove categories, then see which label wins and how every other label ranked. The model loads only when you press Run.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function TextClassifierBlockPage() {
  return (
    <BlockShell
      title="Text Classifier"
      description="Sort any message into your own set of labels. Add or remove categories, then see which label wins and how every other label ranked. The model loads only when you press Run."
      name="text-insights/text-classifier"
      source={readBlockSource('text-insights/text-classifier')}
    >
      <TextClassifierBlock />
    </BlockShell>
  );
}
