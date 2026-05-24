/**
 * @file use-webcam.ts
 * @description Hook managing webcam access via getUserMedia()
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import type { AppError } from '../_lib/types';

/**
 * Hook for managing a webcam video stream.
 *
 * Returns a ref to attach to a `<video>` element plus start/stop controls.
 * Camera permission denial is surfaced as a recoverable error.
 */
export function useWebcam() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  // Release the camera when the component unmounts.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  /** Request camera access and begin streaming into the video element. */
  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsActive(true);
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      setError({
        message:
          name === 'NotAllowedError'
            ? 'Camera access was denied. Grant camera permission and try again.'
            : 'Could not start the camera. Check that a camera is connected.',
        recoverable: true,
      });
      setIsActive(false);
    }
  };

  /** Stop the webcam stream and release the camera. */
  const stop = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsActive(false);
  };

  return { videoRef, isActive, error, start, stop, clearError: () => setError(null) };
}
