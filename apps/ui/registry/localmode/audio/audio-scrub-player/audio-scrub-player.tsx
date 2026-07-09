'use client';

import * as React from 'react';
import { useObjectUrl } from '@/lib/browser-utils';
import { cn } from '@/registry/localmode/lib/utils';

/** Format seconds as `m:ss`. */
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Props for {@link ScrubBar}. */
export interface ScrubBarProps {
  /** Current playback position in seconds. */
  currentTime: number;
  /** Total duration in seconds. */
  duration: number;
  /** Fired continuously while dragging, and on click, with the new time. */
  onSeek: (time: number) => void;
  /** Fired once when a drag gesture ends (useful to commit a seek). */
  onSeekEnd?: (time: number) => void;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/**
 * A standalone, draggable seek bar. Controlled via `currentTime` / `duration`;
 * emits the target time on click and drag. Reusable on its own (e.g. over a
 * remote stream) or inside {@link AudioScrubPlayer}.
 */
export function ScrubBar({
  currentTime,
  duration,
  onSeek,
  onSeekEnd,
  className,
}: ScrubBarProps) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const draggingRef = React.useRef(false);
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  const timeFromClientX = (clientX: number) => {
    const track = trackRef.current;
    if (!track || duration <= 0) return 0;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * duration;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    onSeek(timeFromClientX(e.clientX));
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    onSeek(timeFromClientX(e.clientX));
  };
  const handlePointerUp = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const time = timeFromClientX(e.clientX);
    onSeek(time);
    onSeekEnd?.(time);
  };

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(currentTime)}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') onSeek(Math.min(duration, currentTime + 5));
        if (e.key === 'ArrowLeft') onSeek(Math.max(0, currentTime - 5));
      }}
      className={cn(
        'group relative flex h-5 cursor-pointer items-center touch-none select-none outline-none',
        'focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:rounded-full',
        className,
      )}
    >
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-primary"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      <span
        className="absolute size-3 -translate-x-1/2 rounded-full border border-primary bg-background shadow-sm"
        style={{ left: `${progress * 100}%` }}
        aria-hidden="true"
      />
    </div>
  );
}

/** Props for {@link AudioScrubPlayer}. */
export interface AudioScrubPlayerProps {
  /** Local audio to play — a `Blob` (e.g. Kokoro output / a recording) or URL. */
  audio: Blob | string;
  /** Auto-play once loaded. @default false */
  autoPlay?: boolean;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/**
 * A composable scrubbable audio player for local `Blob` / object-URL audio such
 * as Kokoro TTS output (`useSynthesizeSpeech`) or a recording. Provides
 * play/pause, a draggable {@link ScrubBar}, and a time/duration readout. Manages
 * its own `<audio>` element and object-URL lifecycle.
 *
 * @example
 * ```tsx
 * const { data } = useSynthesizeSpeech({ model });
 * {data && <AudioScrubPlayer audio={data.audio} />}
 * ```
 */
export function AudioScrubPlayer({
  audio,
  autoPlay = false,
  className,
}: AudioScrubPlayerProps) {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(0);

  // useObjectUrl creates/revokes the object URL for Blobs; strings pass through.
  const objectUrl = useObjectUrl(typeof audio === 'string' ? null : audio);
  const src = typeof audio === 'string' ? audio : objectUrl;

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  };

  const seek = (time: number) => {
    const el = audioRef.current;
    if (el) el.currentTime = time;
    setCurrentTime(time);
  };

  return (
    <div
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-card-foreground',
        className,
      )}
    >
      <audio
        ref={audioRef}
        src={src ?? undefined}
        autoPlay={autoPlay}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d)) setDuration(d);
        }}
        onDurationChange={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d)) setDuration(d);
        }}
      />

      <button
        type="button"
        aria-label={playing ? 'Pause' : 'Play'}
        onClick={toggle}
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {playing ? (
          <span className="flex gap-1" aria-hidden="true">
            <span className="block h-3.5 w-1 rounded-[1px] bg-current" />
            <span className="block h-3.5 w-1 rounded-[1px] bg-current" />
          </span>
        ) : (
          <span
            className="ml-0.5 block size-0 border-y-[7px] border-l-[11px] border-y-transparent border-l-current"
            aria-hidden="true"
          />
        )}
      </button>

      <ScrubBar
        currentTime={currentTime}
        duration={duration}
        onSeek={seek}
        className="flex-1"
      />

      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>
    </div>
  );
}
