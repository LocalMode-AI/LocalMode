'use client';

import * as React from 'react';
import { useObjectUrl } from '@/lib/browser-utils';
import { cn } from '@/registry/localmode/lib/utils';

/**
 * One time-aligned word. Matches the shape you can derive from `useTranscribe`
 * word-level timestamps (`{ text, start, end }` in seconds).
 */
export interface TimedWord {
  /** The word text. */
  text: string;
  /** Start time in seconds. */
  start: number;
  /** End time in seconds. */
  end: number;
}

/**
 * Find the index of the word active at `time` via binary search. Returns the
 * last word whose `start <= time`, or -1 before the first word starts.
 */
function activeWordIndex(words: TimedWord[], time: number): number {
  let lo = 0;
  let hi = words.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid].start <= time) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  // Only highlight if we're still within (or just past) the word's window.
  if (result >= 0 && time > words[result].end + 0.25 && result < words.length - 1) {
    // Between words: keep the previous word dim rather than highlighted.
    if (time < words[result + 1].start) return -1;
  }
  return result;
}

/** Props for {@link SyncedTranscriptViewer}. */
export interface SyncedTranscriptViewerProps {
  /** The time-aligned words to render. */
  words: TimedWord[];
  /**
   * Local audio to play — a `Blob` (e.g. a recording) or URL. Optional: when
   * omitted, drive the highlight externally via {@link SyncedTranscriptViewerProps.activeIndex}.
   */
  audio?: Blob | string;
  /**
   * Controlled active-word index. When provided (not `undefined`), it OVERRIDES
   * the internal audio-`currentTime`-derived index — e.g. driven by streaming
   * STT progress or TTS boundary events. Use `-1` for no highlighted word.
   */
  activeIndex?: number;
  /**
   * Called when a word is clicked (when no `audio` is provided). Wire this to
   * seek your external driver (e.g. re-speak from that word).
   */
  onSeekWord?: (index: number, word: TimedWord) => void;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/**
 * @file synced-transcript-viewer.tsx
 * @description Karaoke-style transcript viewer. Drive it two ways: pass recording `audio` and it highlights each word from playback `currentTime` (click a word to seek); or pass a controlled `activeIndex` from an external driver (streaming STT progress / TTS boundary events) and handle `onSeekWord`. Feed `words` from `useTranscribe`.
 * @constraint shadcn tokens only; zero @localmode/* imports.
 *
 * @example
 * ```tsx
 * // Recording-driven:
 * <SyncedTranscriptViewer words={words} audio={recordingBlob} />
 * // Externally driven (e.g. TTS boundary events):
 * <SyncedTranscriptViewer words={words} activeIndex={i} onSeekWord={(i) => speakFrom(i)} />
 * ```
 */
export function SyncedTranscriptViewer({
  words,
  audio,
  activeIndex: controlledIndex,
  onSeekWord,
  className,
}: SyncedTranscriptViewerProps) {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = React.useState(0);

  // useObjectUrl creates/revokes the object URL for Blobs; strings pass through.
  const objectUrl = useObjectUrl(!audio || typeof audio === 'string' ? null : audio);
  const src = typeof audio === 'string' ? audio : objectUrl;

  // A controlled `activeIndex` (external driver) wins over the audio-derived one.
  const activeIndex =
    controlledIndex !== undefined
      ? controlledIndex
      : activeWordIndex(words, currentTime);

  const seekTo = (i: number, word: TimedWord) => {
    if (audio) {
      const el = audioRef.current;
      if (el) {
        el.currentTime = word.start;
        void el.play();
      }
      setCurrentTime(word.start);
    } else {
      onSeekWord?.(i, word);
    }
  };

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <p className="text-base leading-relaxed">
        {words.map((word, i) => {
          const isActive = i === activeIndex;
          const isPast = i < activeIndex;
          return (
            <React.Fragment key={i}>
              <button
                type="button"
                onClick={() => seekTo(i, word)}
                className={cn(
                  'rounded px-0.5 transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  isActive && 'bg-primary text-primary-foreground',
                  isPast && 'text-foreground',
                  !isActive && !isPast && 'text-muted-foreground hover:text-foreground',
                )}
              >
                {word.text}
              </button>{' '}
            </React.Fragment>
          );
        })}
      </p>

      {audio ? (
        <audio
          ref={audioRef}
          src={src ?? undefined}
          controls
          className="w-full"
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onSeeked={(e) => setCurrentTime(e.currentTarget.currentTime)}
        />
      ) : null}
    </div>
  );
}
