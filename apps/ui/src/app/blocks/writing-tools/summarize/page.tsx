/**
 * @file page.tsx
 * @description Canonical `/blocks/writing-tools/summarize` — the Summarize block
 * wrapped in single-block BlockShell chrome. No model bytes download until an
 * explicit in-block action.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { BlockShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { SummarizeBlock } from './summarize';

export const metadata: Metadata = {
  title: 'Summarize block - LocalMode UI',
  alternates: { canonical: '/blocks/writing-tools/summarize' },
  openGraph: {
    title: 'Summarize',
    description: "Turn long text into a shorter summary, choosing a short, medium, or long length and either a pulled-from-the-text or reworded style. See how much you shortened it and the reading time saved. It uses your browser's built-in summarizer when available, or a downloadable model otherwise, and nothing downloads until you ask.",
    url: '/blocks/writing-tools/summarize',
    type: 'website',
    images: [ogImageUrl({ title: 'Summarize', description: "Turn long text into a shorter summary, choosing a short, medium, or long length and either a pulled-from-the-text or reworded style. See how much you shortened it and the reading time saved. It uses your browser's built-in summarizer when available, or a downloadable model otherwise, and nothing downloads until you ask.", eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Summarize',
    description: "Turn long text into a shorter summary, choosing a short, medium, or long length and either a pulled-from-the-text or reworded style. See how much you shortened it and the reading time saved. It uses your browser's built-in summarizer when available, or a downloadable model otherwise, and nothing downloads until you ask.",
    images: [ogImageUrl({ title: 'Summarize', description: "Turn long text into a shorter summary, choosing a short, medium, or long length and either a pulled-from-the-text or reworded style. See how much you shortened it and the reading time saved. It uses your browser's built-in summarizer when available, or a downloadable model otherwise, and nothing downloads until you ask.", eyebrow: 'LocalMode Blocks' })],
  },
};

export default function SummarizeBlockPage() {
  return (
    <BlockShell
      title="Summarize"
      description="Turn long text into a shorter summary, choosing a short, medium, or long length and either a pulled-from-the-text or reworded style. See how much you shortened it and the reading time saved. It uses your browser's built-in summarizer when available, or a downloadable model otherwise, and nothing downloads until you ask."
      name="writing-tools/summarize"
      source={readBlockSource('writing-tools/summarize')}
    >
      <SummarizeBlock />
    </BlockShell>
  );
}
