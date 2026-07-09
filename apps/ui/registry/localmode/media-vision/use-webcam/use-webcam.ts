'use client';

import { useEffect, useRef, useState } from 'react';

/** How a webcam start failed — drives the message + retry guidance. */
export type WebcamErrorKind = 'permission' | 'hardware' | 'unknown';

/** A recoverable webcam error (retry = call `start()` again). */
export interface WebcamError {
  kind: WebcamErrorKind;
  message: string;
}

/** Options for {@link useWebcam}. */
export interface UseWebcamOptions {
  /** Ideal capture width in pixels. @default 1280 */
  width?: number;
  /** Ideal capture height in pixels. @default 720 */
  height?: number;
}

/** Map a `getUserMedia` rejection to a recoverable {@link WebcamError}. */
function toWebcamError(err: unknown): WebcamError {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return {
      kind: 'permission',
      message: 'Camera access was denied. Grant camera permission and try again.',
    };
  }
  if (name === 'NotFoundError' || name === 'NotReadableError' || name === 'OverconstrainedError') {
    return {
      kind: 'hardware',
      message: 'Could not start the camera. Check that a camera is connected and not in use.',
    };
  }
  return {
    kind: 'unknown',
    message: err instanceof Error ? err.message : String(err),
  };
}

/**
 * Own a `getUserMedia` video stream: `start()` acquires (or re-acquires after
 * a denial — the retry path), `stop()` releases every track, and unmount
 * cleanup guarantees the camera light goes off with the surface. Runtime
 * permission denial surfaces as a recoverable `error` (permission / hardware /
 * unknown) rather than a thrown exception, so the consumer can render a retry.
 *
 * Imports only React and browser APIs — no external dependencies.
 *
 * @example
 * ```tsx
 * const { stream, isActive, error, start, stop } = useWebcam({ width: 640 });
 * ```
 */
export function useWebcam(options: UseWebcamOptions = {}) {
  const { width = 1280, height = 720 } = options;
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<WebcamError | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Release the camera when the owning surface unmounts (tab/sub-mode switch).
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const start = async (): Promise<MediaStream | null> => {
    if (streamRef.current) return streamRef.current;
    setError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError({
        kind: 'hardware',
        message: 'Camera capture is not available in this browser context.',
      });
      return null;
    }
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: width }, height: { ideal: height }, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = mediaStream;
      setStream(mediaStream);
      return mediaStream;
    } catch (err) {
      setError(toWebcamError(err));
      return null;
    }
  };

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
  };

  return {
    /** The live stream, or null while the camera is off. */
    stream,
    /** True while a stream is active. */
    isActive: stream !== null,
    /** Recoverable start error (permission / hardware / unknown). */
    error,
    start,
    stop,
    clearError: () => setError(null),
  };
}
