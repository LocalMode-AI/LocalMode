'use client';

import * as React from 'react';
import { useObjectUrl } from '@/lib/browser-utils';
import { cn } from '@/registry/localmode/lib/utils';
import { VoicePicker, type VoiceOption } from '@/components/voice-picker';

/** One side of the A/B comparison. */
export interface ComparisonColumn {
  /** Currently selected voice id for this column. */
  voiceId?: string;
  /**
   * Synthesized audio for this column, or `null` before Compare runs. Pass a
   * local `Blob` (e.g. from `useSynthesizeSpeech`) or an object URL string.
   */
  audio?: Blob | string | null;
}

/** Props for {@link VoiceComparisonPanel}. */
export interface VoiceComparisonPanelProps {
  /** The voices available in both column pickers. */
  voices: VoiceOption[];
  /** State for column A. */
  columnA: ComparisonColumn;
  /** State for column B. */
  columnB: ComparisonColumn;
  /** Fired when column A's voice changes. */
  onVoiceAChange?: (voiceId: string) => void;
  /** Fired when column B's voice changes. */
  onVoiceBChange?: (voiceId: string) => void;
  /** The shared comparison text. */
  text: string;
  /** Fired when the shared text changes. */
  onTextChange?: (text: string) => void;
  /** Fired when Compare is clicked — synthesize both columns from `text`. */
  onCompare?: () => void;
  /** True while a comparison is synthesizing (disables Compare, shows loader). */
  loading?: boolean;
  /** Labels for the two columns. @default ["Voice A", "Voice B"] */
  labels?: [string, string];
  /** Additional class names merged onto the root element. */
  className?: string;
}

/** Resolve a Blob | string | null audio source to a stable playable URL. */
function useAudioSrc(audio: Blob | string | null | undefined) {
  // useObjectUrl creates/revokes the object URL for Blobs; strings pass through.
  const objectUrl = useObjectUrl(typeof audio === 'string' ? null : audio);
  return typeof audio === 'string' ? audio : objectUrl;
}

/** A single labeled comparison column: picker + native audio player. */
function Column({
  label,
  voices,
  voiceId,
  onVoiceChange,
  audio,
}: {
  label: string;
  voices: VoiceOption[];
  voiceId?: string;
  onVoiceChange?: (id: string) => void;
  audio?: Blob | string | null;
}) {
  const src = useAudioSrc(audio);

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-lg border border-border bg-card p-3">
      <span className="min-w-0 truncate text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <VoicePicker
        voices={voices}
        value={voiceId}
        onValueChange={onVoiceChange}
        label={`${label} voice`}
        className="w-full"
      />
      {src ? (
         
        <audio src={src} controls className="w-full" />
      ) : (
        <div className="flex h-10 items-center rounded-md border border-dashed border-border px-3 text-xs text-muted-foreground">
          No audio yet - run Compare.
        </div>
      )}
    </div>
  );
}

/**
 * A/B voice comparison: two labeled columns, each with a language-grouped voice
 * select and a native `<audio>` player (shown once audio is set), a shared
 * comparison textarea, and a Compare button with a loading state.
 *
 * Wire `onCompare` to synthesize the shared text through both voices (e.g. two
 * `useSynthesizeSpeech` calls) and pass the resulting Blobs back via
 * `columnA.audio` / `columnB.audio`.
 *
 * @example
 * ```tsx
 * <VoiceComparisonPanel
 *   voices={KOKORO_VOICES}
 *   columnA={{ voiceId: a, audio: audioA }}
 *   columnB={{ voiceId: b, audio: audioB }}
 *   onVoiceAChange={setA}
 *   onVoiceBChange={setB}
 *   text={text}
 *   onTextChange={setText}
 *   onCompare={compare}
 * />
 * ```
 */
export function VoiceComparisonPanel({
  voices,
  columnA,
  columnB,
  onVoiceAChange,
  onVoiceBChange,
  text,
  onTextChange,
  onCompare,
  loading,
  labels = ['Voice A', 'Voice B'],
  className,
}: VoiceComparisonPanelProps) {
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Column
          label={labels[0]}
          voices={voices}
          voiceId={columnA.voiceId}
          onVoiceChange={onVoiceAChange}
          audio={columnA.audio}
        />
        <Column
          label={labels[1]}
          voices={voices}
          voiceId={columnB.voiceId}
          onVoiceChange={onVoiceBChange}
          audio={columnB.audio}
        />
      </div>

      <textarea
        value={text}
        onChange={(e) => onTextChange?.(e.target.value)}
        rows={3}
        placeholder="Enter text to synthesize with both voices…"
        aria-label="Comparison text"
        className={cn(
          'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs outline-none',
          'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        )}
      />

      <button
        type="button"
        onClick={onCompare}
        disabled={loading || !text.trim()}
        className={cn(
          'inline-flex h-9 w-fit items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors',
          'hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50',
        )}
      >
        {loading && (
          <span
            className="size-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground"
            aria-hidden="true"
          />
        )}
        Compare
      </button>
    </div>
  );
}
