'use client';

import { useState } from 'react';
import { TranscribedNoteCard } from './transcribed-note-card';

/**
 * Demo for {@link TranscribedNoteCard}. Shows the placeholder → populated morph
 * (driven here by a timer) alongside an existing populated note with inline
 * audio and a delete control. The real app flips `transcribing` off when
 * `useTranscribe` resolves and supplies the recorded Blob.
 */
function makeSilentWav(): Blob {
  const sampleRate = 8000;
  const samples = sampleRate; // 1s
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples * 2, true);
  return new Blob([buffer], { type: 'audio/wav' });
}

export default function TranscribedNoteCardDemo() {
  const [pending, setPending] = useState(true);
  const [notes, setNotes] = useState(() => [
    {
      id: '1',
      text: 'Remember to download the model before going offline.',
      timestamp: new Date(Date.now() - 1000 * 60 * 4),
      audio: makeSilentWav(),
    },
  ]);

  const finish = () => {
    setPending(false);
    setNotes((prev) => [
      {
        id: crypto.randomUUID(),
        text: 'This note finished transcribing.',
        timestamp: new Date(),
        audio: makeSilentWav(),
      },
      ...prev,
    ]);
  };

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => {
          setPending(true);
          setTimeout(finish, 1500);
        }}
        className="inline-flex h-9 w-fit items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Simulate transcription
      </button>

      {pending && <TranscribedNoteCard transcribing />}

      {notes.map((note) => (
        <TranscribedNoteCard
          key={note.id}
          text={note.text}
          timestamp={note.timestamp}
          audio={note.audio}
          onDelete={() => setNotes((prev) => prev.filter((n) => n.id !== note.id))}
        />
      ))}
    </div>
  );
}
