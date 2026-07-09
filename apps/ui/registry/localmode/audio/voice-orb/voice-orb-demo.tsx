'use client';

import { useRef, useState } from 'react';
import { VoiceOrb, type VoiceOrbState } from './voice-orb';

/**
 * Demo for {@link VoiceOrb}. Cycles through agent states and feeds a simulated
 * volume so the listening/speaking reactivity is visible without microphone
 * permission. The real app passes `getInputVolume`/`getOutputVolume` backed by
 * a Web Audio `AnalyserNode` over `getUserMedia`.
 */
const STATES: VoiceOrbState[] = [
  'idle',
  'connecting',
  'listening',
  'thinking',
  'speaking',
  'muted',
];

export default function VoiceOrbDemo() {
  const [state, setState] = useState<VoiceOrbState>('listening');
  // A ref-driven oscillator stands in for an analyser's per-frame volume.
  const phaseRef = useRef(0);
  const fakeVolume = () => {
    phaseRef.current += 0.08;
    return (Math.sin(phaseRef.current) * 0.5 + 0.5) * 0.8;
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <VoiceOrb
        state={state}
        size={140}
        getInputVolume={fakeVolume}
        getOutputVolume={fakeVolume}
      />
      <div className="flex flex-wrap justify-center gap-2">
        {STATES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setState(s)}
            className={
              'rounded-md border px-3 py-1 text-xs font-medium transition-colors ' +
              (state === s
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background hover:bg-accent')
            }
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
