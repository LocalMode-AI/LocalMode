'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  SyncedTranscriptViewer,
  type TimedWord,
} from './synced-transcript-viewer';

/**
 * @file synced-transcript-viewer-demo.tsx
 * @description Demo for {@link SyncedTranscriptViewer}. Speaks the sentence with a REAL voice via the Web Speech API (`speechSynthesis`) — no asset, no download — and drives the karaoke highlight from `onboundary` word events (charIndex → word index) for exact word-level sync. Gated behind Play; nothing speaks on mount.
 */

const SENTENCE =
  'Run machine learning models entirely in your browser with no servers';

const SPEECH_SUPPORTED =
  typeof window !== 'undefined' && 'speechSynthesis' in window;

const RATE = 0.9;

export default function SyncedTranscriptViewerDemo() {
  const tokens = useMemo(() => SENTENCE.split(' '), []);

  // Cumulative char offset of each word's first character within SENTENCE.
  // Words are single-space separated, so offset[i] = offset[i-1] + len(i-1) + 1
  // (the +1 accounts for the separating space).
  const charOffsets = useMemo(() => {
    const offsets: number[] = [];
    let pos = 0;
    for (const t of tokens) {
      offsets.push(pos);
      pos += t.length + 1;
    }
    return offsets;
  }, [tokens]);

  // Fallback evenly-spaced timings — retained as a reasonable shape, but the
  // highlight is now driven by `activeIndex` (boundary events), not these.
  const perWord = 0.45;
  const words: TimedWord[] = useMemo(
    () =>
      tokens.map((text, i) => ({
        text,
        start: i * perWord,
        end: (i + 1) * perWord,
      })),
    [tokens],
  );

  const [activeIndex, setActiveIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);

  // Map an absolute char index in SENTENCE to the word containing it:
  // the last word whose offset <= charIndex.
  const wordIndexAtChar = (charIndex: number): number => {
    let idx = 0;
    for (let i = 0; i < charOffsets.length; i++) {
      if (charOffsets[i] <= charIndex) idx = i;
      else break;
    }
    return idx;
  };

  // Speak SENTENCE starting at word `fromWord` (0 = whole sentence). We speak a
  // slice from that word's char offset; the boundary `charIndex` is relative to
  // the spoken (sliced) text, so we add the slice's base offset to recover the
  // absolute index into SENTENCE before mapping it to a word.
  const speakFrom = (fromWord: number) => {
    if (!SPEECH_SUPPORTED) return;
    const base = charOffsets[fromWord] ?? 0;
    const text = SENTENCE.slice(base);

    window.speechSynthesis.cancel(); // clear any queued/active utterance first

    const u = new SpeechSynthesisUtterance(text);
    u.rate = RATE;
    u.onboundary = (event: SpeechSynthesisEvent) => {
      // Only word boundaries mark a word start; skip sentence-level boundaries.
      if (event.name && event.name !== 'word') return;
      setActiveIndex(wordIndexAtChar(base + event.charIndex));
    };
    u.onend = () => {
      setActiveIndex(-1);
      setPlaying(false);
    };
    u.onerror = () => {
      setActiveIndex(-1);
      setPlaying(false);
    };

    setActiveIndex(fromWord);
    setPlaying(true);
    window.speechSynthesis.speak(u);
  };

  const handlePlay = () => speakFrom(0);

  const handleStop = () => {
    if (SPEECH_SUPPORTED) window.speechSynthesis.cancel();
    setPlaying(false);
    setActiveIndex(-1);
  };

  // Clicking a word: with speech, re-speak from there; without, just highlight.
  const handleSeekWord = (i: number) => {
    if (SPEECH_SUPPORTED) speakFrom(i);
    else setActiveIndex(i);
  };

  // Cancel any in-flight speech when the demo unmounts (no leaked utterance).
  useEffect(() => {
    return () => {
      if (SPEECH_SUPPORTED) window.speechSynthesis.cancel();
    };
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handlePlay}
          disabled={!SPEECH_SUPPORTED}
          className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
        >
          {playing ? 'Playing…' : 'Play'}
        </button>
        <button
          type="button"
          onClick={handleStop}
          disabled={!SPEECH_SUPPORTED || !playing}
          className="inline-flex h-9 items-center rounded-md border border-input bg-background px-4 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
        >
          Stop
        </button>
      </div>

      <SyncedTranscriptViewer
        words={words}
        activeIndex={activeIndex}
        onSeekWord={handleSeekWord}
      />

      {!SPEECH_SUPPORTED && (
        <p className="text-sm text-muted-foreground">
          Speech synthesis isn&apos;t available in this browser. Click a word to
          highlight it.
        </p>
      )}
    </div>
  );
}
