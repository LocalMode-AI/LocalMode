/** @file use-tts.ts — Thin wrapper around useSynthesizeSpeech from @localmode/react */
'use client';
import { useState, useEffect, useRef } from 'react';
import { useSynthesizeSpeech, toAppError, downloadBlob } from '@localmode/react';
import { createTTSModel } from '../_services/tts.service';
import { createAudioBlobUrl } from '../_lib/utils';
import { MAX_TEXT_LENGTH, DEFAULT_TEXT } from '../_lib/constants';
import type { AppError } from '../_lib/types';

const model = createTTSModel();
export function useTTS() {
  const [inputText, setInputText] = useState(DEFAULT_TEXT);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<AppError | null>(null);
  const prevUrlRef = useRef<string | null>(null);
  const audioBlobRef = useRef<Blob | null>(null);
  const { data, isLoading: isGenerating, error: hookError, execute, cancel, reset: resetOp } = useSynthesizeSpeech({ model });
  useEffect(() => {
    if (!data) return;
    if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
    audioBlobRef.current = data.audio;
    const url = createAudioBlobUrl(data.audio);
    prevUrlRef.current = url; setAudioUrl(url);
  }, [data]);
  useEffect(() => () => { if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current); }, []);
  const generateSpeech = async () => {
    if (!inputText.trim()) { setValidationError({ message: 'Please enter some text to convert to speech', recoverable: true }); return; }
    if (inputText.length > MAX_TEXT_LENGTH) { setValidationError({ message: `Text is too long. Maximum ${MAX_TEXT_LENGTH} characters allowed.`, recoverable: true }); return; }
    setValidationError(null); setAudioUrl(null);
    await execute(inputText);
  };
  const error = validationError ?? toAppError(hookError);
  const downloadAudio = () => { if (audioBlobRef.current) downloadBlob(audioBlobRef.current, `audiobook-${Date.now()}.wav`, 'audio/wav'); };
  const reset = () => {
    if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
    prevUrlRef.current = null;
    audioBlobRef.current = null;
    setInputText(DEFAULT_TEXT); setAudioUrl(null); setValidationError(null); resetOp();
  };
  const clearError = () => { setValidationError(null); if (hookError) resetOp(); };
  return { inputText, setInputText, audioUrl, isGenerating, error, generateSpeech, cancelGeneration: cancel, downloadAudio, clearError, reset };
}
