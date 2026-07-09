/**
 * @file page.tsx
 * @description Canonical `/blocks/text-insights/sentiment-analyzer` — the
 * Sentiment Analyzer block wrapped in single-block BlockShell chrome. No model
 * bytes download until an explicit in-block action.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { BlockShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { SentimentAnalyzerBlock } from './sentiment-analyzer';

export const metadata: Metadata = {
  title: 'Sentiment Analyzer block - LocalMode UI',
  alternates: { canonical: '/blocks/text-insights/sentiment-analyzer' },
  openGraph: {
    title: 'Sentiment Analyzer',
    description: 'Score text as positive or negative, one message at a time or thousands at once. Watch live progress and speed, see the running positive and negative totals, and browse results in a scrollable list. The model loads only when you press Run.',
    url: '/blocks/text-insights/sentiment-analyzer',
    type: 'website',
    images: [ogImageUrl({ title: 'Sentiment Analyzer', description: 'Score text as positive or negative, one message at a time or thousands at once. Watch live progress and speed, see the running positive and negative totals, and browse results in a scrollable list. The model loads only when you press Run.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sentiment Analyzer',
    description: 'Score text as positive or negative, one message at a time or thousands at once. Watch live progress and speed, see the running positive and negative totals, and browse results in a scrollable list. The model loads only when you press Run.',
    images: [ogImageUrl({ title: 'Sentiment Analyzer', description: 'Score text as positive or negative, one message at a time or thousands at once. Watch live progress and speed, see the running positive and negative totals, and browse results in a scrollable list. The model loads only when you press Run.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function SentimentAnalyzerBlockPage() {
  return (
    <BlockShell
      title="Sentiment Analyzer"
      description="Score text as positive or negative, one message at a time or thousands at once. Watch live progress and speed, see the running positive and negative totals, and browse results in a scrollable list. The model loads only when you press Run."
      name="text-insights/sentiment-analyzer"
      source={readBlockSource('text-insights/sentiment-analyzer')}
    >
      <SentimentAnalyzerBlock />
    </BlockShell>
  );
}
