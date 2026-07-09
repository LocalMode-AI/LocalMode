/**
 * @file page.tsx
 * @description Public `/blocks/device` category page — hosts the three
 * single-purpose device blocks (Device Report, Model Advisor, GGUF Explorer),
 * each in its own BlockShell section with its own install command, Code tab, and
 * `#<slug>` anchor. All three are zero-download; nothing downloads on page open.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { CategoryShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { DeviceReportBlock } from './device-report/device-report';
import { ModelAdvisorBlock } from './model-advisor/model-advisor';
import { GgufExplorerBlock } from './gguf-explorer/gguf-explorer';

export const metadata: Metadata = {
  title: 'Device blocks - LocalMode UI',
  alternates: { canonical: '/blocks/device' },
  openGraph: {
    title: 'Device',
    description: 'Three tools for checking what your device can run, all with nothing to download. See your hardware and browser features, get model recommendations for your device, and browse or inspect GGUF models from HuggingFace.',
    url: '/blocks/device',
    type: 'website',
    images: [ogImageUrl({ title: 'Device', description: 'Three tools for checking what your device can run, all with nothing to download. See your hardware and browser features, get model recommendations for your device, and browse or inspect GGUF models from HuggingFace.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Device',
    description: 'Three tools for checking what your device can run, all with nothing to download. See your hardware and browser features, get model recommendations for your device, and browse or inspect GGUF models from HuggingFace.',
    images: [ogImageUrl({ title: 'Device', description: 'Three tools for checking what your device can run, all with nothing to download. See your hardware and browser features, get model recommendations for your device, and browse or inspect GGUF models from HuggingFace.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function DeviceCategoryPage() {
  return (
    <CategoryShell
      title="Device"
      description="Three tools for checking what your device can run, all with nothing to download. See your hardware and browser features, get model recommendations for your device, and browse or inspect GGUF models from HuggingFace."
      blocks={[
        {
          slug: 'device-report',
          name: 'device/device-report',
          title: 'Device Report',
          description:
            'See what your device and browser can do for on-device AI. It checks your hardware, browser features, and free storage, then tells you whether a small AI model will run here. Nothing is downloaded.',
          source: readBlockSource('device/device-report'),
          children: <DeviceReportBlock />,
        },
        {
          slug: 'model-advisor',
          name: 'device/model-advisor',
          title: 'Model Advisor',
          description:
            'Find the best on-device model for a task on your hardware. Pick a task to get a ranked list of models that fit your device, compare any two side by side, and add your own model to the list. Nothing is downloaded.',
          source: readBlockSource('device/model-advisor'),
          children: <ModelAdvisorBlock />,
        },
        {
          slug: 'gguf-explorer',
          name: 'device/gguf-explorer',
          title: 'GGUF Explorer',
          description:
            'Search over 160,000 GGUF models on HuggingFace and peek inside any file to see its size, details, and whether it will run in your browser. Send a model straight to the chat block when you find one you like. No model download required.',
          source: readBlockSource('device/gguf-explorer'),
          children: <GgufExplorerBlock />,
        },
      ]}
    />
  );
}
