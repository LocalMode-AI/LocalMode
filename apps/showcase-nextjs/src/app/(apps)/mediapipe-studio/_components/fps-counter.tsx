/**
 * @file fps-counter.tsx
 * @description Displays the current inference frame rate
 */
'use client';

import { Activity } from 'lucide-react';

/** Props for the FpsCounter component */
interface FpsCounterProps {
  /** Current frames-per-second value */
  fps: number;
}

/** Small overlay badge showing the current FPS. */
export function FpsCounter({ fps }: FpsCounterProps) {
  return (
    <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-lg bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
      <Activity className="h-3.5 w-3.5 text-poster-accent-teal" />
      <span>{fps} fps</span>
    </div>
  );
}
