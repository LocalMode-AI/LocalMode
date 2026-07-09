/**
 * @file page.tsx
 * @description Canonical `/blocks/writing-tools/write` — the Write block wrapped
 * in single-block BlockShell chrome. No model bytes download until an explicit
 * in-block action.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { BlockShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { WriteBlock } from './write';

export const metadata: Metadata = {
  title: 'Write block - LocalMode UI',
  alternates: { canonical: '/blocks/writing-tools/write' },
  openGraph: {
    title: 'Write',
    description: "Rewrite or improve a draft with an AI edit you review as a before/after diff, then accept or reject it. Use quick presets or write your own instructions, with a live word count. It uses your browser's built-in AI when available, or a small downloadable model otherwise, and nothing downloads until you ask.",
    url: '/blocks/writing-tools/write',
    type: 'website',
    images: [ogImageUrl({ title: 'Write', description: "Rewrite or improve a draft with an AI edit you review as a before/after diff, then accept or reject it. Use quick presets or write your own instructions, with a live word count. It uses your browser's built-in AI when available, or a small downloadable model otherwise, and nothing downloads until you ask.", eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Write',
    description: "Rewrite or improve a draft with an AI edit you review as a before/after diff, then accept or reject it. Use quick presets or write your own instructions, with a live word count. It uses your browser's built-in AI when available, or a small downloadable model otherwise, and nothing downloads until you ask.",
    images: [ogImageUrl({ title: 'Write', description: "Rewrite or improve a draft with an AI edit you review as a before/after diff, then accept or reject it. Use quick presets or write your own instructions, with a live word count. It uses your browser's built-in AI when available, or a small downloadable model otherwise, and nothing downloads until you ask.", eyebrow: 'LocalMode Blocks' })],
  },
};

export default function WriteBlockPage() {
  return (
    <BlockShell
      title="Write"
      description="Rewrite or improve a draft with an AI edit you review as a before/after diff, then accept or reject it. Use quick presets or write your own instructions, with a live word count. It uses your browser's built-in AI when available, or a small downloadable model otherwise, and nothing downloads until you ask."
      name="writing-tools/write"
      source={readBlockSource('writing-tools/write')}
    >
      <WriteBlock />
    </BlockShell>
  );
}
