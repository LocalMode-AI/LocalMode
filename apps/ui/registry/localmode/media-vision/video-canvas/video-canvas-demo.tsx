'use client';

import * as React from 'react';
import { VideoCanvas } from './video-canvas';
import type { VideoCanvasHandle } from './video-canvas';

/**
 * Demo for the VideoCanvas shell, used by the docs live preview.
 *
 * To keep the preview hardware-free it does NOT request the camera; instead it
 * animates a moving marker on the overlay canvas and a simulated FPS counter,
 * showing the canvas-over-video composition and the FPS badge + child slot. In
 * a real app you pass a `getUserMedia` stream and draw MediaPipe landmarks.
 */
export default function VideoCanvasDemo() {
  const ref = React.useRef<VideoCanvasHandle>(null);
  const [fps, setFps] = React.useState(0);

  React.useEffect(() => {
    let raf = 0;
    let frame = 0;
    let last = performance.now();
    const ctx = ref.current?.canvas?.getContext('2d');
    // Give the canvas a fixed size since there is no video to size it from.
    if (ref.current?.canvas) {
      ref.current.canvas.width = 640;
      ref.current.canvas.height = 360;
    }

    function draw() {
      frame += 1;
      const now = performance.now();
      if (now - last >= 500) {
        setFps((frame * 1000) / (now - last));
        frame = 0;
        last = now;
      }
      const c = ref.current?.canvas;
      const context = c?.getContext('2d');
      if (c && context) {
        context.clearRect(0, 0, c.width, c.height);
        const t = now / 600;
        const x = c.width / 2 + Math.cos(t) * 120;
        const y = c.height / 2 + Math.sin(t * 1.3) * 70;
        context.strokeStyle = '#10b981';
        context.lineWidth = 3;
        context.beginPath();
        context.arc(x, y, 28, 0, Math.PI * 2);
        context.stroke();
        context.fillStyle = '#10b981';
        context.beginPath();
        context.arc(x, y, 5, 0, Math.PI * 2);
        context.fill();
      }
      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="w-full max-w-md">
      <VideoCanvas ref={ref} fps={fps}>
        <span className="rounded-full bg-emerald-500/90 px-2.5 py-1 text-xs font-medium text-white">
          tracking landmark
        </span>
      </VideoCanvas>
      <p className="mt-2 text-xs text-muted-foreground">
        Preview draws a simulated landmark (no camera). Pass a real{' '}
        <code>getUserMedia</code> stream + MediaPipe tracker in your app.
      </p>
    </div>
  );
}
