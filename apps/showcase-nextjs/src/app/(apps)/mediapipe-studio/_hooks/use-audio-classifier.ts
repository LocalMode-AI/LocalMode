/**
 * @file use-audio-classifier.ts
 * @description Hook for audio classification via microphone or file upload
 */
'use client';

import { useRef, useState } from 'react';
import { getAudioClassifier } from '../_services/mediapipe.service';
import type { AppError, AudioPrediction } from '../_lib/types';

/**
 * Hook for classifying audio with the MediaPipe YAMNet model.
 *
 * Supports microphone recording and audio file upload.
 */
export function useAudioClassifier() {
  const [predictions, setPredictions] = useState<AudioPrediction[]>([]);
  const [isClassifying, setIsClassifying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  /** Classify an audio clip and store the ranked predictions. */
  const classify = async (audio: Blob) => {
    setIsClassifying(true);
    setError(null);
    try {
      const { classifyAudio } = await import('@localmode/core');
      const result = await classifyAudio({
        model: getAudioClassifier(),
        audio,
        topK: 8,
      });
      setPredictions(result.predictions);
    } catch (err) {
      setError({
        message: err instanceof Error ? err.message : 'Audio classification failed',
        recoverable: true,
      });
    } finally {
      setIsClassifying(false);
    }
  };

  /** Start recording audio from the microphone. */
  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        void classify(blob);
      };
      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      setError({
        message: 'Microphone access was denied. Grant permission and try again.',
        recoverable: true,
      });
    }
  };

  /** Stop recording and classify the captured audio. */
  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setIsRecording(false);
  };

  return {
    predictions,
    isClassifying,
    isRecording,
    error,
    classify,
    startRecording,
    stopRecording,
    clearError: () => setError(null),
  };
}
