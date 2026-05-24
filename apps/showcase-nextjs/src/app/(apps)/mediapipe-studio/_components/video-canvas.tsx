/**
 * @file video-canvas.tsx
 * @description Webcam video element with an aligned canvas overlay
 */
'use client';

import { type ReactNode, type RefObject } from 'react';

/** Props for the VideoCanvas component */
interface VideoCanvasProps {
  /** Ref attached to the video element */
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Ref attached to the overlay canvas */
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** Optional overlay content (badges, FPS counter, status) */
  children?: ReactNode;
}

/**
 * A 16:9 webcam surface: a mirrored `<video>` with a pixel-aligned `<canvas>`
 * overlay for drawing landmark annotations.
 */
export function VideoCanvas({ videoRef, canvasRef, children }: VideoCanvasProps) {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black ring-1 ring-poster-border/30">
      <video
        ref={videoRef}
        playsInline
        muted
        className="absolute inset-0 h-full w-full -scale-x-100 object-cover"
      />
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100 object-cover"
      />
      {children}
    </div>
  );
}
