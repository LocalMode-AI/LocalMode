/**
 * @file page.tsx
 * @description Public `/blocks/agents` category page — hosts the two
 * single-purpose agent blocks (Research Agent, Data Extractor), each in its own
 * BlockShell section with its own install command, Code tab, and gated model
 * load. No model bytes download on page open.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { CategoryShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { ResearchAgentBlock } from './research-agent/research-agent';
import { DataExtractorBlock } from './data-extractor/data-extractor';

export const metadata: Metadata = {
  title: 'Agents blocks - LocalMode UI',
  alternates: { canonical: '/blocks/agents' },
  openGraph: {
    title: 'Agents',
    description: 'Two small agent blocks you can install on their own. Each one runs its own AI model in the browser and needs a graphics-capable device, and nothing downloads until you load it.',
    url: '/blocks/agents',
    type: 'website',
    images: [ogImageUrl({ title: 'Agents', description: 'Two small agent blocks you can install on their own. Each one runs its own AI model in the browser and needs a graphics-capable device, and nothing downloads until you load it.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Agents',
    description: 'Two small agent blocks you can install on their own. Each one runs its own AI model in the browser and needs a graphics-capable device, and nothing downloads until you load it.',
    images: [ogImageUrl({ title: 'Agents', description: 'Two small agent blocks you can install on their own. Each one runs its own AI model in the browser and needs a graphics-capable device, and nothing downloads until you load it.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function AgentsCategoryPage() {
  return (
    <CategoryShell
      title="Agents"
      description="Two small agent blocks you can install on their own. Each one runs its own AI model in the browser and needs a graphics-capable device, and nothing downloads until you load it."
      blocks={[
        {
          slug: 'research-agent',
          name: 'agents/research-agent',
          title: 'Research Agent',
          description:
            'An agent that answers a question by using tools step by step, pausing for your approval before each tool runs, with a timeline of what it did.',
          source: readBlockSource('agents/research-agent'),
          children: <ResearchAgentBlock />,
        },
        {
          slug: 'data-extractor',
          name: 'agents/data-extractor',
          title: 'Data Extractor',
          description:
            'Pull structured data out of free text using ready-made templates, then view it as a sortable table and a chart built from the numbers it found.',
          source: readBlockSource('agents/data-extractor'),
          children: <DataExtractorBlock />,
        },
      ]}
    />
  );
}
