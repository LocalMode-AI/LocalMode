/**
 * @file page.tsx
 * @description Canonical `/blocks/photo/image-search` — the Image Search block
 * wrapped in single-block BlockShell chrome. No model bytes download until an
 * explicit in-block action.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { BlockShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { ImageSearchBlock } from './image-search';

export const metadata: Metadata = {
  title: 'Image Search block - LocalMode UI',
  alternates: { canonical: '/blocks/photo/image-search' },
  openGraph: {
    title: 'Image Search',
    description: 'Search a photo library on your device by typing what you are looking for, or by dropping in a reference image. Both search the same photos, with a control for how many results to show and a minimum match threshold. Nothing downloads until you load a model.',
    url: '/blocks/photo/image-search',
    type: 'website',
    images: [ogImageUrl({ title: 'Image Search', description: 'Search a photo library on your device by typing what you are looking for, or by dropping in a reference image. Both search the same photos, with a control for how many results to show and a minimum match threshold. Nothing downloads until you load a model.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Image Search',
    description: 'Search a photo library on your device by typing what you are looking for, or by dropping in a reference image. Both search the same photos, with a control for how many results to show and a minimum match threshold. Nothing downloads until you load a model.',
    images: [ogImageUrl({ title: 'Image Search', description: 'Search a photo library on your device by typing what you are looking for, or by dropping in a reference image. Both search the same photos, with a control for how many results to show and a minimum match threshold. Nothing downloads until you load a model.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function ImageSearchBlockPage() {
  return (
    <BlockShell
      title="Image Search"
      description="Search a photo library on your device by typing what you are looking for, or by dropping in a reference image. Both search the same photos, with a control for how many results to show and a minimum match threshold. Nothing downloads until you load a model."
      name="photo/image-search"
      source={readBlockSource('photo/image-search')}
    >
      <ImageSearchBlock />
    </BlockShell>
  );
}
