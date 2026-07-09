'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/registry/localmode/lib/utils';
import { WaveformActivityBars } from '@/components/waveform-activity-bars';

/**
 * The minimal voice shape every variant consumes. Matches the `KokoroVoice`
 * contract from `@localmode/transformers` (29 English voices) but stays generic
 * so future multi-voice providers fit.
 */
export interface VoiceOption {
  /** Voice ID used in synthesis (e.g. `af_heart`). */
  id: string;
  /** Display name (e.g. `Heart`). */
  name: string;
  /** Speaker gender, used for the color-coded badge. */
  gender: 'female' | 'male';
  /** Language display label used to group voices (e.g. `American English`). */
  languageLabel: string;
}

/** Group voices by their `languageLabel`, preserving first-seen order. */
function groupByLanguage(voices: VoiceOption[]) {
  const groups = new Map<string, VoiceOption[]>();
  for (const voice of voices) {
    const list = groups.get(voice.languageLabel) ?? [];
    list.push(voice);
    groups.set(voice.languageLabel, list);
  }
  return [...groups.entries()];
}

const GENDER_GLYPH: Record<VoiceOption['gender'], string> = {
  female: '♀', // ♀
  male: '♂', // ♂
};

/** Props for {@link VoicePicker}. */
export interface VoicePickerProps {
  /** The voices to choose from. */
  voices: VoiceOption[];
  /** Currently selected voice id. */
  value?: string;
  /** Fired with the chosen voice id. */
  onValueChange?: (voiceId: string) => void;
  /** Disable the control. */
  disabled?: boolean;
  /** Accessible label. @default "Voice" */
  label?: string;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/**
 * Compact, language-grouped `<select>` for TTS voice selection. Voices are
 * partitioned into `<optgroup>` by language, each option showing the voice name
 * plus a gender glyph. Emits the chosen voice id.
 *
 * @example
 * ```tsx
 * <VoicePicker voices={KOKORO_VOICES} value={voice} onValueChange={setVoice} />
 * ```
 */
export function VoicePicker({
  voices,
  value,
  onValueChange,
  disabled,
  label = 'Voice',
  className,
}: VoicePickerProps) {
  const groups = groupByLanguage(voices);

  return (
    <div className="relative inline-flex max-w-full">
      <select
        aria-label={label}
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onValueChange?.(e.target.value)}
        className={cn(
          'h-9 min-w-0 max-w-full appearance-none rounded-md border border-input bg-background pl-3 pr-8 text-sm text-foreground shadow-xs outline-none',
          'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
          'disabled:pointer-events-none disabled:opacity-50',
          className,
        )}
      >
        {groups.map(([language, list]) => (
          <optgroup key={language} label={language}>
            {list.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.name} {GENDER_GLYPH[voice.gender]}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

/** Props for {@link VoiceCard}. */
export interface VoiceCardProps {
  /** The voice this card represents. */
  voice: VoiceOption;
  /** Whether this card is the selected voice. */
  selected?: boolean;
  /** Fired when the card body is clicked (selection). */
  onSelect?: (voiceId: string) => void;
  /**
   * Fired when the preview button is pressed. Receives the voice id; the app
   * synthesizes a local sample (e.g. via `useSynthesizeSpeech`). Omit to hide
   * the preview button.
   */
  onPreview?: (voiceId: string) => void;
  /** True while this voice's preview is being synthesized. */
  loading?: boolean;
  /** True while this voice's preview is playing (toggles to a stop affordance). */
  playing?: boolean;
  /** Additional class names merged onto the root element. */
  className?: string;
}

const GENDER_BADGE: Record<VoiceOption['gender'], string> = {
  female:
    'bg-pink-500/10 text-pink-700 dark:text-pink-400 ring-1 ring-inset ring-pink-500/20',
  male: 'bg-sky-500/10 text-sky-700 dark:text-sky-400 ring-1 ring-inset ring-sky-500/20',
};

/**
 * A rich voice card: name, color-coded gender badge, monospace voice id, and a
 * circular play/stop preview button with a loading state. The card is a
 * non-interactive container holding two **distinct sibling buttons** — a
 * circular preview button (plays a locally-synthesized sample; wire `onPreview`
 * to `useSynthesizeSpeech`) and a selection button covering the name/id — so
 * there is no invalid interactive-element-nested-in-interactive-element ARIA.
 * The selection button carries `aria-pressed` to announce the selected state.
 */
export function VoiceCard({
  voice,
  selected,
  onSelect,
  onPreview,
  loading,
  playing,
  className,
}: VoiceCardProps) {
  return (
    <div
      data-selected={selected || undefined}
      className={cn(
        'flex items-center gap-3 rounded-lg border bg-card p-3 text-card-foreground transition-colors',
        'has-[button:hover]:bg-accent/50',
        selected
          ? 'border-transparent ring-2 ring-primary ring-offset-1 ring-offset-background'
          : 'border-border',
        className,
      )}
    >
      {onPreview && (
        <button
          type="button"
          aria-label={playing ? `Stop ${voice.name} preview` : `Preview ${voice.name}`}
          onClick={() => onPreview(voice.id)}
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-full transition-colors',
            'bg-primary text-primary-foreground hover:bg-primary/90',
            'disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
          )}
          disabled={loading}
        >
          {loading ? (
            <WaveformActivityBars active barCount={3} height={14} color="currentColor" />
          ) : playing ? (
            // Stop glyph
            <span className="block size-3 rounded-[2px] bg-current" />
          ) : (
            // Play glyph
            <span className="ml-0.5 block size-0 border-y-[6px] border-l-[10px] border-y-transparent border-l-current" />
          )}
        </button>
      )}

      <button
        type="button"
        aria-pressed={selected}
        aria-label={`Select ${voice.name}`}
        onClick={() => onSelect?.(voice.id)}
        className="flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-md text-left transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <span className="flex min-w-0 max-w-full items-center gap-2">
          <span className="min-w-0 truncate text-sm font-medium">{voice.name}</span>
          <span
            className={cn(
              'shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium capitalize',
              GENDER_BADGE[voice.gender],
            )}
          >
            {voice.gender}
          </span>
        </span>
        <code className="block min-w-0 max-w-full truncate text-xs text-muted-foreground" title={voice.id}>
          {voice.id}
        </code>
      </button>
    </div>
  );
}

/** Props for {@link VoiceGrid}. */
export interface VoiceGridProps {
  /** The voices to render as cards. */
  voices: VoiceOption[];
  /** Currently selected voice id. */
  value?: string;
  /** Fired when a card is selected. */
  onValueChange?: (voiceId: string) => void;
  /** Fired when a card's preview is pressed. */
  onPreview?: (voiceId: string) => void;
  /** The voice id currently synthesizing a preview. */
  loadingVoiceId?: string | null;
  /** The voice id currently playing a preview. */
  playingVoiceId?: string | null;
  /** When true, show a search box that filters voices by name / id. @default true */
  filterable?: boolean;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/**
 * A language-grouped grid of {@link VoiceCard}s with an optional search box.
 * Each group shows a count header. Consumes the same `VoiceOption[]` contract
 * as {@link VoicePicker}; wire `onPreview` to `useSynthesizeSpeech` to let users
 * hear a voice before selecting.
 */
export function VoiceGrid({
  voices,
  value,
  onValueChange,
  onPreview,
  loadingVoiceId,
  playingVoiceId,
  filterable = true,
  className,
}: VoiceGridProps) {
  const [query, setQuery] = React.useState('');

  const filtered = query.trim()
    ? voices.filter((v) => {
        const q = query.toLowerCase();
        return v.name.toLowerCase().includes(q) || v.id.toLowerCase().includes(q);
      })
    : voices;

  const groups = groupByLanguage(filtered);

  return (
    <div className={cn('@container flex w-full flex-col gap-4', className)}>
      {filterable && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search voices…"
          aria-label="Search voices"
          className={cn(
            'h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none',
            'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
          )}
        />
      )}

      {groups.length === 0 && (
        <p className="text-sm text-muted-foreground">No voices match “{query}”.</p>
      )}

      {groups.map(([language, list]) => (
        <div key={language} className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {language}
            </h4>
            <span className="text-xs text-muted-foreground">{list.length}</span>
          </div>
          <div className="grid grid-cols-1 gap-2 @sm:grid-cols-2 @xl:grid-cols-3">
            {list.map((voice) => (
              <VoiceCard
                key={voice.id}
                voice={voice}
                selected={value === voice.id}
                onSelect={onValueChange}
                onPreview={onPreview}
                loading={loadingVoiceId === voice.id}
                playing={playingVoiceId === voice.id}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
