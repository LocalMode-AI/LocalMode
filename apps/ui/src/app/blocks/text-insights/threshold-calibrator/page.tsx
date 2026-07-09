/**
 * @file page.tsx
 * @description Canonical `/blocks/text-insights/threshold-calibrator` — the
 * Threshold Calibrator block wrapped in single-block BlockShell chrome. No model
 * bytes download until an explicit in-block action.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { BlockShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { ThresholdCalibratorBlock } from './threshold-calibrator';

export const metadata: Metadata = {
  title: 'Threshold Calibrator block - LocalMode UI',
  alternates: { canonical: '/blocks/text-insights/threshold-calibrator' },
  openGraph: {
    title: 'Threshold Calibrator',
    description: 'Pick a good similarity cutoff straight from your own examples instead of guessing. See the value it suggests next to the built-in default, along with a view of how your scores are distributed. The model loads only when you press Calibrate.',
    url: '/blocks/text-insights/threshold-calibrator',
    type: 'website',
    images: [ogImageUrl({ title: 'Threshold Calibrator', description: 'Pick a good similarity cutoff straight from your own examples instead of guessing. See the value it suggests next to the built-in default, along with a view of how your scores are distributed. The model loads only when you press Calibrate.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Threshold Calibrator',
    description: 'Pick a good similarity cutoff straight from your own examples instead of guessing. See the value it suggests next to the built-in default, along with a view of how your scores are distributed. The model loads only when you press Calibrate.',
    images: [ogImageUrl({ title: 'Threshold Calibrator', description: 'Pick a good similarity cutoff straight from your own examples instead of guessing. See the value it suggests next to the built-in default, along with a view of how your scores are distributed. The model loads only when you press Calibrate.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function ThresholdCalibratorBlockPage() {
  return (
    <BlockShell
      title="Threshold Calibrator"
      description="Pick a good similarity cutoff straight from your own examples instead of guessing. See the value it suggests next to the built-in default, along with a view of how your scores are distributed. The model loads only when you press Calibrate."
      name="text-insights/threshold-calibrator"
      source={readBlockSource('text-insights/threshold-calibrator')}
    >
      <ThresholdCalibratorBlock />
    </BlockShell>
  );
}
