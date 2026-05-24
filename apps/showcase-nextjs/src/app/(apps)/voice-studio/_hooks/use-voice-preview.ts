/**
 * @file use-voice-preview.ts
 * @description Hook for quick voice preview — synthesizes a short sample with a given voice
 */
'use client';

import { useState, useRef } from 'react';
import { toAppError } from '@localmode/react';
import { createTTSModel } from '../_services/tts.service';
import { PREVIEW_TEXT } from '../_lib/constants';
import type { AppError } from '../_lib/types';

const model = createTTSModel();

export function useVoicePreview() {
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const preview = async (voiceId: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    abortRef.current?.abort();

    const controller = new AbortController();
    abortRef.current = controller;

    setPreviewingVoice(voiceId);
    setIsLoading(true);
    setError(null);

    try {
      const { synthesizeSpeech } = await import('@localmode/core');
      const result = await synthesizeSpeech({
        model,
        text: PREVIEW_TEXT,
        voice: voiceId,
        abortSignal: controller.signal,
      });

      const url = URL.createObjectURL(result.audio);
      urlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setPreviewingVoice(null);
      audio.play().catch(() => setPreviewingVoice(null));
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setPreviewingVoice(null);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const stopPreview = () => {
    abortRef.current?.abort();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setPreviewingVoice(null);
    setIsLoading(false);
  };

  return {
    previewingVoice,
    isLoading,
    error: toAppError(error) as AppError | null,
    preview,
    stopPreview,
  };
}
