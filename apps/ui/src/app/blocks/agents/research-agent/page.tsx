/**
 * @file page.tsx
 * @description Canonical `/blocks/agents/research-agent` — the Research Agent
 * block wrapped in single-block BlockShell chrome. No model bytes download until
 * an explicit in-block action.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { BlockShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { ResearchAgentBlock } from './research-agent';

export const metadata: Metadata = {
  title: 'Research Agent block - LocalMode UI',
  alternates: { canonical: '/blocks/agents/research-agent' },
  openGraph: {
    title: 'Research Agent',
    description: 'An agent that answers a question by using tools step by step, pausing for your approval before each tool runs so you stay in control. A timeline shows every step it took. It runs its own AI model in the browser and needs a graphics-capable device, and nothing downloads until you load it.',
    url: '/blocks/agents/research-agent',
    type: 'website',
    images: [ogImageUrl({ title: 'Research Agent', description: 'An agent that answers a question by using tools step by step, pausing for your approval before each tool runs so you stay in control. A timeline shows every step it took. It runs its own AI model in the browser and needs a graphics-capable device, and nothing downloads until you load it.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Research Agent',
    description: 'An agent that answers a question by using tools step by step, pausing for your approval before each tool runs so you stay in control. A timeline shows every step it took. It runs its own AI model in the browser and needs a graphics-capable device, and nothing downloads until you load it.',
    images: [ogImageUrl({ title: 'Research Agent', description: 'An agent that answers a question by using tools step by step, pausing for your approval before each tool runs so you stay in control. A timeline shows every step it took. It runs its own AI model in the browser and needs a graphics-capable device, and nothing downloads until you load it.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function ResearchAgentBlockPage() {
  return (
    <BlockShell
      title="Research Agent"
      description="An agent that answers a question by using tools step by step, pausing for your approval before each tool runs so you stay in control. A timeline shows every step it took. It runs its own AI model in the browser and needs a graphics-capable device, and nothing downloads until you load it."
      name="agents/research-agent"
      source={readBlockSource('agents/research-agent')}
    >
      <ResearchAgentBlock />
    </BlockShell>
  );
}
