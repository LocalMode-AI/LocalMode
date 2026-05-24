/**
 * @file tts-view.tsx
 * @description Main view for the audiobook creator with Kokoro TTS, voice selection, streaming playback, and speed control
 */
'use client';

import Link from 'next/link';
import { Volume2, Play, Pause, Square, Download, X, Type, Headphones, ArrowLeft, Mic } from 'lucide-react';
import { Button, Spinner } from './ui';
import { ErrorBoundary, ErrorAlert } from './error-boundary';
import { useTTS } from '../_hooks/use-tts';
import { cn } from '../_lib/utils';
import { MODEL_CONFIG, MAX_TEXT_LENGTH, SPEED_MIN, SPEED_MAX, SPEED_STEP } from '../_lib/constants';

/** Main TTS view with voice selection, streaming synthesis, and speed control */
export function TTSView() {
  const {
    inputText, setInputText,
    selectedVoice, setSelectedVoice,
    speed, setSpeed,
    voices,
    isGenerating, isSynthesizing, isPlaying,
    currentClause, clauses,
    error,
    generateSpeech, cancelGeneration, pause, resume,
    downloadAudio, clearError, reset,
  } = useTTS();

  const charCount = inputText.length;
  const isOverLimit = charCount > MAX_TEXT_LENGTH;
  const charPercent = Math.min(Math.round((charCount / MAX_TEXT_LENGTH) * 100), 100);
  const hasFinished = clauses.length > 0 && !isGenerating;

  return (
    <div className="h-[calc(100vh-4rem)] bg-poster-bg text-poster-text-main font-sans selection:bg-poster-accent-purple/30 relative overflow-hidden">
      <div className="bg-grid fixed inset-0 z-0 pointer-events-none opacity-50" />

      <div className="relative z-10 flex flex-col h-full">
        {/* Header */}
        <div className="h-14 min-h-14 border-b border-poster-border/20 flex items-center justify-between px-5 bg-poster-surface/60 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-poster-surface-lighter/50 text-poster-text-sub hover:text-poster-text-main transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="w-px h-5 bg-poster-border/20" />
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-poster-accent-purple/15 flex items-center justify-center ring-1 ring-poster-accent-purple/30">
                <Headphones className="w-4 h-4 text-poster-accent-purple" />
              </div>
              <div>
                <h1 className="text-sm font-semibold text-poster-text-main leading-tight">Audiobook Creator</h1>
                <p className="text-[11px] text-poster-text-sub/60 leading-tight">Kokoro TTS — 29 English voices</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-md bg-poster-accent-purple/10 text-[11px] font-medium text-poster-accent-purple border border-poster-accent-purple/20">
              Kokoro {MODEL_CONFIG.modelSize}
            </span>
            {(clauses.length > 0 || inputText) && (
              <Button variant="ghost" size="xs" onClick={() => reset()}>
                <X className="w-3 h-3 mr-1" />
                Reset
              </Button>
            )}
          </div>
        </div>

        {/* Error alert */}
        {error && (
          <div className="px-6 pt-4">
            <ErrorAlert message={error.message} onDismiss={() => clearError()} onRetry={generateSpeech} />
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-2xl mx-auto space-y-6">
            <ErrorBoundary>
              {/* Empty state hero */}
              {!isGenerating && !inputText.trim() && clauses.length === 0 && (
                <div className="flex flex-col items-center pt-12 pb-8 animate-in fade-in duration-500">
                  <div className="w-20 h-20 rounded-2xl bg-poster-accent-purple/10 flex items-center justify-center ring-1 ring-poster-accent-purple/20 mb-6">
                    <Headphones className="w-10 h-10 text-poster-accent-purple" />
                  </div>
                  <h2 className="text-2xl font-bold text-poster-text-main mb-2">Audiobook Creator</h2>
                  <p className="text-sm text-poster-text-sub/70 text-center max-w-sm">
                    Convert text to natural speech using Kokoro TTS with 29 voices. Everything runs locally in your browser.
                  </p>
                </div>
              )}

              {/* Voice & Speed Controls */}
              <div className="card bg-poster-surface border border-poster-border/20 shadow-lg overflow-hidden">
                <div className="card-body p-5 space-y-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Mic className="w-4 h-4 text-poster-accent-purple" />
                    <label className="text-sm font-semibold">Voice & Speed</label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Voice selector */}
                    <div>
                      <label className="text-xs text-poster-text-sub/60 mb-1.5 block">Voice</label>
                      <select
                        value={selectedVoice}
                        onChange={(e) => setSelectedVoice(e.target.value)}
                        disabled={isGenerating}
                        className="select select-bordered w-full bg-black/20 border-poster-border/20 text-poster-text-main text-sm"
                      >
                        {Array.from(new Set(voices.map(v => v.languageLabel))).map(lang => (
                          <optgroup key={lang} label={lang}>
                            {voices.filter(v => v.languageLabel === lang).map(v => (
                              <option key={v.id} value={v.id}>
                                {v.name} ({v.gender === 'female' ? '♀' : '♂'})
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>

                    {/* Speed slider */}
                    <div>
                      <label className="text-xs text-poster-text-sub/60 mb-1.5 block">
                        Speed: {speed.toFixed(1)}x
                      </label>
                      <input
                        type="range"
                        min={SPEED_MIN}
                        max={SPEED_MAX}
                        step={SPEED_STEP}
                        value={speed}
                        onChange={(e) => setSpeed(parseFloat(e.target.value))}
                        disabled={isGenerating}
                        className="range range-primary range-sm w-full"
                      />
                      <div className="flex justify-between text-[10px] text-poster-text-sub/40 mt-1">
                        <span>{SPEED_MIN}x</span>
                        <span>1.0x</span>
                        <span>{SPEED_MAX}x</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Text input area */}
              <div className="card bg-poster-surface border border-poster-border/20 shadow-lg overflow-hidden">
                <div className="card-body p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Type className="w-4 h-4 text-poster-accent-purple" />
                      <label className="text-sm font-semibold">Text to Speak</label>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className="radial-progress text-poster-accent-purple"
                        style={{ '--value': charPercent, '--size': '2rem', '--thickness': '3px' } as React.CSSProperties}
                        role="progressbar"
                      >
                        <span className="text-[9px] font-bold text-poster-text-sub">{charPercent}%</span>
                      </div>
                      <span className={cn('text-xs font-mono tabular-nums', isOverLimit ? 'text-error' : 'text-poster-text-sub/60')}>
                        {charCount}/{MAX_TEXT_LENGTH}
                      </span>
                    </div>
                  </div>

                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Enter the text you want to convert to speech..."
                    className={cn(
                      'textarea textarea-bordered w-full min-h-[180px] bg-black/20 text-poster-text-main',
                      'placeholder:text-poster-text-sub/40 focus:border-poster-accent-purple/50 resize-y',
                      'border-poster-border/20 leading-relaxed text-[15px]',
                      isOverLimit && 'textarea-error'
                    )}
                  />
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex justify-center gap-3">
                {isGenerating ? (
                  <>
                    {isPlaying ? (
                      <Button variant="ghost" size="md" onClick={pause} className="px-6">
                        <Pause className="w-4 h-4 mr-2" />
                        Pause
                      </Button>
                    ) : isSynthesizing ? null : (
                      <Button variant="ghost" size="md" onClick={resume} className="px-6">
                        <Play className="w-4 h-4 mr-2" />
                        Resume
                      </Button>
                    )}
                    <Button variant="ghost" size="md" onClick={cancelGeneration} className="px-6">
                      <Square className="w-4 h-4 mr-2" />
                      Stop
                    </Button>
                  </>
                ) : (
                  <button
                    onClick={generateSpeech}
                    disabled={!inputText.trim() || isOverLimit}
                    className={cn(
                      'btn btn-md px-10 gap-2 text-white font-semibold shadow-lg transition-all duration-200',
                      'bg-gradient-to-r from-poster-accent-purple to-poster-accent-purple/80',
                      'hover:shadow-poster-accent-purple/25 hover:shadow-xl hover:scale-[1.02]',
                      'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-lg',
                      'active:scale-[0.98]'
                    )}
                  >
                    <Play className="w-4 h-4" />
                    Generate Speech
                  </button>
                )}
              </div>

              {/* Streaming progress */}
              {isGenerating && (
                <div className="card bg-poster-surface border border-poster-accent-purple/20 shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="card-body p-5 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-poster-accent-purple/10 flex items-center justify-center">
                        <Spinner size="md" className="text-poster-accent-purple" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold">
                          {isSynthesizing ? 'Generating speech...' : 'Playing audio...'}
                        </p>
                        <p className="text-xs text-poster-text-sub/60 mt-0.5">
                          {clauses.length > 0 ? `${clauses.length} clause${clauses.length !== 1 ? 's' : ''} processed` : 'Preparing...'}
                        </p>
                      </div>
                      <div className="flex items-end gap-[3px] h-8">
                        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                          <div
                            key={i}
                            className="w-[3px] rounded-full bg-poster-accent-purple/60 animate-pulse"
                            style={{
                              height: `${12 + Math.sin(i * 0.8) * 10}px`,
                              animationDelay: `${i * 100}ms`,
                              animationDuration: '0.8s',
                            }}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Current clause highlight */}
                    {currentClause && (
                      <div className="px-4 py-2.5 rounded-lg bg-poster-accent-purple/5 border border-poster-accent-purple/10">
                        <p className="text-xs text-poster-text-sub/50 mb-1">Now playing:</p>
                        <p className="text-sm text-poster-text-main italic">&ldquo;{currentClause.text}&rdquo;</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Completed audio info */}
              {hasFinished && (
                <div className="card bg-poster-surface border border-poster-accent-purple/20 shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="card-body p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-poster-accent-purple/15 flex items-center justify-center ring-1 ring-poster-accent-purple/30">
                          <Volume2 className="w-5 h-5 text-poster-accent-purple" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold">Speech Complete</h3>
                          <p className="text-[11px] text-poster-text-sub/50">
                            {clauses.length} clause{clauses.length !== 1 ? 's' : ''} synthesized
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={downloadAudio}
                        className="btn btn-ghost btn-sm gap-1.5 text-poster-accent-purple hover:bg-poster-accent-purple/10"
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </button>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-poster-text-sub/40">
                      <div className="w-1 h-1 rounded-full bg-poster-accent-purple/40" />
                      Audio generated locally with Kokoro TTS. No data sent to any server.
                    </div>
                  </div>
                </div>
              )}

              {/* Subtle empty state when there's text but nothing happening */}
              {!isGenerating && inputText.trim() && clauses.length === 0 && (
                <div className="flex flex-col items-center py-6 animate-in fade-in duration-300">
                  <div className="flex items-end gap-[3px] h-8 opacity-20 mb-3">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
                      <div key={i} className="w-[3px] rounded-full bg-poster-text-sub" style={{ height: `${8 + Math.sin(i * 0.6) * 8}px` }} />
                    ))}
                  </div>
                  <p className="text-xs text-poster-text-sub/40 text-center">
                    Click &quot;Generate Speech&quot; to create your audio
                  </p>
                </div>
              )}
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  );
}
