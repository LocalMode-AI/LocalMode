/**
 * @file page.tsx
 * @description Canonical /blocks/audio/voice-notes — the Voice Notes block in BlockShell chrome. No model bytes download until an explicit in-block action.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { BlockShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { VoiceNotesBlock } from './voice-notes';

export const metadata: Metadata = {
  title: 'Voice Notes block - LocalMode UI',
  alternates: { canonical: '/blocks/audio/voice-notes' },
  openGraph: {
    title: 'Voice Notes',
    description: 'Record or upload audio and get a text transcript back. Save transcripts as notes, replay them word by word in sync with the audio, and search your notes by meaning. Runs entirely in your browser; nothing downloads until you transcribe, upload, or search.',
    url: '/blocks/audio/voice-notes',
    type: 'website',
    images: [ogImageUrl({ title: 'Voice Notes', description: 'Record or upload audio and get a text transcript back. Save transcripts as notes, replay them word by word in sync with the audio, and search your notes by meaning. Runs entirely in your browser; nothing downloads until you transcribe, upload, or search.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Voice Notes',
    description: 'Record or upload audio and get a text transcript back. Save transcripts as notes, replay them word by word in sync with the audio, and search your notes by meaning. Runs entirely in your browser; nothing downloads until you transcribe, upload, or search.',
    images: [ogImageUrl({ title: 'Voice Notes', description: 'Record or upload audio and get a text transcript back. Save transcripts as notes, replay them word by word in sync with the audio, and search your notes by meaning. Runs entirely in your browser; nothing downloads until you transcribe, upload, or search.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function VoiceNotesBlockPage() {
  return (
    <BlockShell
      title="Voice Notes"
      description="Record or upload audio and get a text transcript back. Save transcripts as notes, replay them word by word in sync with the audio, and search your notes by meaning. Runs entirely in your browser; nothing downloads until you transcribe, upload, or search."
      name="audio/voice-notes"
      source={readBlockSource('audio/voice-notes')}
    >
      <VoiceNotesBlock />
    </BlockShell>
  );
}
