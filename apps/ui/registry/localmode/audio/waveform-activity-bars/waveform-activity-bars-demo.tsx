'use client';

import { useState } from 'react';
import { WaveformActivityBars, type WaveformState } from './waveform-activity-bars';

/**
 * Demo for {@link WaveformActivityBars}. Shows the active/idle indicator plus
 * the five agent-state modes side by side, each clearly labeled and visibly
 * distinct (color, amplitude, speed, bar count, and animation pattern all vary
 * per state). A slider drives a simulated `volume` so you can see the
 * amplitude-decoupled rendering without wiring a real mic.
 */
const STATES: { state: WaveformState; hint: string }[] = [
  { state: 'idle', hint: 'flat · still · muted' },
  { state: 'connecting', hint: 'low blips · muted' },
  { state: 'listening', hint: 'lively · primary' },
  { state: 'thinking', hint: 'travelling · amber' },
  { state: 'speaking', hint: 'tall · fast · emerald' },
];

export default function WaveformActivityBarsDemo() {
  const [volume, setVolume] = useState(0.5);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-6">
        <div className="flex flex-col items-center gap-1">
          <WaveformActivityBars active height={28} />
          <span className="text-xs text-muted-foreground">active</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <WaveformActivityBars active={false} height={28} />
          <span className="text-xs text-muted-foreground">idle</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {STATES.map(({ state, hint }) => (
          <div
            key={state}
            className="flex flex-col items-center gap-1 rounded-md border border-border p-3"
          >
            <div className="flex h-8 items-end">
              <WaveformActivityBars state={state} height={28} />
            </div>
            <span className="text-xs font-medium text-foreground">{state}</span>
            <span className="text-[10px] text-muted-foreground">{hint}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <WaveformActivityBars
          state="listening"
          volume={volume}
          height={32}
          barCount={9}
        />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="w-40"
          aria-label="simulated input volume"
        />
        <span className="text-xs tabular-nums text-muted-foreground">
          volume {volume.toFixed(2)}
        </span>
      </div>
    </div>
  );
}
