/**
 * @file page.tsx
 * @description Canonical `/blocks/photo/smart-gallery` — the Smart Gallery block
 * wrapped in single-block BlockShell chrome. No model bytes download until an
 * explicit in-block action.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { BlockShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { SmartGalleryBlock } from './smart-gallery';

export const metadata: Metadata = {
  title: 'Smart Gallery block - LocalMode UI',
  alternates: { canonical: '/blocks/photo/smart-gallery' },
  openGraph: {
    title: 'Smart Gallery',
    description: 'Build a photo library right in your browser that tags every image automatically as you add it. Browse it as a grid or list with filename, category, confidence, and how many similar photos it found, and delete, clear, or cancel at any time. Nothing downloads until you load a model.',
    url: '/blocks/photo/smart-gallery',
    type: 'website',
    images: [ogImageUrl({ title: 'Smart Gallery', description: 'Build a photo library right in your browser that tags every image automatically as you add it. Browse it as a grid or list with filename, category, confidence, and how many similar photos it found, and delete, clear, or cancel at any time. Nothing downloads until you load a model.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Smart Gallery',
    description: 'Build a photo library right in your browser that tags every image automatically as you add it. Browse it as a grid or list with filename, category, confidence, and how many similar photos it found, and delete, clear, or cancel at any time. Nothing downloads until you load a model.',
    images: [ogImageUrl({ title: 'Smart Gallery', description: 'Build a photo library right in your browser that tags every image automatically as you add it. Browse it as a grid or list with filename, category, confidence, and how many similar photos it found, and delete, clear, or cancel at any time. Nothing downloads until you load a model.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function SmartGalleryBlockPage() {
  return (
    <BlockShell
      title="Smart Gallery"
      description="Build a photo library right in your browser that tags every image automatically as you add it. Browse it as a grid or list with filename, category, confidence, and how many similar photos it found, and delete, clear, or cancel at any time. Nothing downloads until you load a model."
      name="photo/smart-gallery"
      source={readBlockSource('photo/smart-gallery')}
    >
      <SmartGalleryBlock />
    </BlockShell>
  );
}
