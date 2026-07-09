'use client';

import { useMemo } from 'react';
import { AudioScrubPlayer } from './audio-scrub-player';

/**
 * Demo for {@link AudioScrubPlayer}. Plays a generated 3-second tone WAV so
 * play/pause, scrubbing, and the duration readout work against a real audio
 * element without a model download. The real app passes a Kokoro
 * `useSynthesizeSpeech` Blob or a recording.
 */
function makeToneWav(seconds: number, freq: number): Blob {
  const sampleRate = 22050;
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
  for (let i = 0; i < samples; i++) {
    const v = Math.sin((2 * Math.PI * freq * i) / sampleRate) * 0.25;
    view.setInt16(44 + i * 2, v * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

export default function AudioScrubPlayerDemo() {
  const blob = useMemo(() => makeToneWav(3, 440), []);
  return (
    <div className="w-full max-w-md">
      <AudioScrubPlayer audio={blob} />
    </div>
  );
}
