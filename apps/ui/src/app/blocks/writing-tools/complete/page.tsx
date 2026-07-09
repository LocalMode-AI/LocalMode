/**
 * @file page.tsx
 * @description Canonical `/blocks/writing-tools/complete` — the Complete block
 * wrapped in single-block BlockShell chrome. No model bytes download until an
 * explicit in-block action.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { BlockShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { CompleteBlock } from './complete';

export const metadata: Metadata = {
  title: 'Complete block - LocalMode UI',
  alternates: { canonical: '/blocks/writing-tools/complete' },
  openGraph: {
    title: 'Complete',
    description: 'Fill in a blank word in your sentence with the top suggestions ranked by likelihood, then click one to apply it and keep going. Runs entirely in your browser, and nothing downloads until you ask.',
    url: '/blocks/writing-tools/complete',
    type: 'website',
    images: [ogImageUrl({ title: 'Complete', description: 'Fill in a blank word in your sentence with the top suggestions ranked by likelihood, then click one to apply it and keep going. Runs entirely in your browser, and nothing downloads until you ask.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Complete',
    description: 'Fill in a blank word in your sentence with the top suggestions ranked by likelihood, then click one to apply it and keep going. Runs entirely in your browser, and nothing downloads until you ask.',
    images: [ogImageUrl({ title: 'Complete', description: 'Fill in a blank word in your sentence with the top suggestions ranked by likelihood, then click one to apply it and keep going. Runs entirely in your browser, and nothing downloads until you ask.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function CompleteBlockPage() {
  return (
    <BlockShell
      title="Complete"
      description="Fill in a blank word in your sentence with the top suggestions ranked by likelihood, then click one to apply it and keep going. Runs entirely in your browser, and nothing downloads until you ask."
      name="writing-tools/complete"
      source={readBlockSource('writing-tools/complete')}
    >
      <CompleteBlock />
    </BlockShell>
  );
}
