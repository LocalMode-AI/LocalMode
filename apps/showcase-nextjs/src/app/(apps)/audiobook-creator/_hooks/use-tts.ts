/**
 * @file use-tts.ts
 * @description Hook for streaming TTS with Kokoro voice selection and speed control
 */
'use client';

import { useState, useRef, useEffect } from 'react';
import { useStreamSpeech, toAppError, downloadBlob } from '@localmode/react';
import { createTTSModel, getVoices } from '../_services/tts.service';
import { KOKORO_DEFAULT_VOICE } from '@localmode/transformers';
import { MAX_TEXT_LENGTH, DEFAULT_TEXT, SPEED_DEFAULT } from '../_lib/constants';
import type { AppError } from '../_lib/types';

const model = createTTSModel();
const voices = getVoices();

export function useTTS() {
  const [inputText, setInputText] = useState(DEFAULT_TEXT);
  const [selectedVoice, setSelectedVoice] = useState(KOKORO_DEFAULT_VOICE);
  const [speed, setSpeed] = useState(SPEED_DEFAULT);
  const [validationError, setValidationError] = useState<AppError | null>(null);

  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const prevUrlRef = useRef<string | null>(null);

  const stream = useStreamSpeech({ model, voice: selectedVoice, speed });

  useEffect(() => {
    return () => {
      if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
    };
  }, []);

  const generateSpeech = async () => {
    if (!inputText.trim()) {
      setValidationError({ message: 'Please enter some text to convert to speech', recoverable: true });
      return;
    }
    if (inputText.length > MAX_TEXT_LENGTH) {
      setValidationError({ message: `Text is too long. Maximum ${MAX_TEXT_LENGTH} characters allowed.`, recoverable: true });
      return;
    }
    setValidationError(null);

    if (prevUrlRef.current) {
      URL.revokeObjectURL(prevUrlRef.current);
      prevUrlRef.current = null;
    }
    setAudioUrl(null);
    setAudioBlob(null);

    await stream.speak(inputText);
  };

  const downloadAudio = () => {
    if (audioBlob) {
      downloadBlob(audioBlob, `audiobook-${selectedVoice}-${Date.now()}.wav`, 'audio/wav');
    }
  };

  const error = validationError ?? toAppError(stream.error);

  const reset = () => {
    stream.stop();
    if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
    prevUrlRef.current = null;
    setInputText(DEFAULT_TEXT);
    setSelectedVoice(KOKORO_DEFAULT_VOICE);
    setSpeed(SPEED_DEFAULT);
    setAudioUrl(null);
    setAudioBlob(null);
    setValidationError(null);
  };

  const clearError = () => {
    setValidationError(null);
  };

  const isActive = stream.isSynthesizing || stream.isPlaying;

  return {
    inputText,
    setInputText,
    selectedVoice,
    setSelectedVoice,
    speed,
    setSpeed,
    voices,
    audioUrl,
    isGenerating: isActive,
    isSynthesizing: stream.isSynthesizing,
    isPlaying: stream.isPlaying,
    currentClause: stream.currentClause,
    clauses: stream.clauses,
    error,
    generateSpeech,
    cancelGeneration: stream.stop,
    pause: stream.pause,
    resume: stream.resume,
    downloadAudio,
    clearError,
    reset,
  };
}
