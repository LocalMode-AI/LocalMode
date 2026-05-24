/**
 * @file synthesis-panel.tsx
 * @description Text input with streaming synthesis, voice selector, speed control
 */
'use client';

import { Play, Pause, Square, Download, Mic, Type, Zap } from 'lucide-react';
import { useVoiceStudio } from '../_hooks/use-voice-studio';
import { cn } from '../_lib/utils';
import { Spinner } from './ui';
import { ErrorAlert } from './error-boundary';
import { SPEED_MIN, SPEED_MAX, SPEED_STEP, MAX_TEXT_LENGTH, SAMPLE_TEXTS } from '../_lib/constants';

/** Streaming synthesis panel with full controls */
export function SynthesisPanel() {
  const {
    inputText, setInputText,
    selectedVoice, setSelectedVoice,
    speed, setSpeed,
    voices,
    isSynthesizing, isPlaying, isActive,
    currentClause, clauses, hasFinished,
    error,
    synthesize, stop, pause, resume, downloadAudio,
  } = useVoiceStudio();

  const charCount = inputText.length;
  const isOverLimit = charCount > MAX_TEXT_LENGTH;

  return (
    <div className="space-y-5">
      {error && <ErrorAlert message={error.message} />}

      {/* Controls row */}
      <div className="card bg-poster-surface border border-poster-border/20 shadow-lg">
        <div className="card-body p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Mic className="w-4 h-4 text-poster-accent-teal" />
            <span className="text-sm font-semibold">Voice & Speed</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-poster-text-sub/60 mb-1.5 block">Voice</label>
              <select
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                disabled={isActive}
                className="select select-bordered w-full bg-black/20 border-poster-border/20 text-sm"
              >
                {Array.from(new Set(voices.map(v => v.languageLabel))).map(lang => (
                  <optgroup key={lang} label={lang}>
                    {voices.filter(v => v.languageLabel === lang).map(v => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.gender === 'female' ? '♀' : '♂'}) — {v.id}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-poster-text-sub/60 mb-1.5 block">Speed: {speed.toFixed(1)}x</label>
              <input
                type="range" min={SPEED_MIN} max={SPEED_MAX} step={SPEED_STEP} value={speed}
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                disabled={isActive}
                className="range range-accent range-sm w-full"
              />
              <div className="flex justify-between text-[10px] text-poster-text-sub/40 mt-1">
                <span>{SPEED_MIN}x</span><span>1.0x</span><span>{SPEED_MAX}x</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Text input */}
      <div className="card bg-poster-surface border border-poster-border/20 shadow-lg">
        <div className="card-body p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Type className="w-4 h-4 text-poster-accent-teal" />
              <span className="text-sm font-semibold">Text</span>
            </div>
            <span className={cn('text-xs font-mono', isOverLimit ? 'text-error' : 'text-poster-text-sub/50')}>
              {charCount}/{MAX_TEXT_LENGTH}
            </span>
          </div>

          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Enter text to synthesize..."
            className={cn(
              'textarea textarea-bordered w-full min-h-[120px] bg-black/20',
              'border-poster-border/20 text-[15px] leading-relaxed resize-y',
              isOverLimit && 'textarea-error'
            )}
          />

          {/* Sample text buttons */}
          <div className="flex flex-wrap gap-2">
            {SAMPLE_TEXTS.map((sample, i) => (
              <button
                key={i}
                onClick={() => setInputText(sample)}
                className="btn btn-ghost btn-xs text-poster-text-sub/60 hover:text-poster-accent-teal"
              >
                <Zap className="w-3 h-3 mr-1" />
                Sample {i + 1}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex justify-center gap-3">
        {isActive ? (
          <>
            {isPlaying && (
              <button onClick={pause} className="btn btn-ghost btn-md px-6"><Pause className="w-4 h-4 mr-2" />Pause</button>
            )}
            {!isPlaying && !isSynthesizing && (
              <button onClick={resume} className="btn btn-ghost btn-md px-6"><Play className="w-4 h-4 mr-2" />Resume</button>
            )}
            <button onClick={stop} className="btn btn-ghost btn-md px-6"><Square className="w-4 h-4 mr-2" />Stop</button>
          </>
        ) : (
          <button
            onClick={synthesize}
            disabled={!inputText.trim() || isOverLimit}
            className={cn(
              'btn btn-md px-10 gap-2 text-white font-semibold shadow-lg transition-all',
              'bg-gradient-to-r from-poster-accent-teal to-poster-accent-teal/80',
              'hover:shadow-poster-accent-teal/25 hover:shadow-xl hover:scale-[1.02]',
              'disabled:opacity-40 active:scale-[0.98]'
            )}
          >
            <Play className="w-4 h-4" />
            Synthesize
          </button>
        )}
      </div>

      {/* Streaming progress */}
      {isActive && (
        <div className="card bg-poster-surface border border-poster-accent-teal/20 shadow-xl animate-in fade-in duration-300">
          <div className="card-body p-5 space-y-3">
            <div className="flex items-center gap-3">
              <Spinner size="md" className="text-poster-accent-teal" />
              <div className="flex-1">
                <p className="text-sm font-semibold">{isSynthesizing ? 'Synthesizing...' : 'Playing...'}</p>
                <p className="text-xs text-poster-text-sub/60">{clauses.length} clause{clauses.length !== 1 ? 's' : ''} processed</p>
              </div>
            </div>
            {currentClause && (
              <div className="px-4 py-2 rounded-lg bg-poster-accent-teal/5 border border-poster-accent-teal/10">
                <p className="text-xs text-poster-text-sub/50 mb-1">Now playing:</p>
                <p className="text-sm italic">&ldquo;{currentClause.text}&rdquo;</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Finished state */}
      {hasFinished && (
        <div className="card bg-poster-surface border border-poster-accent-teal/20 shadow-xl animate-in fade-in duration-500">
          <div className="card-body p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{clauses.length} clause{clauses.length !== 1 ? 's' : ''} synthesized</p>
              <button onClick={downloadAudio} className="btn btn-ghost btn-sm gap-1.5 text-poster-accent-teal">
                <Download className="w-4 h-4" />Download WAV
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
