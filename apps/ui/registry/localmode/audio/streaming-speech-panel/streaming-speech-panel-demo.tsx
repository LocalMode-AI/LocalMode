'use client';

import { useState } from 'react';
import {
  StreamingSpeechPanel,
  type StreamingClause,
} from './streaming-speech-panel';

/**
 * Demo for {@link StreamingSpeechPanel}. Simulates a streaming TTS run by
 * advancing clauses on a timer so the active → finished transition is visible
 * without a model download. The real app passes `useStreamSpeech()` state and
 * wires `onDownload` to `downloadBlob`.
 */
const SAMPLE: StreamingClause[] = [
  { text: 'Welcome to LocalMode.', clauseIndex: 0 },
  { text: 'Everything runs in your browser.', clauseIndex: 1 },
  { text: 'No servers, no API keys.', clauseIndex: 2 },
];

export default function StreamingSpeechPanelDemo() {
  const [clauses, setClauses] = useState<StreamingClause[]>([]);
  const [current, setCurrent] = useState<StreamingClause | null>(null);
  const [phase, setPhase] = useState<'idle' | 'streaming' | 'done'>('idle');

  const run = () => {
    if (phase === 'streaming') return;
    setClauses([]);
    setCurrent(null);
    setPhase('streaming');

    SAMPLE.forEach((clause, i) => {
      setTimeout(() => {
        setClauses((prev) => [...prev, clause]);
        setCurrent(clause);
      }, 700 * (i + 1));
    });
    setTimeout(() => {
      setCurrent(null);
      setPhase('done');
    }, 700 * (SAMPLE.length + 1));
  };

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={run}
        className="inline-flex h-9 w-fit items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Simulate stream
      </button>

      <StreamingSpeechPanel
        isSynthesizing={phase === 'streaming'}
        isPlaying={phase === 'streaming'}
        currentClause={current}
        clauses={clauses}
        onDownload={() => alert('downloadBlob(wav, "speech.wav") would run here')}
      />
    </div>
  );
}
