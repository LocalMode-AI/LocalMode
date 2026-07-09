/**
 * @file page.tsx
 * @description Canonical `/blocks/writing-tools/translate` — the Translate block
 * wrapped in single-block BlockShell chrome. No model bytes download until an
 * explicit in-block action.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { BlockShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { TranslateBlock } from './translate';

export const metadata: Metadata = {
  title: 'Translate block - LocalMode UI',
  alternates: { canonical: '/blocks/writing-tools/translate' },
  openGraph: {
    title: 'Translate',
    description: "Translate text between 24 language pairs, swap the direction with one click to carry the result back into the input, and copy or clear as you go. It uses your browser's built-in translator when available, or a downloadable model otherwise. Nothing downloads until you ask.",
    url: '/blocks/writing-tools/translate',
    type: 'website',
    images: [ogImageUrl({ title: 'Translate', description: "Translate text between 24 language pairs, swap the direction with one click to carry the result back into the input, and copy or clear as you go. It uses your browser's built-in translator when available, or a downloadable model otherwise. Nothing downloads until you ask.", eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Translate',
    description: "Translate text between 24 language pairs, swap the direction with one click to carry the result back into the input, and copy or clear as you go. It uses your browser's built-in translator when available, or a downloadable model otherwise. Nothing downloads until you ask.",
    images: [ogImageUrl({ title: 'Translate', description: "Translate text between 24 language pairs, swap the direction with one click to carry the result back into the input, and copy or clear as you go. It uses your browser's built-in translator when available, or a downloadable model otherwise. Nothing downloads until you ask.", eyebrow: 'LocalMode Blocks' })],
  },
};

export default function TranslateBlockPage() {
  return (
    <BlockShell
      title="Translate"
      description="Translate text between 24 language pairs, swap the direction with one click to carry the result back into the input, and copy or clear as you go. It uses your browser's built-in translator when available, or a downloadable model otherwise. Nothing downloads until you ask."
      name="writing-tools/translate"
      source={readBlockSource('writing-tools/translate')}
    >
      <TranslateBlock />
    </BlockShell>
  );
}
