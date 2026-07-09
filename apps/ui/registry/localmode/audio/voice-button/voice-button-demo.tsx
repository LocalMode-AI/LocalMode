'use client';

import { useRef, useState } from 'react';
import { VoiceButton, type VoiceButtonState } from './voice-button';

/**
 * Demo for {@link VoiceButton}. Walks the push-to-talk state machine on a timer
 * (press → recording → processing → success) and feeds a simulated mic volume,
 * so the visual transitions are visible without microphone permission. The real
 * app wires `onStart`/`onStop` to `useVoiceRecorder` + `useTranscribe`.
 */
export default function VoiceButtonDemo() {
  const [state, setState] = useState<VoiceButtonState>('idle');
  const phaseRef = useRef(0);
  const [volume, setVolume] = useState(0);

  const tick = () => {
    phaseRef.current += 0.2;
    setVolume((Math.sin(phaseRef.current) * 0.5 + 0.5) * 0.9);
  };

  const start = () => {
    setState('recording');
    const id = setInterval(tick, 60);
    // Auto-stop after a short window to drive the rest of the machine.
    setTimeout(() => {
      clearInterval(id);
      stop();
    }, 1500);
  };

  const stop = () => {
    setState('processing');
    setTimeout(() => setState('success'), 1200);
    setTimeout(() => setState('idle'), 2600);
  };

  return (
    <div className="flex flex-col items-start gap-4">
      <VoiceButton state={state} onStart={start} onStop={stop} volume={volume} />
      <p className="text-xs text-muted-foreground">
        Press the button to run the simulated push-to-talk cycle.
      </p>
    </div>
  );
}
