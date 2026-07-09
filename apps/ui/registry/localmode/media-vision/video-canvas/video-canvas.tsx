'use client';

import * as React from 'react';
import { cn } from '@/registry/localmode/lib/utils';

/** Imperative handle exposed by {@link VideoCanvas} via `ref`. */
export interface VideoCanvasHandle {
  /** The underlying `<video>` element (source for the MediaPipe tracker). */
  video: HTMLVideoElement | null;
  /** The transparent overlay `<canvas>` (draw landmarks/skeleton here). */
  canvas: HTMLCanvasElement | null;
}

/** Props for {@link VideoCanvas}. */
export interface VideoCanvasProps {
  /**
   * The webcam `MediaStream` (from `getUserMedia`). When set, it is attached to
   * the `<video>` and playback starts. The app owns acquisition + permissions.
   */
  stream?: MediaStream | null;
  /**
   * Called once the `<canvas>` 2D context is ready and sized to the video. Use
   * it to grab the context you draw MediaPipe streaming-tracker results onto
   * (e.g. from `useStreamingTracker`'s `onResults`).
   */
  onCanvasReady?: (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => void;
  /** Measured frames-per-second to show in the badge. Hidden when undefined. */
  fps?: number;
  /**
   * Mirror the video + canvas horizontally (selfie view). Most webcam UIs want
   * this. @default true
   */
  mirrored?: boolean;
  /** Hide the FPS badge even when `fps` is provided. @default false */
  hideFps?: boolean;
  /**
   * Status/badge content rendered in an absolutely-positioned slot over the
   * video (e.g. a recognized-gesture chip). Not mirrored.
   */
  children?: React.ReactNode;
  /** Additional class names merged onto the 16:9 shell. */
  className?: string;
}

/**
 * A mirrored 16:9 webcam surface: a `<video>` element with a pixel-aligned
 * transparent `<canvas>` overlay for drawing landmark/skeleton annotations, an
 * FPS badge, and a child slot for status/badges.
 *
 * It is a SHELL, not an acquisition engine — the consuming app supplies the
 * `stream` (`getUserMedia`) and wires a MediaPipe streaming tracker (e.g.
 * `createHandTracker`) via `useStreamingTracker`, drawing each results batch
 * onto the exposed canvas (the trackers own their own video frame loop). The
 * canvas is kept sized to the video's intrinsic resolution, so coordinates the
 * tracker returns map 1:1 onto it; both layers share the same mirror transform
 * so the overlay stays aligned.
 *
 * @example
 * ```tsx
 * const ref = useRef<VideoCanvasHandle>(null);
 * const { results, fps, start } = useStreamingTracker({
 *   video: () => ref.current?.video ?? null,
 *   create: ({ video, onResults, onError }) => createHandTracker({ video, onResults, onError }),
 *   onResults: (hands) => drawHands(ref.current?.canvas, hands),
 * });
 * // start getUserMedia → setStream → start()
 * <VideoCanvas ref={ref} stream={stream} fps={fps}>
 *   <span className="badge">✋ Open palm</span>
 * </VideoCanvas>
 * ```
 */
export const VideoCanvas = React.forwardRef<VideoCanvasHandle, VideoCanvasProps>(
  function VideoCanvas(
    {
      stream,
      onCanvasReady,
      fps,
      mirrored = true,
      hideFps = false,
      children,
      className,
    },
    ref,
  ) {
    const videoRef = React.useRef<HTMLVideoElement>(null);
    const canvasRef = React.useRef<HTMLCanvasElement>(null);

    React.useImperativeHandle(
      ref,
      () => ({
        get video() {
          return videoRef.current;
        },
        get canvas() {
          return canvasRef.current;
        },
      }),
      [],
    );

    // Attach / detach the stream.
    React.useEffect(() => {
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream ?? null;
      if (stream) {
        void video.play().catch(() => {
          /* autoplay can reject before user gesture — caller handles UX */
        });
      }
      return () => {
        video.srcObject = null;
      };
    }, [stream]);

    // Size the canvas to the video's intrinsic resolution once metadata loads,
    // so tracker pixel coordinates map 1:1 onto the canvas.
    React.useEffect(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;

      function syncSize() {
        if (!video || !canvas) return;
        if (video.videoWidth && video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) onCanvasReady?.(ctx, canvas);
        }
      }

      video.addEventListener('loadedmetadata', syncSize);
      syncSize();
      return () => video.removeEventListener('loadedmetadata', syncSize);
    }, [stream, onCanvasReady]);

    const mirrorStyle = mirrored
      ? ({ transform: 'scaleX(-1)' } as const)
      : undefined;

    return (
      <div
        className={cn(
          'relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-muted',
          className,
        )}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 size-full object-cover"
          style={mirrorStyle}
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 size-full object-cover"
          style={mirrorStyle}
        />

        {/* Child slot (not mirrored) for status/badges. */}
        {children && (
          <div className="pointer-events-none absolute inset-0 p-3">
            {children}
          </div>
        )}

        {!hideFps && fps != null && (
          <span className="absolute right-2 top-2 rounded-md bg-background/80 px-2 py-0.5 font-mono text-xs font-medium text-foreground tabular-nums backdrop-blur-sm">
            {Math.round(fps)} FPS
          </span>
        )}
      </div>
    );
  },
);
