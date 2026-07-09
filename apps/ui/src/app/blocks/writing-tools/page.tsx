/**
 * @file page.tsx
 * @description Public `/blocks/writing-tools` category page — hosts the four
 * single-purpose writing blocks (Write, Translate, Summarize, Complete), each in
 * its own BlockShell section with its own install command, Code tab, and gated
 * model load. No model bytes download on page open.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { CategoryShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { WriteBlock } from './write/write';
import { TranslateBlock } from './translate/translate';
import { SummarizeBlock } from './summarize/summarize';
import { CompleteBlock } from './complete/complete';

export const metadata: Metadata = {
  title: 'Writing Tools blocks - LocalMode UI',
  alternates: { canonical: '/blocks/writing-tools' },
  openGraph: {
    title: 'Writing Tools',
    description: "Four small writing helpers you can install on their own. They use your browser's built-in AI when it is available and fall back to a downloadable model otherwise, and nothing runs until you ask.",
    url: '/blocks/writing-tools',
    type: 'website',
    images: [ogImageUrl({ title: 'Writing Tools', description: "Four small writing helpers you can install on their own. They use your browser's built-in AI when it is available and fall back to a downloadable model otherwise, and nothing runs until you ask.", eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Writing Tools',
    description: "Four small writing helpers you can install on their own. They use your browser's built-in AI when it is available and fall back to a downloadable model otherwise, and nothing runs until you ask.",
    images: [ogImageUrl({ title: 'Writing Tools', description: "Four small writing helpers you can install on their own. They use your browser's built-in AI when it is available and fall back to a downloadable model otherwise, and nothing runs until you ask.", eyebrow: 'LocalMode Blocks' })],
  },
};

export default function WritingToolsCategoryPage() {
  return (
    <CategoryShell
      title="Writing Tools"
      description="Four small writing helpers you can install on their own. They use your browser's built-in AI when it is available and fall back to a downloadable model otherwise, and nothing runs until you ask."
      blocks={[
        {
          slug: 'write',
          name: 'writing-tools/write',
          title: 'Write',
          description:
            'Rewrite or edit a draft with an AI suggestion you review as a before/after diff, then accept or reject the change.',
          source: readBlockSource('writing-tools/write'),
          children: <WriteBlock />,
        },
        {
          slug: 'translate',
          name: 'writing-tools/translate',
          title: 'Translate',
          description:
            'Translate text between 24 language pairs, swap the direction with one click, and copy the result.',
          source: readBlockSource('writing-tools/translate'),
          children: <TranslateBlock />,
        },
        {
          slug: 'summarize',
          name: 'writing-tools/summarize',
          title: 'Summarize',
          description:
            'Shorten long text into a summary, choosing a short, medium, or long length and either a pulled-from-the-text or reworded style.',
          source: readBlockSource('writing-tools/summarize'),
          children: <SummarizeBlock />,
        },
        {
          slug: 'complete',
          name: 'writing-tools/complete',
          title: 'Complete',
          description:
            'Fill in a blank word in your sentence with the top suggestions, then click one to apply it and keep going.',
          source: readBlockSource('writing-tools/complete'),
          children: <CompleteBlock />,
        },
      ]}
    />
  );
}
