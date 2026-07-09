/**
 * @file page.tsx
 * @description Canonical `/blocks/agents/data-extractor` — the Data Extractor
 * block wrapped in single-block BlockShell chrome. No model bytes download until
 * an explicit in-block action.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { BlockShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { DataExtractorBlock } from './data-extractor';

export const metadata: Metadata = {
  title: 'Data Extractor block - LocalMode UI',
  alternates: { canonical: '/blocks/agents/data-extractor' },
  openGraph: {
    title: 'Data Extractor',
    description: 'Pull structured data out of free text using ready-made templates, with automatic retries when the output does not fit. See the result as a sortable table and a chart built from the numbers it found. It runs its own AI model in the browser and needs a graphics-capable device, and nothing downloads until you load it.',
    url: '/blocks/agents/data-extractor',
    type: 'website',
    images: [ogImageUrl({ title: 'Data Extractor', description: 'Pull structured data out of free text using ready-made templates, with automatic retries when the output does not fit. See the result as a sortable table and a chart built from the numbers it found. It runs its own AI model in the browser and needs a graphics-capable device, and nothing downloads until you load it.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Data Extractor',
    description: 'Pull structured data out of free text using ready-made templates, with automatic retries when the output does not fit. See the result as a sortable table and a chart built from the numbers it found. It runs its own AI model in the browser and needs a graphics-capable device, and nothing downloads until you load it.',
    images: [ogImageUrl({ title: 'Data Extractor', description: 'Pull structured data out of free text using ready-made templates, with automatic retries when the output does not fit. See the result as a sortable table and a chart built from the numbers it found. It runs its own AI model in the browser and needs a graphics-capable device, and nothing downloads until you load it.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function DataExtractorBlockPage() {
  return (
    <BlockShell
      title="Data Extractor"
      description="Pull structured data out of free text using ready-made templates, with automatic retries when the output does not fit. See the result as a sortable table and a chart built from the numbers it found. It runs its own AI model in the browser and needs a graphics-capable device, and nothing downloads until you load it."
      name="agents/data-extractor"
      source={readBlockSource('agents/data-extractor')}
    >
      <DataExtractorBlock />
    </BlockShell>
  );
}
