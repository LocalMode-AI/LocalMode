'use client';

import { useState } from 'react';
import {
  VoicePicker,
  VoiceGrid,
  type VoiceOption,
} from './voice-picker';

/**
 * Demo for {@link VoicePicker} / {@link VoiceGrid}. Uses a small fixture that
 * mirrors the `KokoroVoice` shape across two languages so the language grouping
 * and gender badges are visible without a model download. The preview button
 * simulates a synth → play cycle (the real app wires `onPreview` to
 * `useSynthesizeSpeech`).
 */
const VOICES: VoiceOption[] = [
  { id: 'af_heart', name: 'Heart', gender: 'female', languageLabel: 'American English' },
  { id: 'af_bella', name: 'Bella', gender: 'female', languageLabel: 'American English' },
  { id: 'am_adam', name: 'Adam', gender: 'male', languageLabel: 'American English' },
  { id: 'am_echo', name: 'Echo', gender: 'male', languageLabel: 'American English' },
  { id: 'bf_emma', name: 'Emma', gender: 'female', languageLabel: 'British English' },
  { id: 'bm_george', name: 'George', gender: 'male', languageLabel: 'British English' },
];

export default function VoicePickerDemo() {
  const [voice, setVoice] = useState('af_heart');
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  // Simulate a synth → play cycle so the preview button states are visible.
  const handlePreview = (id: string) => {
    if (playingId === id) {
      setPlayingId(null);
      return;
    }
    setLoadingId(id);
    setTimeout(() => {
      setLoadingId(null);
      setPlayingId(id);
      setTimeout(() => setPlayingId((p) => (p === id ? null : p)), 1500);
    }, 700);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Compact select:</span>
        <VoicePicker voices={VOICES} value={voice} onValueChange={setVoice} />
        <code className="text-xs text-muted-foreground">{voice}</code>
      </div>

      <VoiceGrid
        voices={VOICES}
        value={voice}
        onValueChange={setVoice}
        onPreview={handlePreview}
        loadingVoiceId={loadingId}
        playingVoiceId={playingId}
      />
    </div>
  );
}
