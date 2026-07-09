/**
 * @file page.tsx
 * @description Canonical `/blocks/photo/duplicate-finder` — the Duplicate Finder
 * block wrapped in single-block BlockShell chrome. No model bytes download until
 * an explicit in-block action.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { BlockShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { DuplicateFinderBlock } from './duplicate-finder';

export const metadata: Metadata = {
  title: 'Duplicate Finder block - LocalMode UI',
  alternates: { canonical: '/blocks/photo/duplicate-finder' },
  openGraph: {
    title: 'Duplicate Finder',
    description: "Load a photo library on your device, then find and group near-duplicate images. Tune how close a match has to be with quick presets, review each group's average similarity, and bulk-delete the extras while keeping the first of each group. Nothing downloads until you load a model.",
    url: '/blocks/photo/duplicate-finder',
    type: 'website',
    images: [ogImageUrl({ title: 'Duplicate Finder', description: "Load a photo library on your device, then find and group near-duplicate images. Tune how close a match has to be with quick presets, review each group's average similarity, and bulk-delete the extras while keeping the first of each group. Nothing downloads until you load a model.", eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Duplicate Finder',
    description: "Load a photo library on your device, then find and group near-duplicate images. Tune how close a match has to be with quick presets, review each group's average similarity, and bulk-delete the extras while keeping the first of each group. Nothing downloads until you load a model.",
    images: [ogImageUrl({ title: 'Duplicate Finder', description: "Load a photo library on your device, then find and group near-duplicate images. Tune how close a match has to be with quick presets, review each group's average similarity, and bulk-delete the extras while keeping the first of each group. Nothing downloads until you load a model.", eyebrow: 'LocalMode Blocks' })],
  },
};

export default function DuplicateFinderBlockPage() {
  return (
    <BlockShell
      title="Duplicate Finder"
      description="Load a photo library on your device, then find and group near-duplicate images. Tune how close a match has to be with quick presets, review each group's average similarity, and bulk-delete the extras while keeping the first of each group. Nothing downloads until you load a model."
      name="photo/duplicate-finder"
      source={readBlockSource('photo/duplicate-finder')}
    >
      <DuplicateFinderBlock />
    </BlockShell>
  );
}
