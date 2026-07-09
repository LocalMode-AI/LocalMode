/**
 * @file page.tsx
 * @description Canonical `/blocks/text-insights/model-evaluator` — the Model
 * Evaluator block wrapped in single-block BlockShell chrome. No model bytes
 * download until an explicit in-block action.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { BlockShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { ModelEvaluatorBlock } from './model-evaluator';

export const metadata: Metadata = {
  title: 'Model Evaluator block - LocalMode UI',
  alternates: { canonical: '/blocks/text-insights/model-evaluator' },
  openGraph: {
    title: 'Model Evaluator',
    description: 'Measure how accurate a text classifier is on a labeled set. Get accuracy along with precision, recall, and F1, a color-coded confusion matrix, and one-click JSON export of the results. The model loads only when you press Run.',
    url: '/blocks/text-insights/model-evaluator',
    type: 'website',
    images: [ogImageUrl({ title: 'Model Evaluator', description: 'Measure how accurate a text classifier is on a labeled set. Get accuracy along with precision, recall, and F1, a color-coded confusion matrix, and one-click JSON export of the results. The model loads only when you press Run.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Model Evaluator',
    description: 'Measure how accurate a text classifier is on a labeled set. Get accuracy along with precision, recall, and F1, a color-coded confusion matrix, and one-click JSON export of the results. The model loads only when you press Run.',
    images: [ogImageUrl({ title: 'Model Evaluator', description: 'Measure how accurate a text classifier is on a labeled set. Get accuracy along with precision, recall, and F1, a color-coded confusion matrix, and one-click JSON export of the results. The model loads only when you press Run.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function ModelEvaluatorBlockPage() {
  return (
    <BlockShell
      title="Model Evaluator"
      description="Measure how accurate a text classifier is on a labeled set. Get accuracy along with precision, recall, and F1, a color-coded confusion matrix, and one-click JSON export of the results. The model loads only when you press Run."
      name="text-insights/model-evaluator"
      source={readBlockSource('text-insights/model-evaluator')}
    >
      <ModelEvaluatorBlock />
    </BlockShell>
  );
}
