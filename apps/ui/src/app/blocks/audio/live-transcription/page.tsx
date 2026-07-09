/**
 * @file page.tsx
 * @description Public /blocks/audio/live-transcription — the LiveTranscriptionBlock in BlockShell chrome.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { BlockShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { LiveTranscriptionBlock } from './live-transcription';

export const metadata: Metadata = {
  title: 'Live Transcription block - LocalMode UI',
  alternates: { canonical: '/blocks/audio/live-transcription' },
  openGraph: {
    title: 'Live Transcription',
    description: 'Turn on your microphone and watch your speech become text in real time. Includes a hands-free assistant that listens, thinks, and speaks back, with barge-in so you can interrupt. All runs on-device; stopping releases the microphone, and nothing downloads until you start a session.',
    url: '/blocks/audio/live-transcription',
    type: 'website',
    images: [ogImageUrl({ title: 'Live Transcription', description: 'Turn on your microphone and watch your speech become text in real time. Includes a hands-free assistant that listens, thinks, and speaks back, with barge-in so you can interrupt. All runs on-device; stopping releases the microphone, and nothing downloads until you start a session.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Live Transcription',
    description: 'Turn on your microphone and watch your speech become text in real time. Includes a hands-free assistant that listens, thinks, and speaks back, with barge-in so you can interrupt. All runs on-device; stopping releases the microphone, and nothing downloads until you start a session.',
    images: [ogImageUrl({ title: 'Live Transcription', description: 'Turn on your microphone and watch your speech become text in real time. Includes a hands-free assistant that listens, thinks, and speaks back, with barge-in so you can interrupt. All runs on-device; stopping releases the microphone, and nothing downloads until you start a session.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function LiveTranscriptionBlockPage() {
  return (
    <BlockShell
      title="Live Transcription"
      description="Turn on your microphone and watch your speech become text in real time. Includes a hands-free assistant that listens, thinks, and speaks back, with barge-in so you can interrupt. All runs on-device; stopping releases the microphone, and nothing downloads until you start a session."
      name="audio/live-transcription"
      source={readBlockSource('audio/live-transcription')}
    >
      <LiveTranscriptionBlock />
    </BlockShell>
  );
}
