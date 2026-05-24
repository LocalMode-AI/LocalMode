/**
 * @file tracker-tab.tsx
 * @description Shared layout for a real-time webcam tracking tab
 */
'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Camera, CameraOff } from 'lucide-react';
import { Button, Spinner } from './ui';
import { VideoCanvas } from './video-canvas';
import { FpsCounter } from './fps-counter';
import { ErrorAlert } from './error-boundary';
import { clearCanvas } from '../_lib/utils';
import type { AppError } from '../_lib/types';
import type { TrackerStatus } from '../_hooks';

/** Webcam controls passed into a tracker tab */
interface WebcamState {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isActive: boolean;
  error: AppError | null;
  start: () => Promise<void>;
  stop: () => void;
  clearError: () => void;
}

/** Tracker state passed into a tracker tab */
interface TrackerState<R> {
  results: R[];
  fps: number;
  status: TrackerStatus;
  error: AppError | null;
  start: () => Promise<void>;
  stop: () => void;
  clearError: () => void;
}

/** Props for the TrackerTab component */
interface TrackerTabProps<R> {
  /** Webcam hook state */
  webcam: WebcamState;
  /** Tracker hook state */
  tracker: TrackerState<R>;
  /** Draw the tracker results onto the overlay canvas */
  draw: (ctx: CanvasRenderingContext2D, results: R[]) => void;
  /** Hint shown before the camera is started */
  idleHint: string;
  /** Optional sidebar panel (results, controls) */
  sidebar?: ReactNode;
}

/**
 * Shared tab layout for real-time webcam trackers: a video surface with a
 * landmark overlay, start/stop control, FPS counter, and optional sidebar.
 */
export function TrackerTab<R>({
  webcam,
  tracker,
  draw,
  idleHint,
  sidebar,
}: TrackerTabProps<R>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Redraw the overlay whenever new tracker results arrive.
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = webcam.videoRef.current;
    if (!canvas || !video) return;
    if (video.videoWidth > 0) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    clearCanvas(ctx);
    draw(ctx, tracker.results);
  }, [tracker.results, webcam.videoRef, draw]);

  const running = webcam.isActive && tracker.status === 'running';
  const busy = tracker.status === 'loading';

  const handleStart = async () => {
    await webcam.start();
    await tracker.start();
  };

  const handleStop = () => {
    tracker.stop();
    webcam.stop();
  };

  const activeError = webcam.error ?? tracker.error;

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <div className="space-y-3">
        <VideoCanvas videoRef={webcam.videoRef} canvasRef={canvasRef}>
          {running && <FpsCounter fps={tracker.fps} />}
          {!webcam.isActive && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-poster-text-sub">
              <Camera className="h-10 w-10 opacity-40" />
              <p className="max-w-xs text-sm">{idleHint}</p>
            </div>
          )}
          {busy && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/50">
              <Spinner size="lg" className="text-white" />
              <p className="text-sm text-white">Loading model…</p>
            </div>
          )}
        </VideoCanvas>

        <div className="flex items-center gap-2">
          {running || busy ? (
            <Button variant="ghost" onClick={handleStop} disabled={busy}>
              <CameraOff className="mr-2 h-4 w-4" />
              Stop Camera
            </Button>
          ) : (
            <Button variant="primary" onClick={handleStart}>
              <Camera className="mr-2 h-4 w-4" />
              Start Camera
            </Button>
          )}
        </div>

        {activeError && (
          <ErrorAlert
            message={activeError.message}
            onDismiss={() => {
              webcam.clearError();
              tracker.clearError();
            }}
            onRetry={activeError.recoverable ? handleStart : undefined}
          />
        )}
      </div>

      {sidebar && <div className="space-y-3">{sidebar}</div>}
    </div>
  );
}
