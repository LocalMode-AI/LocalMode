/**
 * @file page.tsx
 * @description Public /blocks/text/language-detector — the LanguageDetectorBlock in BlockShell chrome.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { BlockShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { LanguageDetectorBlock } from './language-detector';

export const metadata: Metadata = {
  title: 'Language Detector block - LocalMode UI',
  alternates: { canonical: '/blocks/text/language-detector' },
  openGraph: {
    title: 'Language Detector',
    description: 'Detect what language a piece of text is written in as you type, showing the most likely languages and how confident each guess is. You can also paste two texts and see how close they are in meaning. It all runs in your browser, and models load only when you start typing or press Compare.',
    url: '/blocks/text/language-detector',
    type: 'website',
    images: [ogImageUrl({ title: 'Language Detector', description: 'Detect what language a piece of text is written in as you type, showing the most likely languages and how confident each guess is. You can also paste two texts and see how close they are in meaning. It all runs in your browser, and models load only when you start typing or press Compare.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Language Detector',
    description: 'Detect what language a piece of text is written in as you type, showing the most likely languages and how confident each guess is. You can also paste two texts and see how close they are in meaning. It all runs in your browser, and models load only when you start typing or press Compare.',
    images: [ogImageUrl({ title: 'Language Detector', description: 'Detect what language a piece of text is written in as you type, showing the most likely languages and how confident each guess is. You can also paste two texts and see how close they are in meaning. It all runs in your browser, and models load only when you start typing or press Compare.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function LanguageDetectorBlockPage() {
  return (
    <BlockShell
      title="Language Detector"
      description="Detect what language a piece of text is written in as you type, showing the most likely languages and how confident each guess is. You can also paste two texts and see how close they are in meaning. It all runs in your browser, and models load only when you start typing or press Compare."
      name="text/language-detector"
      source={readBlockSource('text/language-detector')}
    >
      <LanguageDetectorBlock />
    </BlockShell>
  );
}
