/**
 * @file page.tsx
 * @description Public /blocks/audio/voice-explorer — the VoiceExplorerBlock in BlockShell chrome.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { BlockShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { VoiceExplorerBlock } from './voice-explorer';

export const metadata: Metadata = {
  title: 'Voice Explorer block - LocalMode UI',
  alternates: { canonical: '/blocks/audio/voice-explorer' },
  openGraph: {
    title: 'Voice Explorer',
    description: 'Browse and preview 29 text-to-speech voices grouped by language. Type any text, hear each voice read it, and play two side by side to compare. Everything runs on-device; the voice model (~86MB) downloads only on the first preview or comparison.',
    url: '/blocks/audio/voice-explorer',
    type: 'website',
    images: [ogImageUrl({ title: 'Voice Explorer', description: 'Browse and preview 29 text-to-speech voices grouped by language. Type any text, hear each voice read it, and play two side by side to compare. Everything runs on-device; the voice model (~86MB) downloads only on the first preview or comparison.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Voice Explorer',
    description: 'Browse and preview 29 text-to-speech voices grouped by language. Type any text, hear each voice read it, and play two side by side to compare. Everything runs on-device; the voice model (~86MB) downloads only on the first preview or comparison.',
    images: [ogImageUrl({ title: 'Voice Explorer', description: 'Browse and preview 29 text-to-speech voices grouped by language. Type any text, hear each voice read it, and play two side by side to compare. Everything runs on-device; the voice model (~86MB) downloads only on the first preview or comparison.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function VoiceExplorerBlockPage() {
  return (
    <BlockShell
      title="Voice Explorer"
      description="Browse and preview 29 text-to-speech voices grouped by language. Type any text, hear each voice read it, and play two side by side to compare. Everything runs on-device; the voice model (~86MB) downloads only on the first preview or comparison."
      name="audio/voice-explorer"
      source={readBlockSource('audio/voice-explorer')}
    >
      <VoiceExplorerBlock />
    </BlockShell>
  );
}
