/**
 * @file page.tsx
 * @description Public /blocks/vision/object-detector — the ObjectDetectorBlock in BlockShell chrome.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { BlockShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { ObjectDetectorBlock } from './object-detector';

export const metadata: Metadata = {
  title: 'Object Detector block - LocalMode UI',
  alternates: { canonical: '/blocks/vision/object-detector' },
  openGraph: {
    title: 'Object Detector',
    description: 'Find and label objects in a photo, drawing a colored box around each one with its name and confidence. Use an uploaded image, the built-in sample, or a still from your webcam, plus a live camera mode that tracks faces in real time. Everything runs in your browser, and the camera asks permission before it starts.',
    url: '/blocks/vision/object-detector',
    type: 'website',
    images: [ogImageUrl({ title: 'Object Detector', description: 'Find and label objects in a photo, drawing a colored box around each one with its name and confidence. Use an uploaded image, the built-in sample, or a still from your webcam, plus a live camera mode that tracks faces in real time. Everything runs in your browser, and the camera asks permission before it starts.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Object Detector',
    description: 'Find and label objects in a photo, drawing a colored box around each one with its name and confidence. Use an uploaded image, the built-in sample, or a still from your webcam, plus a live camera mode that tracks faces in real time. Everything runs in your browser, and the camera asks permission before it starts.',
    images: [ogImageUrl({ title: 'Object Detector', description: 'Find and label objects in a photo, drawing a colored box around each one with its name and confidence. Use an uploaded image, the built-in sample, or a still from your webcam, plus a live camera mode that tracks faces in real time. Everything runs in your browser, and the camera asks permission before it starts.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function ObjectDetectorBlockPage() {
  return (
    <BlockShell
      title="Object Detector"
      description="Find and label objects in a photo, drawing a colored box around each one with its name and confidence. Use an uploaded image, the built-in sample, or a still from your webcam, plus a live camera mode that tracks faces in real time. Everything runs in your browser, and the camera asks permission before it starts."
      name="vision/object-detector"
      source={readBlockSource('vision/object-detector')}
    >
      <ObjectDetectorBlock />
    </BlockShell>
  );
}
