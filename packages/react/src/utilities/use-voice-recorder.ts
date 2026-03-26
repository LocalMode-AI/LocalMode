/**
 * @file use-voice-recorder.ts
 * @description Hook for managing MediaRecorder lifecycle (start/stop recording)
 */

import { useState, useRef, useEffect } from 'react';
import type { AppError } from '../core/app-error.js';

const IS_SERVER = typeof window === 'undefined';

/** Default MIME type preference order */
const DEFAULT_MIME_TYPE = 'audio/webm;codecs=opus';
const FALLBACK_MIME_TYPE = 'audio/webm';

/** Options for the useVoiceRecorder hook */
export interface UseVoiceRecorderOptions {
  /** Preferred MIME type for recording (default: 'audio/webm;codecs=opus') */
  mimeType?: string;
}

/** Return type from useVoiceRecorder */
export interface UseVoiceRecorderReturn {
  /** Whether audio is currently being recorded */
  isRecording: boolean;
  /** Error from recording (e.g., permission denied) */
  error: AppError | null;
  /** Start recording audio from the microphone */
  startRecording: () => Promise<void>;
  /** Stop recording and return the audio blob */
  stopRecording: () => Promise<Blob | null>;
  /** Clear the error state */
  clearError: () => void;
}

/**
 * Hook for managing MediaRecorder lifecycle.
 *
 * Handles microphone permission, MIME type negotiation, recording
 * start/stop, and cleanup on unmount. Pairs naturally with `useTranscribe`.
 *
 * @param options - Optional MIME type configuration
 * @returns Recording state and controls
 *
 * @example
 * ```tsx
 * import { useVoiceRecorder, useTranscribe } from '@localmode/react';
 *
 * function VoiceInput() {
 *   const recorder = useVoiceRecorder();
 *   const transcriber = useTranscribe({ model });
 *
 *   const handleStop = async () => {
 *     const blob = await recorder.stopRecording();
 *     if (blob) await transcriber.execute(blob);
 *   };
 *
 *   return (
 *     <button onClick={recorder.isRecording ? handleStop : recorder.startRecording}>
 *       {recorder.isRecording ? 'Stop' : 'Record'}
 *     </button>
 *   );
 * }
 * ```
 */
export function useVoiceRecorder(
  options?: UseVoiceRecorderOptions
): UseVoiceRecorderReturn {
  const [isRecording, setRecording] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.stream.getTracks().forEach(track => track.stop());
        recorder.stop();
      }
      mediaRecorderRef.current = null;
    };
  }, []);

  const startRecording = async () => {
    if (IS_SERVER) return;

    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Determine supported MIME type
      const preferredType = options?.mimeType ?? DEFAULT_MIME_TYPE;
      const mimeType =
        typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(preferredType)
          ? preferredType
          : FALLBACK_MIME_TYPE;

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.start();
      if (mountedRef.current) setRecording(true);
    } catch (err) {
      if (!mountedRef.current) return;

      const isDenied =
        err instanceof DOMException && err.name === 'NotAllowedError';
      setError({
        message: isDenied
          ? 'Microphone access denied. Please allow microphone access in your browser settings.'
          : 'Failed to start recording. Please check your microphone.',
        recoverable: true,
      });
    }
  };

  const stopRecording = (): Promise<Blob | null> => {
    if (IS_SERVER) return Promise.resolve(null);

    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current;
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        if (mountedRef.current) setRecording(false);
        resolve(null);
        return;
      }

      mediaRecorder.onstop = () => {
        // Stop all tracks to release the microphone
        mediaRecorder.stream.getTracks().forEach(track => track.stop());

        const blob =
          chunksRef.current.length > 0
            ? new Blob(chunksRef.current, { type: mediaRecorder.mimeType })
            : null;

        chunksRef.current = [];
        mediaRecorderRef.current = null;
        if (mountedRef.current) setRecording(false);
        resolve(blob);
      };

      mediaRecorder.stop();
    });
  };

  const clearError = () => setError(null);

  if (IS_SERVER) {
    return {
      isRecording: false,
      error: null,
      startRecording: async () => {},
      stopRecording: async () => null,
      clearError: () => {},
    };
  }

  return { isRecording, error, startRecording, stopRecording, clearError };
}
