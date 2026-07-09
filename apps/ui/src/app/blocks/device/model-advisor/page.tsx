/**
 * @file page.tsx
 * @description Canonical `/blocks/device/model-advisor` — the Model Advisor block
 * wrapped in single-block BlockShell chrome. Recommendations come from the
 * in-memory registry; zero network, no model download.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { BlockShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { ModelAdvisorBlock } from './model-advisor';

export const metadata: Metadata = {
  title: 'Model Advisor block - LocalMode UI',
  alternates: { canonical: '/blocks/device/model-advisor' },
  openGraph: {
    title: 'Model Advisor',
    description: 'Find the best on-device model for a task on your hardware. Pick a task to get a ranked list of models that fit your device, compare any two side by side, and add your own model to the list. Nothing is downloaded.',
    url: '/blocks/device/model-advisor',
    type: 'website',
    images: [ogImageUrl({ title: 'Model Advisor', description: 'Find the best on-device model for a task on your hardware. Pick a task to get a ranked list of models that fit your device, compare any two side by side, and add your own model to the list. Nothing is downloaded.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Model Advisor',
    description: 'Find the best on-device model for a task on your hardware. Pick a task to get a ranked list of models that fit your device, compare any two side by side, and add your own model to the list. Nothing is downloaded.',
    images: [ogImageUrl({ title: 'Model Advisor', description: 'Find the best on-device model for a task on your hardware. Pick a task to get a ranked list of models that fit your device, compare any two side by side, and add your own model to the list. Nothing is downloaded.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function ModelAdvisorBlockPage() {
  return (
    <BlockShell
      title="Model Advisor"
      description="Find the best on-device model for a task on your hardware. Pick a task to get a ranked list of models that fit your device, compare any two side by side, and add your own model to the list. Nothing is downloaded."
      name="device/model-advisor"
      source={readBlockSource('device/model-advisor')}
    >
      <ModelAdvisorBlock />
    </BlockShell>
  );
}
