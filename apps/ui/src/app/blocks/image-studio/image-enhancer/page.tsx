/**
 * @file page.tsx
 * @description Canonical `/blocks/image-studio/image-enhancer` page — the
 * ImageEnhancerBlock in BlockShell chrome. Swin2SR super-resolution with a
 * 2x / 4x / Restore mode picker; each mode's model loads lazily on first use.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { BlockShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { ImageEnhancerBlock } from './image-enhancer';

export const metadata: Metadata = {
  title: 'Image Enhancer block - LocalMode UI',
  alternates: { canonical: '/blocks/image-studio/image-enhancer' },
  openGraph: {
    title: 'Image Enhancer',
    description: 'Upscale and sharpen photos to make them larger and clearer. Choose a fast 2x mode, a higher-quality 4x mode, or a restore mode for real-world low-quality images, then compare before and after and download the result. Everything runs in your browser, and nothing downloads until you drop in an image.',
    url: '/blocks/image-studio/image-enhancer',
    type: 'website',
    images: [ogImageUrl({ title: 'Image Enhancer', description: 'Upscale and sharpen photos to make them larger and clearer. Choose a fast 2x mode, a higher-quality 4x mode, or a restore mode for real-world low-quality images, then compare before and after and download the result. Everything runs in your browser, and nothing downloads until you drop in an image.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Image Enhancer',
    description: 'Upscale and sharpen photos to make them larger and clearer. Choose a fast 2x mode, a higher-quality 4x mode, or a restore mode for real-world low-quality images, then compare before and after and download the result. Everything runs in your browser, and nothing downloads until you drop in an image.',
    images: [ogImageUrl({ title: 'Image Enhancer', description: 'Upscale and sharpen photos to make them larger and clearer. Choose a fast 2x mode, a higher-quality 4x mode, or a restore mode for real-world low-quality images, then compare before and after and download the result. Everything runs in your browser, and nothing downloads until you drop in an image.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function ImageEnhancerBlockPage() {
  return (
    <BlockShell
      title="Image Enhancer"
      description="Upscale and sharpen photos to make them larger and clearer. Choose a fast 2x mode, a higher-quality 4x mode, or a restore mode for real-world low-quality images, then compare before and after and download the result. Everything runs in your browser, and nothing downloads until you drop in an image."
      name="image-studio/image-enhancer"
      source={readBlockSource('image-studio/image-enhancer')}
    >
      <ImageEnhancerBlock />
    </BlockShell>
  );
}
