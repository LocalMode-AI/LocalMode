/**
 * @file page.tsx
 * @description Canonical `/blocks/photo/photo-categorizer` — the Photo
 * Categorizer block wrapped in single-block BlockShell chrome. No model bytes
 * download until an explicit in-block action.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { BlockShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { PhotoCategorizerBlock } from './photo-categorizer';

export const metadata: Metadata = {
  title: 'Photo Categorizer block - LocalMode UI',
  alternates: { canonical: '/blocks/photo/photo-categorizer' },
  openGraph: {
    title: 'Photo Categorizer',
    description: 'Add photos to a browser library where each one is sorted into a category as it loads. Edit the label list, re-sort the whole library at once, and filter down to any single category. Nothing downloads until you load a model.',
    url: '/blocks/photo/photo-categorizer',
    type: 'website',
    images: [ogImageUrl({ title: 'Photo Categorizer', description: 'Add photos to a browser library where each one is sorted into a category as it loads. Edit the label list, re-sort the whole library at once, and filter down to any single category. Nothing downloads until you load a model.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Photo Categorizer',
    description: 'Add photos to a browser library where each one is sorted into a category as it loads. Edit the label list, re-sort the whole library at once, and filter down to any single category. Nothing downloads until you load a model.',
    images: [ogImageUrl({ title: 'Photo Categorizer', description: 'Add photos to a browser library where each one is sorted into a category as it loads. Edit the label list, re-sort the whole library at once, and filter down to any single category. Nothing downloads until you load a model.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function PhotoCategorizerBlockPage() {
  return (
    <BlockShell
      title="Photo Categorizer"
      description="Add photos to a browser library where each one is sorted into a category as it loads. Edit the label list, re-sort the whole library at once, and filter down to any single category. Nothing downloads until you load a model."
      name="photo/photo-categorizer"
      source={readBlockSource('photo/photo-categorizer')}
    >
      <PhotoCategorizerBlock />
    </BlockShell>
  );
}
