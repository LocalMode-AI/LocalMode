/**
 * @file page.tsx
 * @description Public /blocks/vision/live-tracker — the LiveTrackerBlock in BlockShell chrome.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { BlockShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { LiveTrackerBlock } from './live-tracker';

export const metadata: Metadata = {
  title: 'Live Tracker block - LocalMode UI',
  alternates: { canonical: '/blocks/vision/live-tracker' },
  openGraph: {
    title: 'Live Tracker',
    description: 'Track your body in real time through the webcam. Pick from four live modes: hand skeletons, full-body pose, a detailed face mesh with expressions, and hand-gesture recognition, all drawn on the video with a live frame rate. Everything runs in your browser, and the camera asks permission before it starts.',
    url: '/blocks/vision/live-tracker',
    type: 'website',
    images: [ogImageUrl({ title: 'Live Tracker', description: 'Track your body in real time through the webcam. Pick from four live modes: hand skeletons, full-body pose, a detailed face mesh with expressions, and hand-gesture recognition, all drawn on the video with a live frame rate. Everything runs in your browser, and the camera asks permission before it starts.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Live Tracker',
    description: 'Track your body in real time through the webcam. Pick from four live modes: hand skeletons, full-body pose, a detailed face mesh with expressions, and hand-gesture recognition, all drawn on the video with a live frame rate. Everything runs in your browser, and the camera asks permission before it starts.',
    images: [ogImageUrl({ title: 'Live Tracker', description: 'Track your body in real time through the webcam. Pick from four live modes: hand skeletons, full-body pose, a detailed face mesh with expressions, and hand-gesture recognition, all drawn on the video with a live frame rate. Everything runs in your browser, and the camera asks permission before it starts.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function LiveTrackerBlockPage() {
  return (
    <BlockShell
      title="Live Tracker"
      description="Track your body in real time through the webcam. Pick from four live modes: hand skeletons, full-body pose, a detailed face mesh with expressions, and hand-gesture recognition, all drawn on the video with a live frame rate. Everything runs in your browser, and the camera asks permission before it starts."
      name="vision/live-tracker"
      source={readBlockSource('vision/live-tracker')}
    >
      <LiveTrackerBlock />
    </BlockShell>
  );
}
