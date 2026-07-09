/**
 * @file page.tsx
 * @description Canonical `/blocks/device/device-report` — the Device Report block
 * wrapped in single-block BlockShell chrome. Renders entirely from browser APIs —
 * zero network, zero model bytes.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { BlockShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { DeviceReportBlock } from './device-report';

export const metadata: Metadata = {
  title: 'Device Report block - LocalMode UI',
  alternates: { canonical: '/blocks/device/device-report' },
  openGraph: {
    title: 'Device Report',
    description: 'See what your device and browser can do for on-device AI. It checks your hardware, browser features, and free storage, then tells you whether a small AI model will run here. Nothing is downloaded.',
    url: '/blocks/device/device-report',
    type: 'website',
    images: [ogImageUrl({ title: 'Device Report', description: 'See what your device and browser can do for on-device AI. It checks your hardware, browser features, and free storage, then tells you whether a small AI model will run here. Nothing is downloaded.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Device Report',
    description: 'See what your device and browser can do for on-device AI. It checks your hardware, browser features, and free storage, then tells you whether a small AI model will run here. Nothing is downloaded.',
    images: [ogImageUrl({ title: 'Device Report', description: 'See what your device and browser can do for on-device AI. It checks your hardware, browser features, and free storage, then tells you whether a small AI model will run here. Nothing is downloaded.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function DeviceReportBlockPage() {
  return (
    <BlockShell
      title="Device Report"
      description="See what your device and browser can do for on-device AI. It checks your hardware, browser features, and free storage, then tells you whether a small AI model will run here. Nothing is downloaded."
      name="device/device-report"
      source={readBlockSource('device/device-report')}
    >
      <DeviceReportBlock />
    </BlockShell>
  );
}
