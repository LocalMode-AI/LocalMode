/**
 * @file page.tsx
 * @description Canonical `/blocks/audio/meeting-assistant` — the Meeting
 * Assistant block wrapped in single-block BlockShell chrome. No model bytes
 * download until an explicit in-block action.
 */
import type { Metadata } from 'next';
import { ogImageUrl } from '@/lib/og';
import { BlockShell } from '@/components/block-shell';
import { readBlockSource } from '@/lib/read-source';
import { MeetingAssistantBlock } from './meeting-assistant';

export const metadata: Metadata = {
  title: 'Meeting Assistant block - LocalMode UI',
  alternates: { canonical: '/blocks/audio/meeting-assistant' },
  openGraph: {
    title: 'Meeting Assistant',
    description: 'Upload meeting audio or paste a transcript, then get a short summary and a checklist of action items with priorities. Tick items off as you go, track progress, and export everything to a text file. Runs entirely in your browser; nothing downloads until you process a meeting.',
    url: '/blocks/audio/meeting-assistant',
    type: 'website',
    images: [ogImageUrl({ title: 'Meeting Assistant', description: 'Upload meeting audio or paste a transcript, then get a short summary and a checklist of action items with priorities. Tick items off as you go, track progress, and export everything to a text file. Runs entirely in your browser; nothing downloads until you process a meeting.', eyebrow: 'LocalMode Blocks' })],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Meeting Assistant',
    description: 'Upload meeting audio or paste a transcript, then get a short summary and a checklist of action items with priorities. Tick items off as you go, track progress, and export everything to a text file. Runs entirely in your browser; nothing downloads until you process a meeting.',
    images: [ogImageUrl({ title: 'Meeting Assistant', description: 'Upload meeting audio or paste a transcript, then get a short summary and a checklist of action items with priorities. Tick items off as you go, track progress, and export everything to a text file. Runs entirely in your browser; nothing downloads until you process a meeting.', eyebrow: 'LocalMode Blocks' })],
  },
};

export default function MeetingAssistantBlockPage() {
  return (
    <BlockShell
      title="Meeting Assistant"
      description="Upload meeting audio or paste a transcript, then get a short summary and a checklist of action items with priorities. Tick items off as you go, track progress, and export everything to a text file. Runs entirely in your browser; nothing downloads until you process a meeting."
      name="audio/meeting-assistant"
      source={readBlockSource('audio/meeting-assistant')}
    >
      <MeetingAssistantBlock />
    </BlockShell>
  );
}
