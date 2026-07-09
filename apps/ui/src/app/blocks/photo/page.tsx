/**
 * @file page.tsx
 * @description Public `/blocks/photo` category page — hosts the four
 * single-purpose photo blocks (Smart Gallery, Image Search, Duplicate Finder,
 * Photo Categorizer), each in its own BlockShell section with its own install
 * command, Code tab, and gated CLIP model load. Nothing downloads on page open;
 * the four blocks share the CLIP model at the browser-cache level.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { CategoryShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { SmartGalleryBlock } from './smart-gallery/smart-gallery';
import { ImageSearchBlock } from './image-search/image-search';
import { DuplicateFinderBlock } from './duplicate-finder/duplicate-finder';
import { PhotoCategorizerBlock } from './photo-categorizer/photo-categorizer';

export const metadata: Metadata = {
  title: 'Photo blocks - LocalMode UI',
  alternates: { canonical: '/blocks/photo' },
  openGraph: {
    title: 'Photo',
    description: 'Four small photo blocks that search, organize, dedupe, and label your images. Each one runs on your device and installs on its own, and nothing downloads until you load a model.',
    url: '/blocks/photo',
    type: 'website',
    images: [ogImageUrl({ title: 'Photo', description: 'Four small photo blocks that search, organize, dedupe, and label your images. Each one runs on your device and installs on its own, and nothing downloads until you load a model.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Photo',
    description: 'Four small photo blocks that search, organize, dedupe, and label your images. Each one runs on your device and installs on its own, and nothing downloads until you load a model.',
    images: [ogImageUrl({ title: 'Photo', description: 'Four small photo blocks that search, organize, dedupe, and label your images. Each one runs on your device and installs on its own, and nothing downloads until you load a model.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function PhotoCategoryPage() {
  return (
    <CategoryShell
      title="Photo"
      description="Four small photo blocks that search, organize, dedupe, and label your images. Each one runs on your device and installs on its own, and nothing downloads until you load a model."
      blocks={[
        {
          slug: 'smart-gallery',
          name: 'photo/smart-gallery',
          title: 'Smart Gallery',
          description:
            'Build a photo library in the browser that tags every image automatically as you add it, shown as a grid or list you can filter, sort, and clear.',
          source: readBlockSource('photo/smart-gallery'),
          children: <SmartGalleryBlock />,
        },
        {
          slug: 'image-search',
          name: 'photo/image-search',
          title: 'Image Search',
          description:
            'Search your photos by typing what you are looking for, or by dropping in a reference image, with a top results count and an adjustable match threshold.',
          source: readBlockSource('photo/image-search'),
          children: <ImageSearchBlock />,
        },
        {
          slug: 'duplicate-finder',
          name: 'photo/duplicate-finder',
          title: 'Duplicate Finder',
          description:
            'Find near-duplicate photos and group them together, with a match strength you can tune, quick presets, and one-click bulk delete that keeps the first of each group.',
          source: readBlockSource('photo/duplicate-finder'),
          children: <DuplicateFinderBlock />,
        },
        {
          slug: 'photo-categorizer',
          name: 'photo/photo-categorizer',
          title: 'Photo Categorizer',
          description:
            'Sort photos into your own set of categories, edit the label list, re-sort the whole library at once, and filter by any single category.',
          source: readBlockSource('photo/photo-categorizer'),
          children: <PhotoCategorizerBlock />,
        },
      ]}
    />
  );
}
