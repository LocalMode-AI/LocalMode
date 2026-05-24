/**
 * @file use-voice-studio.ts
 * @description Main hook for voice-studio — synthesis with streaming, voice/speed selection
 */
'use client';

import { useState } from 'react';
import { useStreamSpeech, toAppError, downloadBlob } from '@localmode/react';
import { KOKORO_DEFAULT_VOICE } from '@localmode/transformers';
import { createTTSModel, getVoices } from '../_services/tts.service';
import { SPEED_DEFAULT, SAMPLE_TEXTS } from '../_lib/constants';
import type { AppError } from '../_lib/types';

const model = createTTSModel();
const voices = getVoices();

export function useVoiceStudio() {
  const [inputText, setInputText] = useState<string>(SAMPLE_TEXTS[0]);
  const [selectedVoice, setSelectedVoice] = useState(KOKORO_DEFAULT_VOICE);
  const [speed, setSpeed] = useState(SPEED_DEFAULT);

  const stream = useStreamSpeech({ model, voice: selectedVoice, speed });

  const synthesize = async () => {
    if (!inputText.trim()) return;
    await stream.speak(inputText);
  };

  const downloadAudio = () => {
    if (stream.clauses.length === 0) return;
    const totalSamples = stream.clauses.reduce((acc, c) => acc + c.audio.length, 0);
    const merged = new Float32Array(totalSamples);
    let offset = 0;
    for (const clause of stream.clauses) {
      merged.set(clause.audio, offset);
      offset += clause.audio.length;
    }

    const sampleRate = stream.clauses[0].sampleRate;
    const wavBlob = floatToWav(merged, sampleRate);
    downloadBlob(wavBlob, `voice-studio-${selectedVoice}-${Date.now()}.wav`, 'audio/wav');
  };

  const error = toAppError(stream.error) as AppError | null;
  const hasFinished = stream.clauses.length > 0 && !stream.isSynthesizing && !stream.isPlaying;

  return {
    inputText,
    setInputText,
    selectedVoice,
    setSelectedVoice,
    speed,
    setSpeed,
    voices,
    isSynthesizing: stream.isSynthesizing,
    isPlaying: stream.isPlaying,
    isActive: stream.isSynthesizing || stream.isPlaying,
    currentClause: stream.currentClause,
    clauses: stream.clauses,
    hasFinished,
    error,
    synthesize,
    stop: stream.stop,
    pause: stream.pause,
    resume: stream.resume,
    downloadAudio,
  };
}

function floatToWav(audioData: Float32Array, sampleRate: number): Blob {
  const bitsPerSample = 16;
  const dataSize = audioData.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, bitsPerSample, true);
  w(36, 'data');
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < audioData.length; i++) {
    const s = Math.max(-1, Math.min(1, audioData[i]));
    view.setInt16(44 + i * 2, s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}
