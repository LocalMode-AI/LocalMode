'use client';

import * as React from 'react';
import { cn } from '@/registry/localmode/lib/utils';
import { WaveformActivityBars } from '@/components/waveform-activity-bars';

/** The explicit push-to-talk state machine. */
export type VoiceButtonState =
  | 'idle'
  | 'recording'
  | 'processing'
  | 'success'
  | 'error';

/** Props for {@link VoiceButton}. */
export interface VoiceButtonProps {
  /**
   * The current state in the push-to-talk machine. Controlled by the app:
   * `idle → recording` on press, `processing` while Whisper runs, then
   * `success`/`error`.
   */
  state: VoiceButtonState;
  /** Fired when the user presses to start recording (from `idle`). */
  onStart?: () => void;
  /** Fired when the user releases / clicks to stop recording. */
  onStop?: () => void;
  /**
   * Live mic volume in `[0, 1]` for the in-button waveform during recording.
   * Wire it to `useVoiceRecorder().getVolume()` sampled in a
   * `requestAnimationFrame` loop (or any local `AnalyserNode` source).
   */
  volume?: number;
  /** Label shown next to the icon. Defaults to a state-appropriate string. */
  label?: string;
  /** Diameter in pixels. @default 56 */
  size?: number;
  /** Additional class names merged onto the root element. */
  className?: string;
}

const STATE_LABEL: Record<VoiceButtonState, string> = {
  idle: 'Hold to talk',
  recording: 'Recording… release to send',
  processing: 'Transcribing…',
  success: 'Done',
  error: 'Try again',
};

/**
 * A press-to-record / release-to-transcribe push-to-talk button with an
 * explicit visual state machine: `idle → recording` (animated pulse rings +
 * live waveform) `→ processing` (loader) `→ success`/`error`. Recording is the
 * app's job (`useVoiceRecorder` → `getUserMedia`/`MediaRecorder`); transcription
 * routes to local Whisper (`useTranscribe`). This component renders the state
 * and emits press/release events.
 *
 * @example
 * ```tsx
 * const recorder = useVoiceRecorder();
 * const stt = useTranscribe({ model });
 * <VoiceButton
 *   state={state}
 *   onStart={() => { setState('recording'); recorder.startRecording(); }}
 *   onStop={async () => {
 *     setState('processing');
 *     const blob = await recorder.stopRecording();
 *     const res = await stt.execute(blob!);
 *     setState(res ? 'success' : 'error');
 *   }}
 *   volume={micVolume}
 * />
 * ```
 */
export function VoiceButton({
  state,
  onStart,
  onStop,
  volume,
  label,
  size = 56,
  className,
}: VoiceButtonProps) {
  const isRecording = state === 'recording';
  const isBusy = state === 'processing';

  const handlePointerDown = () => {
    if (state === 'idle' || state === 'success' || state === 'error') onStart?.();
  };
  const handlePointerUp = () => {
    if (state === 'recording') onStop?.();
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (event.repeat) return;
    if (state === 'idle' || state === 'success' || state === 'error') {
      event.preventDefault();
      onStart?.();
    }
  };
  const handleKeyUp = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (state === 'recording') {
      event.preventDefault();
      onStop?.();
    }
  };

  return (
    <div className={cn('inline-flex items-center gap-3', className)}>
      <div className="relative" style={{ width: size, height: size }}>
        {/* Pulse rings while recording */}
        {isRecording && (
          <>
            <span
              className="absolute inset-0 animate-ping rounded-full bg-destructive/30 motion-reduce:animate-none"
              aria-hidden="true"
            />
            <span
              className="absolute inset-0 rounded-full bg-destructive/20"
              aria-hidden="true"
            />
          </>
        )}

        <button
          type="button"
          aria-label={STATE_LABEL[state]}
          aria-pressed={isRecording}
          disabled={isBusy}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          className={cn(
            'relative flex size-full items-center justify-center rounded-full text-white transition-colors outline-none',
            'focus-visible:ring-[3px] focus-visible:ring-ring/50',
            state === 'idle' && 'bg-primary hover:bg-primary/90 text-primary-foreground',
            isRecording && 'bg-destructive',
            isBusy && 'bg-muted text-muted-foreground',
            state === 'success' && 'bg-emerald-600',
            state === 'error' && 'bg-destructive',
          )}
        >
          {isRecording ? (
            <WaveformActivityBars
              state="record"
              volume={volume}
              height={Math.round(size * 0.4)}
              barCount={4}
              color="currentColor"
            />
          ) : isBusy ? (
            <span
              className="size-5 animate-spin rounded-full border-2 border-current/30 border-t-current"
              aria-hidden="true"
            />
          ) : state === 'success' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="size-6" aria-hidden="true">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          ) : state === 'error' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="size-6" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          ) : (
            // Mic glyph
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-6" aria-hidden="true">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
            </svg>
          )}
        </button>
      </div>

      <span className="text-sm text-muted-foreground">{label ?? STATE_LABEL[state]}</span>
    </div>
  );
}
