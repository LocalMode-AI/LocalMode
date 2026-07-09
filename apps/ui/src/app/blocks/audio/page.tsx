/**
 * @file page.tsx
 * @description Public `/blocks/audio` — the Audio category page. Hosts the five
 * split audio blocks plus the regrouped audio-classifier block, each in its own
 * gated BlockShell. Nothing downloads on page open — every block gates its own
 * load.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { CategoryShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { VoiceNotesBlock } from './voice-notes/voice-notes';
import { LiveTranscriptionBlock } from './live-transcription/live-transcription';
import { MeetingAssistantBlock } from './meeting-assistant/meeting-assistant';
import { VoiceExplorerBlock } from './voice-explorer/voice-explorer';
import { AudiobookReaderBlock } from './audiobook-reader/audiobook-reader';
import { AudioClassifierBlock } from './audio-classifier/audio-classifier';

export const metadata: Metadata = {
  title: 'Audio blocks - LocalMode UI',
  alternates: { canonical: '/blocks/audio' },
  openGraph: {
    title: 'Audio',
    description: 'Audio tools that run entirely in your browser: take voice notes, transcribe live speech, summarize meetings, explore voices, read long text aloud, and classify sounds. Each block loads its model only when you ask it to.',
    url: '/blocks/audio',
    type: 'website',
    images: [ogImageUrl({ title: 'Audio', description: 'Audio tools that run entirely in your browser: take voice notes, transcribe live speech, summarize meetings, explore voices, read long text aloud, and classify sounds. Each block loads its model only when you ask it to.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Audio',
    description: 'Audio tools that run entirely in your browser: take voice notes, transcribe live speech, summarize meetings, explore voices, read long text aloud, and classify sounds. Each block loads its model only when you ask it to.',
    images: [ogImageUrl({ title: 'Audio', description: 'Audio tools that run entirely in your browser: take voice notes, transcribe live speech, summarize meetings, explore voices, read long text aloud, and classify sounds. Each block loads its model only when you ask it to.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function AudioCategoryPage() {
  return (
    <CategoryShell
      title="Audio"
      description="Audio tools that run entirely in your browser: take voice notes, transcribe live speech, summarize meetings, explore voices, read long text aloud, and classify sounds. Each block loads its model only when you ask it to."
      blocks={[
        {
          slug: 'voice-notes',
          name: 'audio/voice-notes',
          title: 'Voice Notes',
          description:
            'Record or upload audio and get a text transcript back. Save transcripts as notes, replay them in sync with the audio, and search your notes by meaning.',
          source: readBlockSource('audio/voice-notes'),
          children: <VoiceNotesBlock />,
        },
        {
          slug: 'live-transcription',
          name: 'audio/live-transcription',
          title: 'Live Transcription',
          description:
            'Turn on your microphone and watch your speech become text in real time. Includes a hands-free assistant that listens, replies out loud, and lets you interrupt.',
          source: readBlockSource('audio/live-transcription'),
          children: <LiveTranscriptionBlock />,
        },
        {
          slug: 'meeting-assistant',
          name: 'audio/meeting-assistant',
          title: 'Meeting Assistant',
          description:
            'Upload meeting audio or paste a transcript, then get a short summary and a checklist of action items with priorities. Tick items off and export to a text file.',
          source: readBlockSource('audio/meeting-assistant'),
          children: <MeetingAssistantBlock />,
        },
        {
          slug: 'voice-explorer',
          name: 'audio/voice-explorer',
          title: 'Voice Explorer',
          description:
            'Browse and preview 29 text-to-speech voices grouped by language. Type any text, hear each voice read it, and play two side by side to compare.',
          source: readBlockSource('audio/voice-explorer'),
          children: <VoiceExplorerBlock />,
        },
        {
          slug: 'audiobook-reader',
          name: 'audio/audiobook-reader',
          title: 'Audiobook Reader',
          description:
            'Paste long text and have it read aloud, with playback starting before it finishes. Adjust the speed, pause, resume, or stop, and download the audio file.',
          source: readBlockSource('audio/audiobook-reader'),
          children: <AudiobookReaderBlock />,
        },
        {
          slug: 'audio-classifier',
          name: 'audio/audio-classifier',
          title: 'Audio Classifier',
          description:
            'Record a sound or upload an audio file and see what it is, from music and speech to everyday noises. Results come back as a ranked list of likely sounds.',
          source: readBlockSource('audio/audio-classifier'),
          children: <AudioClassifierBlock />,
        },
      ]}
    />
  );
}
