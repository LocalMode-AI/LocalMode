/**
 * @file page.tsx
 * @description Public /blocks/audio/audio-classifier — the AudioClassifierBlock in BlockShell chrome.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { BlockShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { AudioClassifierBlock } from './audio-classifier';

export const metadata: Metadata = {
  title: 'Audio Classifier block - LocalMode UI',
  alternates: { canonical: '/blocks/audio/audio-classifier' },
  openGraph: {
    title: 'Audio Classifier',
    description: 'Record a sound or upload an audio file and see what it is, from music and speech to everyday noises. Results come back as a ranked list of the most likely sounds, with the top guess highlighted. Runs entirely in your browser; the model downloads only when you record or choose a file.',
    url: '/blocks/audio/audio-classifier',
    type: 'website',
    images: [ogImageUrl({ title: 'Audio Classifier', description: 'Record a sound or upload an audio file and see what it is, from music and speech to everyday noises. Results come back as a ranked list of the most likely sounds, with the top guess highlighted. Runs entirely in your browser; the model downloads only when you record or choose a file.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Audio Classifier',
    description: 'Record a sound or upload an audio file and see what it is, from music and speech to everyday noises. Results come back as a ranked list of the most likely sounds, with the top guess highlighted. Runs entirely in your browser; the model downloads only when you record or choose a file.',
    images: [ogImageUrl({ title: 'Audio Classifier', description: 'Record a sound or upload an audio file and see what it is, from music and speech to everyday noises. Results come back as a ranked list of the most likely sounds, with the top guess highlighted. Runs entirely in your browser; the model downloads only when you record or choose a file.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function AudioClassifierBlockPage() {
  return (
    <BlockShell
      title="Audio Classifier"
      description="Record a sound or upload an audio file and see what it is, from music and speech to everyday noises. Results come back as a ranked list of the most likely sounds, with the top guess highlighted. Runs entirely in your browser; the model downloads only when you record or choose a file."
      name="audio/audio-classifier"
      source={readBlockSource('audio/audio-classifier')}
    >
      <AudioClassifierBlock />
    </BlockShell>
  );
}
