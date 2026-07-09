/**
 * @file page.tsx
 * @description Canonical `/blocks/image-studio/image-captioner` page — the
 * ImageCaptionerBlock in BlockShell chrome. ViT-GPT2 alt-text over an
 * accumulating gallery; the model loads lazily on the first dropped image.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { BlockShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { ImageCaptionerBlock } from './image-captioner';

export const metadata: Metadata = {
  title: 'Image Captioner block - LocalMode UI',
  alternates: { canonical: '/blocks/image-studio/image-captioner' },
  openGraph: {
    title: 'Image Captioner',
    description: 'Automatically write a short description (alt-text) for any image. Drop in JPEG, PNG, WebP, or GIF files up to 10MB and your captions build up in a gallery you can copy from, remove single items, or clear all at once. Everything runs in your browser, and nothing downloads until you add your first image.',
    url: '/blocks/image-studio/image-captioner',
    type: 'website',
    images: [ogImageUrl({ title: 'Image Captioner', description: 'Automatically write a short description (alt-text) for any image. Drop in JPEG, PNG, WebP, or GIF files up to 10MB and your captions build up in a gallery you can copy from, remove single items, or clear all at once. Everything runs in your browser, and nothing downloads until you add your first image.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Image Captioner',
    description: 'Automatically write a short description (alt-text) for any image. Drop in JPEG, PNG, WebP, or GIF files up to 10MB and your captions build up in a gallery you can copy from, remove single items, or clear all at once. Everything runs in your browser, and nothing downloads until you add your first image.',
    images: [ogImageUrl({ title: 'Image Captioner', description: 'Automatically write a short description (alt-text) for any image. Drop in JPEG, PNG, WebP, or GIF files up to 10MB and your captions build up in a gallery you can copy from, remove single items, or clear all at once. Everything runs in your browser, and nothing downloads until you add your first image.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function ImageCaptionerBlockPage() {
  return (
    <BlockShell
      title="Image Captioner"
      description="Automatically write a short description (alt-text) for any image. Drop in JPEG, PNG, WebP, or GIF files up to 10MB and your captions build up in a gallery you can copy from, remove single items, or clear all at once. Everything runs in your browser, and nothing downloads until you add your first image."
      name="image-studio/image-captioner"
      source={readBlockSource('image-studio/image-captioner')}
    >
      <ImageCaptionerBlock />
    </BlockShell>
  );
}
