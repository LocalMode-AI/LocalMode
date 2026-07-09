/**
 * @file page.tsx
 * @description Public `/blocks/image-studio` category page — hosts the three
 * split image blocks (Background Remover, Image Enhancer, Image Captioner), each
 * in its own BlockShell. Every block gates its own model load; nothing downloads
 * on page open even with all three previews mounted.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { CategoryShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { BackgroundRemoverBlock } from './background-remover/background-remover';
import { ImageEnhancerBlock } from './image-enhancer/image-enhancer';
import { ImageCaptionerBlock } from './image-captioner/image-captioner';

export const metadata: Metadata = {
  title: 'Image Studio - LocalMode UI',
  alternates: { canonical: '/blocks/image-studio' },
  openGraph: {
    title: 'Image Studio',
    description: 'Image tools that run entirely in your browser. Remove backgrounds, upscale and restore photos, and generate captions. Each tool is self-contained and loads its model only when you first use it.',
    url: '/blocks/image-studio',
    type: 'website',
    images: [ogImageUrl({ title: 'Image Studio', description: 'Image tools that run entirely in your browser. Remove backgrounds, upscale and restore photos, and generate captions. Each tool is self-contained and loads its model only when you first use it.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Image Studio',
    description: 'Image tools that run entirely in your browser. Remove backgrounds, upscale and restore photos, and generate captions. Each tool is self-contained and loads its model only when you first use it.',
    images: [ogImageUrl({ title: 'Image Studio', description: 'Image tools that run entirely in your browser. Remove backgrounds, upscale and restore photos, and generate captions. Each tool is self-contained and loads its model only when you first use it.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function ImageStudioCategoryPage() {
  return (
    <CategoryShell
      title="Image Studio"
      description="Image tools that run entirely in your browser. Remove backgrounds, upscale and restore photos, and generate captions. Each tool is self-contained and loads its model only when you first use it."
      blocks={[
        {
          slug: 'background-remover',
          name: 'image-studio/background-remover',
          title: 'Background Remover',
          description:
            'Cut the subject out of a photo and download it as a clean transparent PNG.',
          source: readBlockSource('image-studio/background-remover'),
          children: <BackgroundRemoverBlock />,
        },
        {
          slug: 'image-enhancer',
          name: 'image-studio/image-enhancer',
          title: 'Image Enhancer',
          description:
            'Upscale and sharpen photos, with a before-and-after compare and a download.',
          source: readBlockSource('image-studio/image-enhancer'),
          children: <ImageEnhancerBlock />,
        },
        {
          slug: 'image-captioner',
          name: 'image-studio/image-captioner',
          title: 'Image Captioner',
          description:
            'Auto-write short alt-text captions for images and collect them in a gallery.',
          source: readBlockSource('image-studio/image-captioner'),
          children: <ImageCaptionerBlock />,
        },
      ]}
    />
  );
}
