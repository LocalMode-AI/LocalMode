'use client';

import * as React from 'react';
import { cn } from '@/registry/localmode/lib/utils';
import { WaveformActivityBars } from '@/components/waveform-activity-bars';

/**
 * The shape of one synthesized clause. Matches `SynthesizedClause` from
 * `@localmode/core` (`useStreamSpeech().clauses`), but only requires the fields
 * this panel renders.
 */
export interface StreamingClause {
  /** The source clause text. */
  text: string;
  /** Zero-based index of this clause within the stream. */
  clauseIndex: number;
}

/** Props for {@link StreamingSpeechPanel}. */
export interface StreamingSpeechPanelProps {
  /** True while clauses are being synthesized. */
  isSynthesizing: boolean;
  /** True while synthesized clauses are playing. */
  isPlaying: boolean;
  /** The clause currently being played, or `null`. */
  currentClause: StreamingClause | null;
  /** All clauses observed so far during the active stream. */
  clauses: StreamingClause[];
  /**
   * Fired when the user clicks "Download WAV" in the finished state. Wire this to
   * `downloadBlob(wavBlob, 'speech.wav')`. Omit to hide the download action.
   */
  onDownload?: () => void;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/**
 * Status surface for streaming text-to-speech. While synthesis or playback is
 * active it shows a waveform + spinner, a synthesizing/playing label, the
 * processed-clause count, and the current clause in a highlighted box. When the
 * stream completes it shows the clause-count summary, a "generated locally"
 * privacy note, and a Download WAV action.
 *
 * Drive it from `useStreamSpeech()` (`isSynthesizing`, `isPlaying`,
 * `currentClause`, `clauses`); wire `onDownload` to `downloadBlob`.
 *
 * @example
 * ```tsx
 * const speech = useStreamSpeech({ model, voice: 'af_heart' });
 * <StreamingSpeechPanel {...speech} onDownload={() => downloadBlob(wav, 'speech.wav')} />
 * ```
 */
export function StreamingSpeechPanel({
  isSynthesizing,
  isPlaying,
  currentClause,
  clauses,
  onDownload,
  className,
}: StreamingSpeechPanelProps) {
  const active = isSynthesizing || isPlaying;
  const count = clauses.length;
  // "Finished" once there is output and nothing is in flight.
  const finished = !active && count > 0;

  const label = isSynthesizing
    ? isPlaying
      ? 'Synthesizing & playing…'
      : 'Synthesizing…'
    : isPlaying
      ? 'Playing…'
      : 'Done';

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-card-foreground',
        className,
      )}
    >
      {active && (
        <>
          <div className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-3">
            <WaveformActivityBars active height={24} barCount={7} />
            <span
              className="size-4 shrink-0 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary motion-reduce:animate-none"
              aria-hidden="true"
            />
            <span className="min-w-0 truncate text-sm font-medium">{label}</span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {count} clause{count === 1 ? '' : 's'}
            </span>
          </div>

          {currentClause && (
            <div className="rounded-md bg-primary/10 px-3 py-2 ring-1 ring-inset ring-primary/20">
              <span className="text-[11px] font-medium tracking-wide text-primary uppercase">
                Now playing
              </span>
              <p className="whitespace-pre-wrap break-words text-sm text-foreground [overflow-wrap:anywhere]">{currentClause.text}</p>
            </div>
          )}
        </>
      )}

      {finished && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {count} clause{count === 1 ? '' : 's'} synthesized
            </span>
            {onDownload && (
              <button
                type="button"
                onClick={onDownload}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-3 text-sm font-medium shadow-xs transition-colors',
                  'hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                )}
              >
                <span
                  aria-hidden="true"
                  className="block size-0 border-x-[5px] border-t-[7px] border-x-transparent border-t-current"
                />
                Download WAV
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Generated locally on your device - audio never left your browser.
          </p>
        </div>
      )}

      {!active && !finished && (
        <div className="flex items-center gap-3">
          <WaveformActivityBars active={false} height={24} barCount={7} />
          <span className="text-sm text-muted-foreground">Ready to synthesize.</span>
        </div>
      )}
    </div>
  );
}
