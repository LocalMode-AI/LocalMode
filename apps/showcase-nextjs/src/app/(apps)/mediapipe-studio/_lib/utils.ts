/**
 * @file utils.ts
 * @description Utility functions and canvas drawing helpers for MediaPipe Studio
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Landmark } from '@localmode/core';
import { FINGER_RANGES, OVERLAY } from './constants';

/**
 * Merge Tailwind CSS classes with proper precedence.
 * @param inputs - Class values to merge
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a 0-1 score as a percentage string.
 * @param score - Score between 0 and 1
 */
export function formatPercent(score: number) {
  return `${(score * 100).toFixed(1)}%`;
}

/**
 * Clear a canvas to fully transparent.
 * @param ctx - The 2D rendering context
 */
export function clearCanvas(ctx: CanvasRenderingContext2D) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

/**
 * Draw connection lines between normalized landmarks.
 * @param ctx - The 2D rendering context
 * @param landmarks - Normalized landmark points
 * @param connections - Index pairs to connect
 * @param color - Stroke color
 */
export function drawConnections(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  connections: ReadonlyArray<readonly [number, number]>,
  color: string
) {
  const { width, height } = ctx.canvas;
  ctx.strokeStyle = color;
  ctx.lineWidth = OVERLAY.lineWidth;
  for (const [from, to] of connections) {
    const a = landmarks[from];
    const b = landmarks[to];
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x * width, a.y * height);
    ctx.lineTo(b.x * width, b.y * height);
    ctx.stroke();
  }
}

/**
 * Draw landmark points as filled dots.
 * @param ctx - The 2D rendering context
 * @param landmarks - Normalized landmark points
 * @param color - Fill color
 * @param radius - Dot radius in pixels
 */
export function drawPoints(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  color: string,
  radius: number = OVERLAY.pointRadius
) {
  const { width, height } = ctx.canvas;
  ctx.fillStyle = color;
  for (const lm of landmarks) {
    ctx.beginPath();
    ctx.arc(lm.x * width, lm.y * height, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Draw a hand skeleton with per-finger colored landmark points.
 * @param ctx - The 2D rendering context
 * @param landmarks - 21 hand landmarks
 * @param connections - Hand connection pairs
 */
export function drawHand(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  connections: ReadonlyArray<readonly [number, number]>
) {
  drawConnections(ctx, landmarks, connections, '#ffffff');
  for (const { color, indices } of FINGER_RANGES) {
    drawPoints(
      ctx,
      indices.map((i) => landmarks[i]).filter(Boolean),
      color
    );
  }
}

/**
 * Draw a normalized bounding box.
 * @param ctx - The 2D rendering context
 * @param box - Box with normalized x/y/width/height
 * @param color - Stroke color
 */
export function drawBox(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; width: number; height: number },
  color: string
) {
  const { width, height } = ctx.canvas;
  ctx.strokeStyle = color;
  ctx.lineWidth = OVERLAY.lineWidth;
  ctx.strokeRect(box.x * width, box.y * height, box.width * width, box.height * height);
}

/**
 * A rolling frames-per-second counter.
 */
export class FpsCounter {
  private frames = 0;
  private last = performance.now();
  private current = 0;

  /** Record a processed frame and return the current FPS. */
  tick(): number {
    this.frames++;
    const now = performance.now();
    const elapsed = now - this.last;
    if (elapsed >= 500) {
      this.current = Math.round((this.frames / elapsed) * 1000);
      this.frames = 0;
      this.last = now;
    }
    return this.current;
  }

  /** Reset the counter. */
  reset() {
    this.frames = 0;
    this.last = performance.now();
    this.current = 0;
  }
}
