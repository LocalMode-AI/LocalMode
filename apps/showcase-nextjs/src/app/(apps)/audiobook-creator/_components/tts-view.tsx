/**
 * @file tts-view.tsx
 * @description Main view for the audiobook creator with text input, audio generation, and playback
 */
'use client';

import { Volume2, Play, Download, X, Type, Headphones, ArrowLeft } from 'lucide-react';
import { Button, Spinner } from './ui';
import { ErrorBoundary, ErrorAlert } from './error-boundary';
import { useTTS } from '../_hooks/use-tts';
import { cn } from '../_lib/utils';
import { MODEL_CONFIG, MAX_TEXT_LENGTH } from '../_lib/constants';

/** Main TTS view with text input, generation controls, and audio player */
export function TTSView() {
  const { inputText, setInputText, audioUrl, isGenerating, error, generateSpeech, cancelGeneration, downloadAudio, clearError, reset } = useTTS();

  const charCount = inputText.length;
  const isOverLimit = charCount > MAX_TEXT_LENGTH;
  const charPercent = Math.min(Math.round((charCount / MAX_TEXT_LENGTH) * 100), 100);

  return (
    <div className="h-[calc(100vh-4rem)] bg-poster-bg text-poster-text-main font-sans selection:bg-poster-accent-purple/30 relative overflow-hidden">
      {/* Background grid */}
      <div className="bg-grid fixed inset-0 z-0 pointer-events-none opacity-50" />

      <div className="relative z-10 flex flex-col h-full">
        {/* Header */}
        <div className="h-14 min-h-14 border-b border-poster-border/20 flex items-center justify-between px-5 bg-poster-surface/60 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <a
              href="/"
              className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-poster-surface-lighter/50 text-poster-text-sub hover:text-poster-text-main transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </a>
            <div className="w-px h-5 bg-poster-border/20" />
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-poster-accent-purple/15 flex items-center justify-center ring-1 ring-poster-accent-purple/30">
                <Headphones className="w-4 h-4 text-poster-accent-purple" />
              </div>
              <div>
                <h1 className="text-sm font-semibold text-poster-text-main leading-tight">Audiobook Creator</h1>
                <p className="text-[11px] text-poster-text-sub/60 leading-tight">Convert text to natural speech</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-md bg-poster-accent-purple/10 text-[11px] font-medium text-poster-accent-purple border border-poster-accent-purple/20">
              MMS-TTS {MODEL_CONFIG.modelSize}
            </span>
            {(audioUrl || inputText) && (
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
            <ErrorAlert
              message={error.message}
              onDismiss={() => clearError()}
              onRetry={generateSpeech}
            />
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-2xl mx-auto space-y-8">
            <ErrorBoundary>
              {/* Empty state hero */}
              {!audioUrl && !isGenerating && !inputText.trim() && (
                <div className="flex flex-col items-center pt-12 pb-8 animate-in fade-in duration-500">
                  <div className="w-20 h-20 rounded-2xl bg-poster-accent-purple/10 flex items-center justify-center ring-1 ring-poster-accent-purple/20 mb-6">
                    <Headphones className="w-10 h-10 text-poster-accent-purple" />
                  </div>
                  <h2 className="text-2xl font-bold text-poster-text-main mb-2">Audiobook Creator</h2>
                  <p className="text-sm text-poster-text-sub/70 text-center max-w-sm">
                    Convert text to natural speech using on-device AI. Everything runs locally in your browser.
                  </p>
                </div>
              )}

              {/* Text input area */}
              <div className="card bg-poster-surface border border-poster-border/20 shadow-lg overflow-hidden">
                <div className="card-body p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Type className="w-4 h-4 text-poster-accent-purple" />
                      <label className="text-sm font-semibold">Text to Speak</label>
                    </div>

                    {/* Character counter as radial progress */}
                    <div className="flex items-center gap-2">
                      <div
                        className="radial-progress text-poster-accent-purple"
                        style={{
                          '--value': charPercent,
                          '--size': '2rem',
                          '--thickness': '3px',
                        } as React.CSSProperties}
                        role="progressbar"
                      >
                        <span className="text-[9px] font-bold text-poster-text-sub">
                          {charPercent}%
                        </span>
                      </div>
                      <span className={cn(
                        'text-xs font-mono tabular-nums',
                        isOverLimit ? 'text-error' : 'text-poster-text-sub/60'
                      )}>
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

              {/* Generate button */}
              <div className="flex justify-center">
                {isGenerating ? (
                  <Button variant="ghost" size="md" onClick={cancelGeneration} className="px-8">
                    <X className="w-4 h-4 mr-2" />
                    Cancel Generation
                  </Button>
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

              {/* Generating indicator */}
              {isGenerating && (
                <div className="flex items-center gap-4 p-5 rounded-2xl bg-poster-surface border border-poster-accent-purple/20 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="w-10 h-10 rounded-xl bg-poster-accent-purple/10 flex items-center justify-center">
                    <Spinner size="md" className="text-poster-accent-purple" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">Generating speech...</p>
                    <p className="text-xs text-poster-text-sub/60 mt-0.5">
                      This may take a moment depending on text length
                    </p>
                  </div>
                  {/* Pulsing waveform bars */}
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
              )}

              {/* Audio player */}
              {audioUrl && (
                <div className="card bg-poster-surface border border-poster-accent-purple/20 shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="card-body p-6 space-y-5">
                    {/* Player header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-poster-accent-purple/15 flex items-center justify-center ring-1 ring-poster-accent-purple/30">
                          <Volume2 className="w-5 h-5 text-poster-accent-purple" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold">Generated Audio</h3>
                          <p className="text-[11px] text-poster-text-sub/50">Ready to play</p>
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

                    {/* CSS waveform visualization */}
                    <div className="flex items-center justify-center gap-[2px] h-16 px-4">
                      {Array.from({ length: 48 }).map((_, i) => {
                        const height = 20 + Math.sin(i * 0.4) * 15 + Math.cos(i * 0.7) * 10;
                        return (
                          <div
                            key={i}
                            className="w-[3px] rounded-full bg-gradient-to-t from-poster-accent-purple/40 to-poster-accent-purple transition-all duration-300"
                            style={{ height: `${Math.max(4, height)}px` }}
                          />
                        );
                      })}
                    </div>

                    {/* Native audio player */}
                    <audio
                      controls
                      src={audioUrl}
                      className="w-full h-10 [&::-webkit-media-controls-panel]:bg-poster-surface"
                      preload="auto"
                    />

                    {/* Footer note */}
                    <div className="flex items-center gap-2 text-[11px] text-poster-text-sub/40">
                      <div className="w-1 h-1 rounded-full bg-poster-accent-purple/40" />
                      Audio generated locally in your browser. No data sent to any server.
                    </div>
                  </div>
                </div>
              )}

              {/* Subtle empty state when there's text but no audio yet */}
              {!audioUrl && !isGenerating && inputText.trim() && (
                <div className="flex flex-col items-center py-6 animate-in fade-in duration-300">
                  <div className="flex items-end gap-[3px] h-8 opacity-20 mb-3">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
                      <div
                        key={i}
                        className="w-[3px] rounded-full bg-poster-text-sub"
                        style={{ height: `${8 + Math.sin(i * 0.6) * 8}px` }}
                      />
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
