/**
 * @file use-voice-comparison.ts
 * @description Hook for side-by-side voice comparison — calls synthesizeSpeech directly with different voices
 */
'use client';

import { useState, useRef } from 'react';
import { toAppError } from '@localmode/react';
import { createTTSModel } from '../_services/tts.service';
import { SAMPLE_TEXTS } from '../_lib/constants';
import type { AppError } from '../_lib/types';

const model = createTTSModel();

export function useVoiceComparison() {
  const [voiceA, setVoiceA] = useState('af_heart');
  const [voiceB, setVoiceB] = useState('am_michael');
  const [comparisonText, setComparisonText] = useState<string>(SAMPLE_TEXTS[0]);
  const [audioUrlA, setAudioUrlA] = useState<string | null>(null);
  const [audioUrlB, setAudioUrlB] = useState<string | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const urlsRef = useRef<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const compare = async () => {
    if (!comparisonText.trim()) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    for (const url of urlsRef.current) URL.revokeObjectURL(url);
    urlsRef.current = [];
    setAudioUrlA(null);
    setAudioUrlB(null);
    setError(null);
    setIsComparing(true);

    try {
      const { synthesizeSpeech } = await import('@localmode/core');

      const resultA = await synthesizeSpeech({
        model,
        text: comparisonText,
        voice: voiceA,
        abortSignal: controller.signal,
      });
      const urlA = URL.createObjectURL(resultA.audio);
      urlsRef.current.push(urlA);
      setAudioUrlA(urlA);

      const resultB = await synthesizeSpeech({
        model,
        text: comparisonText,
        voice: voiceB,
        abortSignal: controller.signal,
      });
      const urlB = URL.createObjectURL(resultB.audio);
      urlsRef.current.push(urlB);
      setAudioUrlB(urlB);
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      setIsComparing(false);
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    setIsComparing(false);
  };

  return {
    voiceA, setVoiceA,
    voiceB, setVoiceB,
    comparisonText, setComparisonText,
    audioUrlA, audioUrlB,
    isComparing,
    error: toAppError(error) as AppError | null,
    compare,
    cancel,
  };
}
