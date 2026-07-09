/**
 * @file page.tsx
 * @description Public `/blocks/text` — the Text category page, a small
 * standalone category hosting the language-detector block in its own gated
 * BlockShell. Nothing downloads on page open.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { CategoryShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { LanguageDetectorBlock } from './language-detector/language-detector';

export const metadata: Metadata = {
  title: 'Text blocks - LocalMode UI',
  alternates: { canonical: '/blocks/text' },
  openGraph: {
    title: 'Text',
    description: 'An on-device text block running entirely in your browser. Models download only behind an explicit action.',
    url: '/blocks/text',
    type: 'website',
    images: [ogImageUrl({ title: 'Text', description: 'An on-device text block running entirely in your browser. Models download only behind an explicit action.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Text',
    description: 'An on-device text block running entirely in your browser. Models download only behind an explicit action.',
    images: [ogImageUrl({ title: 'Text', description: 'An on-device text block running entirely in your browser. Models download only behind an explicit action.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function TextCategoryPage() {
  return (
    <CategoryShell
      title="Text"
      description="An on-device text block running entirely in your browser. Models download only behind an explicit action."
      blocks={[
        {
          slug: 'language-detector',
          name: 'text/language-detector',
          title: 'Language Detector',
          description:
            'Detect the language of any text as you type, with the top guesses and their confidence, plus a way to compare how similar two texts are in meaning. Runs fully in your browser.',
          source: readBlockSource('text/language-detector'),
          children: <LanguageDetectorBlock />,
        },
      ]}
    />
  );
}
