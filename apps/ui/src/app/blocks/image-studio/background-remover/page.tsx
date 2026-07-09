/**
 * @file page.tsx
 * @description Canonical `/blocks/image-studio/background-remover` page — the
 * BackgroundRemoverBlock in BlockShell chrome. SegFormer segmentation →
 * transparent-background PNG; the model loads lazily on the first dropped image.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { BlockShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { BackgroundRemoverBlock } from './background-remover';

export const metadata: Metadata = {
  title: 'Background Remover block - LocalMode UI',
  alternates: { canonical: '/blocks/image-studio/background-remover' },
  openGraph: {
    title: 'Background Remover',
    description: 'Remove the background from a photo and get a clean, transparent PNG you can download. It automatically finds the main subject, cuts it out, and shows the result next to the original on a checkerboard. Everything runs in your browser, and nothing downloads until you drop in an image.',
    url: '/blocks/image-studio/background-remover',
    type: 'website',
    images: [ogImageUrl({ title: 'Background Remover', description: 'Remove the background from a photo and get a clean, transparent PNG you can download. It automatically finds the main subject, cuts it out, and shows the result next to the original on a checkerboard. Everything runs in your browser, and nothing downloads until you drop in an image.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Background Remover',
    description: 'Remove the background from a photo and get a clean, transparent PNG you can download. It automatically finds the main subject, cuts it out, and shows the result next to the original on a checkerboard. Everything runs in your browser, and nothing downloads until you drop in an image.',
    images: [ogImageUrl({ title: 'Background Remover', description: 'Remove the background from a photo and get a clean, transparent PNG you can download. It automatically finds the main subject, cuts it out, and shows the result next to the original on a checkerboard. Everything runs in your browser, and nothing downloads until you drop in an image.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function BackgroundRemoverBlockPage() {
  return (
    <BlockShell
      title="Background Remover"
      description="Remove the background from a photo and get a clean, transparent PNG you can download. It automatically finds the main subject, cuts it out, and shows the result next to the original on a checkerboard. Everything runs in your browser, and nothing downloads until you drop in an image."
      name="image-studio/background-remover"
      source={readBlockSource('image-studio/background-remover')}
    >
      <BackgroundRemoverBlock />
    </BlockShell>
  );
}
