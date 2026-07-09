/**
 * @file page.tsx
 * @description Public `/blocks/text-insights` category page — hosts the four
 * single-purpose text-analysis blocks (Sentiment Analyzer, Text Classifier,
 * Model Evaluator, Threshold Calibrator), each in its own BlockShell section
 * with its own install command, Code tab, and gated model load. No model bytes
 * download on page open.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { CategoryShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { SentimentAnalyzerBlock } from './sentiment-analyzer/sentiment-analyzer';
import { TextClassifierBlock } from './text-classifier/text-classifier';
import { ModelEvaluatorBlock } from './model-evaluator/model-evaluator';
import { ThresholdCalibratorBlock } from './threshold-calibrator/threshold-calibrator';

export const metadata: Metadata = {
  title: 'Text Insights blocks - LocalMode UI',
  alternates: { canonical: '/blocks/text-insights' },
  openGraph: {
    title: 'Text Insights',
    description: 'Four small text-analysis blocks you can install on their own. Each one runs entirely in your browser, and nothing downloads until you press a button.',
    url: '/blocks/text-insights',
    type: 'website',
    images: [ogImageUrl({ title: 'Text Insights', description: 'Four small text-analysis blocks you can install on their own. Each one runs entirely in your browser, and nothing downloads until you press a button.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Text Insights',
    description: 'Four small text-analysis blocks you can install on their own. Each one runs entirely in your browser, and nothing downloads until you press a button.',
    images: [ogImageUrl({ title: 'Text Insights', description: 'Four small text-analysis blocks you can install on their own. Each one runs entirely in your browser, and nothing downloads until you press a button.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function TextInsightsCategoryPage() {
  return (
    <CategoryShell
      title="Text Insights"
      description="Four small text-analysis blocks you can install on their own. Each one runs entirely in your browser, and nothing downloads until you press a button."
      blocks={[
        {
          slug: 'sentiment-analyzer',
          name: 'text-insights/sentiment-analyzer',
          title: 'Sentiment Analyzer',
          description:
            'Score text as positive or negative, one message at a time or thousands at once, with live progress, running totals, and a scrollable list of results.',
          source: readBlockSource('text-insights/sentiment-analyzer'),
          children: <SentimentAnalyzerBlock />,
        },
        {
          slug: 'text-classifier',
          name: 'text-insights/text-classifier',
          title: 'Text Classifier',
          description:
            'Sort text into your own set of labels. Add or remove categories, then see the winning label and how the rest ranked.',
          source: readBlockSource('text-insights/text-classifier'),
          children: <TextClassifierBlock />,
        },
        {
          slug: 'model-evaluator',
          name: 'text-insights/model-evaluator',
          title: 'Model Evaluator',
          description:
            'Measure how accurate a text classifier is on a labeled set, with accuracy, precision, recall, F1, a confusion matrix, and JSON export.',
          source: readBlockSource('text-insights/model-evaluator'),
          children: <ModelEvaluatorBlock />,
        },
        {
          slug: 'threshold-calibrator',
          name: 'text-insights/threshold-calibrator',
          title: 'Threshold Calibrator',
          description:
            'Pick a good similarity cutoff straight from your own examples, and compare it against the built-in default with a view of the score distribution.',
          source: readBlockSource('text-insights/threshold-calibrator'),
          children: <ThresholdCalibratorBlock />,
        },
      ]}
    />
  );
}
