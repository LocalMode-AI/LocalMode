'use client';

import * as React from 'react';
import { useObjectUrl } from '@/lib/browser-utils';
import { cn } from '@/registry/localmode/lib/utils';
import { WaveformActivityBars } from '@/components/waveform-activity-bars';

/** Format a Date as a coarse relative time string (e.g. "3m ago"). */
function relativeTime(date: Date): string {
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Resolve a Blob | string | null audio source to a stable playable URL. */
function useAudioSrc(audio: Blob | string | null | undefined) {
  // useObjectUrl creates/revokes the object URL for Blobs; strings pass through.
  const objectUrl = useObjectUrl(typeof audio === 'string' ? null : audio);
  return typeof audio === 'string' ? audio : objectUrl;
}

/** Props for {@link TranscribedNoteCard}. */
export interface TranscribedNoteCardProps {
  /**
   * When true, render the "transcribing…" placeholder (waveform + label) instead
   * of the populated card. Flip to false once `useTranscribe` resolves.
   */
  transcribing?: boolean;
  /** The transcribed text (shown once `transcribing` is false). */
  text?: string;
  /** When the note was created — shown as relative time, absolute on hover. */
  timestamp?: Date;
  /** Local audio for inline playback (a `Blob` or object URL). */
  audio?: Blob | string | null;
  /** Fired when the hover-revealed delete control is clicked. Omit to hide it. */
  onDelete?: () => void;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/**
 * A transcription list item pairing transcribed text with inline audio
 * playback. It has two variants from one component:
 *
 * - **Placeholder** (`transcribing`) — a {@link WaveformActivityBars} row + a
 *   "Transcribing…" label, the canonical loading state for a
 *   `useOperationList`-backed STT list where items stream in.
 * - **Populated** — a relative timestamp (hover → absolute), the transcript
 *   body, a native `<audio>` footer, and a hover-revealed delete.
 *
 * @example
 * ```tsx
 * <TranscribedNoteCard transcribing /> // while useTranscribe runs
 * <TranscribedNoteCard text={result.text} audio={blob} timestamp={new Date()} onDelete={remove} />
 * ```
 */
export function TranscribedNoteCard({
  transcribing,
  text,
  timestamp,
  audio,
  onDelete,
  className,
}: TranscribedNoteCardProps) {
  const src = useAudioSrc(audio);

  if (transcribing) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn(
          'flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-card-foreground',
          className,
        )}
      >
        <WaveformActivityBars active height={20} barCount={5} />
        <span className="text-sm text-muted-foreground">Transcribing…</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'group flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-card-foreground',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        {timestamp && (
          <time
            dateTime={timestamp.toISOString()}
            title={timestamp.toLocaleString()}
            className="text-xs text-muted-foreground"
          >
            {relativeTime(timestamp)}
          </time>
        )}
        {onDelete && (
          <button
            type="button"
            aria-label="Delete note"
            onClick={onDelete}
            className={cn(
              'shrink-0 rounded-md p-1 text-muted-foreground transition-opacity',
              'opacity-60 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100',
              'hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
            )}
          >
            {/* Trash glyph */}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4"
              aria-hidden="true"
            >
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            </svg>
          </button>
        )}
      </div>

      {text && <p className="whitespace-pre-wrap break-words text-sm text-foreground [overflow-wrap:anywhere]">{text}</p>}

      {src && (
         
        <audio src={src} controls className="mt-1 h-9 w-full" />
      )}
    </div>
  );
}
