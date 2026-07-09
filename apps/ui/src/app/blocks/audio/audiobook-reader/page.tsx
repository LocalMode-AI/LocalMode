/**
 * @file page.tsx
 * @description Public /blocks/audio/audiobook-reader — the AudiobookReaderBlock in BlockShell chrome.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { BlockShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { AudiobookReaderBlock } from './audiobook-reader';

export const metadata: Metadata = {
  title: 'Audiobook Reader block - LocalMode UI',
  alternates: { canonical: '/blocks/audio/audiobook-reader' },
  openGraph: {
    title: 'Audiobook Reader',
    description: 'Paste long text and have it read aloud, with playback starting before the whole thing finishes. Adjust the reading speed, pause, resume, or stop anytime, and download the result as an audio file. All runs on-device (up to 10,000 characters); the voice model downloads only on the first play.',
    url: '/blocks/audio/audiobook-reader',
    type: 'website',
    images: [ogImageUrl({ title: 'Audiobook Reader', description: 'Paste long text and have it read aloud, with playback starting before the whole thing finishes. Adjust the reading speed, pause, resume, or stop anytime, and download the result as an audio file. All runs on-device (up to 10,000 characters); the voice model downloads only on the first play.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Audiobook Reader',
    description: 'Paste long text and have it read aloud, with playback starting before the whole thing finishes. Adjust the reading speed, pause, resume, or stop anytime, and download the result as an audio file. All runs on-device (up to 10,000 characters); the voice model downloads only on the first play.',
    images: [ogImageUrl({ title: 'Audiobook Reader', description: 'Paste long text and have it read aloud, with playback starting before the whole thing finishes. Adjust the reading speed, pause, resume, or stop anytime, and download the result as an audio file. All runs on-device (up to 10,000 characters); the voice model downloads only on the first play.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function AudiobookReaderBlockPage() {
  return (
    <BlockShell
      title="Audiobook Reader"
      description="Paste long text and have it read aloud, with playback starting before the whole thing finishes. Adjust the reading speed, pause, resume, or stop anytime, and download the result as an audio file. All runs on-device (up to 10,000 characters); the voice model downloads only on the first play."
      name="audio/audiobook-reader"
      source={readBlockSource('audio/audiobook-reader')}
    >
      <AudiobookReaderBlock />
    </BlockShell>
  );
}
