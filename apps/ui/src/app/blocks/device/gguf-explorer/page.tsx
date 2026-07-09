/**
 * @file page.tsx
 * @description Canonical `/blocks/device/gguf-explorer` — the GGUF Explorer block
 * wrapped in single-block BlockShell chrome. HF requests fire only on user
 * interaction; inspection is a ~4KB Range read — no model download.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { BlockShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { GgufExplorerBlock } from './gguf-explorer';

export const metadata: Metadata = {
  title: 'GGUF Explorer block - LocalMode UI',
  alternates: { canonical: '/blocks/device/gguf-explorer' },
  openGraph: {
    title: 'GGUF Explorer',
    description: 'Search over 160,000 GGUF models on HuggingFace and peek inside any file to see its size, details, and whether it will run in your browser. Send a model straight to the chat block when you find one you like. No model download required.',
    url: '/blocks/device/gguf-explorer',
    type: 'website',
    images: [ogImageUrl({ title: 'GGUF Explorer', description: 'Search over 160,000 GGUF models on HuggingFace and peek inside any file to see its size, details, and whether it will run in your browser. Send a model straight to the chat block when you find one you like. No model download required.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GGUF Explorer',
    description: 'Search over 160,000 GGUF models on HuggingFace and peek inside any file to see its size, details, and whether it will run in your browser. Send a model straight to the chat block when you find one you like. No model download required.',
    images: [ogImageUrl({ title: 'GGUF Explorer', description: 'Search over 160,000 GGUF models on HuggingFace and peek inside any file to see its size, details, and whether it will run in your browser. Send a model straight to the chat block when you find one you like. No model download required.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function GgufExplorerBlockPage() {
  return (
    <BlockShell
      title="GGUF Explorer"
      description="Search over 160,000 GGUF models on HuggingFace and peek inside any file to see its size, details, and whether it will run in your browser. Send a model straight to the chat block when you find one you like. No model download required."
      name="device/gguf-explorer"
      source={readBlockSource('device/gguf-explorer')}
    >
      <GgufExplorerBlock />
    </BlockShell>
  );
}
