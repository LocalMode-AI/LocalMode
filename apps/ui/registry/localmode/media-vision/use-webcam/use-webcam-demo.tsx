'use client';

import { useEffect, useRef } from 'react';

import { useWebcam } from './use-webcam';

/**
 * Demo for useWebcam, used by the docs live preview behind a Run gate — nothing
 * touches `getUserMedia` until you click Start, so no camera prompt fires on
 * mount. Start acquires the stream; Stop releases every track (camera light off).
 */
export default function UseWebcamDemo() {
  const { stream, isActive, error, start, stop, clearError } = useWebcam({
    width: 640,
    height: 480,
  });
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  return (
    <div className="flex w-full max-w-md flex-col items-start gap-3">
      <div className="flex items-center gap-2 text-xs">
        <button
          type="button"
          onClick={() => void start()}
          disabled={isActive}
          className="rounded-md border border-border px-3 py-1.5 font-medium hover:bg-muted disabled:opacity-50"
        >
          Start camera
        </button>
        <button
          type="button"
          onClick={stop}
          disabled={!isActive}
          className="rounded-md border border-border px-3 py-1.5 font-medium hover:bg-muted disabled:opacity-50"
        >
          Stop
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {error.message}
          <button type="button" onClick={clearError} className="font-medium underline">
            Dismiss
          </button>
        </p>
      )}

      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="aspect-video w-full max-w-sm -scale-x-100 rounded-md border border-border bg-muted"
      />
    </div>
  );
}
