'use client';

import { useState } from 'react';
import {
  VoiceComparisonPanel,
  type ComparisonColumn,
} from './voice-comparison-panel';
import type { VoiceOption } from '../voice-picker/voice-picker';

/**
 * Demo for {@link VoiceComparisonPanel}. Uses a tiny voice fixture and a
 * simulated Compare that produces two short silent WAV Blobs so both native
 * players render distinct sources without a model download. The real app wires
 * `onCompare` to two `useSynthesizeSpeech` runs.
 */
const VOICES: VoiceOption[] = [
  { id: 'af_heart', name: 'Heart', gender: 'female', languageLabel: 'American English' },
  { id: 'am_adam', name: 'Adam', gender: 'male', languageLabel: 'American English' },
  { id: 'bf_emma', name: 'Emma', gender: 'female', languageLabel: 'British English' },
];

/** Build a tiny valid silent WAV Blob of the given length so players load. */
function makeSilentWav(seconds: number): Blob {
  const sampleRate = 8000;
  const samples = Math.floor(sampleRate * seconds);
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

export default function VoiceComparisonPanelDemo() {
  const [a, setA] = useState('af_heart');
  const [b, setB] = useState('am_adam');
  const [text, setText] = useState('Run models entirely in your browser.');
  const [columnA, setColumnA] = useState<ComparisonColumn>({ voiceId: a });
  const [columnB, setColumnB] = useState<ComparisonColumn>({ voiceId: b });
  const [loading, setLoading] = useState(false);

  const compare = () => {
    setLoading(true);
    setTimeout(() => {
      setColumnA({ voiceId: a, audio: makeSilentWav(1) });
      setColumnB({ voiceId: b, audio: makeSilentWav(1.4) });
      setLoading(false);
    }, 800);
  };

  return (
    <VoiceComparisonPanel
      voices={VOICES}
      columnA={{ ...columnA, voiceId: a }}
      columnB={{ ...columnB, voiceId: b }}
      onVoiceAChange={setA}
      onVoiceBChange={setB}
      text={text}
      onTextChange={setText}
      onCompare={compare}
      loading={loading}
    />
  );
}
