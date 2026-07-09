/**
 * @file page.tsx
 * @description Public `/blocks/vision` — the Vision category page hosting the
 * object-detector and live-tracker blocks, each in its own BlockShell (own
 * Preview/Code + install command + `#<slug>` anchor). Every block gates its own
 * model load, so nothing downloads on page open. Supersedes `/blocks/vision-lab`
 * (which now 308-redirects here).
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { CategoryShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { ObjectDetectorBlock } from './object-detector/object-detector';
import { LiveTrackerBlock } from './live-tracker/live-tracker';

export const metadata: Metadata = {
  title: 'Vision blocks - LocalMode UI',
  alternates: { canonical: '/blocks/vision' },
  openGraph: {
    title: 'Vision',
    description: 'Computer-vision tools that run entirely in your browser. Detect objects in a photo and track hands, pose, face, and gestures live. Models download only when you start a block.',
    url: '/blocks/vision',
    type: 'website',
    images: [ogImageUrl({ title: 'Vision', description: 'Computer-vision tools that run entirely in your browser. Detect objects in a photo and track hands, pose, face, and gestures live. Models download only when you start a block.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Vision',
    description: 'Computer-vision tools that run entirely in your browser. Detect objects in a photo and track hands, pose, face, and gestures live. Models download only when you start a block.',
    images: [ogImageUrl({ title: 'Vision', description: 'Computer-vision tools that run entirely in your browser. Detect objects in a photo and track hands, pose, face, and gestures live. Models download only when you start a block.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function VisionCategoryPage() {
  return (
    <CategoryShell
      title="Vision"
      description="Computer-vision tools that run entirely in your browser. Detect objects in a photo and track hands, pose, face, and gestures live. Models download only when you start a block."
      blocks={[
        {
          slug: 'object-detector',
          name: 'vision/object-detector',
          title: 'Object Detector',
          description:
            'Find and label objects in a photo or webcam still with colored boxes, plus a live face-tracking camera mode.',
          source: readBlockSource('vision/object-detector'),
          children: <ObjectDetectorBlock />,
        },
        {
          slug: 'live-tracker',
          name: 'vision/live-tracker',
          title: 'Live Tracker',
          description:
            'Track hands, full-body pose, a detailed face mesh, and gestures live through your webcam.',
          source: readBlockSource('vision/live-tracker'),
          children: <LiveTrackerBlock />,
        },
      ]}
    />
  );
}
