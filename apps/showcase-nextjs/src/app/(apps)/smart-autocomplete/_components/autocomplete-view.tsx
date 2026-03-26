/**
 * @file autocomplete-view.tsx
 * @description Main view component for the smart autocomplete application
 */
'use client';

import { useState } from 'react';
import { Sparkles, Play, ArrowLeft, Wand2, Shuffle, Command } from 'lucide-react';
import { Button, IconBox, Spinner } from './ui';
import { ErrorBoundary, ErrorAlert } from './error-boundary';
import { cn, formatScore, replaceMask } from '../_lib/utils';
import { MODEL_SIZE, MASK_TOKEN, SAMPLE_SENTENCES } from '../_lib/constants';
import { useAutocomplete } from '../_hooks/use-autocomplete';

/** Confidence color mapping based on score threshold */
function getConfidenceColor(score: number) {
  if (score >= 0.3) return 'bg-green-500';
  if (score >= 0.1) return 'bg-emerald-400';
  if (score >= 0.05) return 'bg-yellow-400';
  return 'bg-orange-400';
}

/** Confidence label based on score */
function getConfidenceLabel(score: number) {
  if (score >= 0.3) return 'High';
  if (score >= 0.1) return 'Good';
  if (score >= 0.05) return 'Fair';
  return 'Low';
}

/** Main autocomplete view */
export function AutocompleteView() {
  const [input, setInputLocal] = useState('');

  const {
    suggestions: predictions,
    isProcessing: isPredicting,
    error,
    predict,
    clearError,
    clearSuggestions,
  } = useAutocomplete();

  const setInput = (value: string) => setInputLocal(value);

  const hasMask = input.includes(MASK_TOKEN);

  const handleApplyPrediction = (token: string) => {
    setInput(replaceMask(input, token));
    clearSuggestions();
  };

  const handleLoadSample = () => {
    const sample = SAMPLE_SENTENCES[Math.floor(Math.random() * SAMPLE_SENTENCES.length)];
    setInput(sample);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      predict(input);
    }
  };

  /** Render input text with highlighted [MASK] token */
  const renderHighlightedInput = () => {
    if (!input) return null;
    const parts = input.split(MASK_TOKEN);
    if (parts.length < 2) return null;
    return (
      <div className="text-sm text-poster-text-sub/70 mt-2 px-1 leading-relaxed">
        {parts[0]}
        <span className="bg-poster-accent-orange/20 text-poster-accent-orange px-1.5 py-0.5 rounded font-medium mx-0.5">
          {MASK_TOKEN}
        </span>
        {parts[1]}
      </div>
    );
  };

  return (
    <div className="h-[calc(100vh-4rem)] bg-poster-bg flex flex-col relative overflow-hidden">
      <div className="bg-grid fixed inset-0 z-0 pointer-events-none opacity-50" />

      <div className="relative z-10 flex flex-col h-full">
        {/* Header */}
        <div className="h-16 min-h-16 border-b border-poster-border/30 flex items-center justify-between px-6 bg-poster-surface/80 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <a
              href="/"
              className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-poster-surface-lighter transition-all duration-300 text-poster-text-sub hover:text-poster-text-main"
            >
              <ArrowLeft className="w-4 h-4" />
            </a>
            <div className="w-px h-6 bg-poster-border/30" />
            <IconBox size="sm" className="bg-poster-accent-orange/10 text-poster-accent-orange ring-1 ring-poster-accent-orange/30">
              <Sparkles className="w-4 h-4" />
            </IconBox>
            <div>
              <h1 className="text-base font-semibold text-poster-text-main">Smart Autocomplete</h1>
              <p className="text-xs text-poster-text-sub">Fill-mask word prediction</p>
            </div>
          </div>
          <div className="badge badge-ghost badge-sm gap-1.5 bg-poster-accent-orange/10 text-poster-accent-orange border-poster-accent-orange/20">
            <span className="w-1.5 h-1.5 rounded-full bg-poster-accent-orange" />
            BERT &bull; {MODEL_SIZE}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-3xl mx-auto flex flex-col gap-6">
            {error && <ErrorAlert message={error.message} onDismiss={clearError} onRetry={() => predict(input)} />}

            {/* Empty state */}
            {!input && predictions.length === 0 && !isPredicting && (
              <div className="flex flex-col items-center justify-center py-16 gap-5">
                <div className="relative">
                  <div className="w-20 h-20 rounded-2xl bg-poster-accent-orange/10 flex items-center justify-center ring-1 ring-poster-accent-orange/20 shadow-lg shadow-poster-accent-orange/5">
                    <Sparkles className="w-10 h-10 text-poster-accent-orange" />
                  </div>
                  {/* Glow effect */}
                  <div className="absolute inset-0 rounded-2xl bg-poster-accent-orange/5 blur-xl -z-10 scale-150" />
                  <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-lg bg-poster-surface border border-poster-border/30 flex items-center justify-center shadow-sm">
                    <Wand2 className="w-3.5 h-3.5 text-poster-text-sub" />
                  </div>
                </div>
                <div className="text-center">
                  <h2 className="text-xl font-semibold text-poster-text-main mb-1.5">Smart Autocomplete</h2>
                  <p className="text-sm text-poster-text-sub max-w-md">
                    Type a sentence with <code className="bg-poster-accent-orange/15 text-poster-accent-orange px-1.5 py-0.5 rounded text-xs font-mono font-medium">[MASK]</code> and watch AI predict the missing word
                  </p>
                </div>
                <button
                  onClick={handleLoadSample}
                  className="flex items-center gap-2 mt-2 px-4 py-2 rounded-xl bg-poster-surface/50 border border-poster-border/20 text-sm text-poster-text-sub hover:text-poster-text-main hover:border-poster-border/40 hover:bg-poster-surface transition-all duration-300"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                  Try a sample sentence
                </button>
              </div>
            )}

            {/* Input card */}
            {(input || predictions.length > 0 || isPredicting) && (
              <div className="flex flex-col gap-4">
                <div className="rounded-2xl bg-poster-surface/30 backdrop-blur-sm border border-poster-border/20 overflow-hidden transition-all duration-300">
                  {/* Input header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-poster-border/10">
                    <div className="flex items-center gap-2">
                      <Wand2 className="w-3.5 h-3.5 text-poster-accent-orange" />
                      <span className="text-sm font-medium text-poster-text-main">Sentence with [MASK]</span>
                    </div>
                    <button
                      onClick={handleLoadSample}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-poster-text-sub hover:text-poster-accent-orange hover:bg-poster-accent-orange/10 transition-all duration-300"
                    >
                      <Shuffle className="w-3 h-3" />
                      Random
                    </button>
                  </div>

                  {/* Textarea */}
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="The weather today is very [MASK]."
                    className="w-full min-h-[100px] p-4 bg-transparent text-poster-text-main placeholder:text-poster-text-sub/30 focus:outline-none resize-none text-sm font-mono leading-relaxed"
                    disabled={isPredicting}
                  />

                  {/* Highlighted preview */}
                  {hasMask && renderHighlightedInput()}

                  {/* Footer */}
                  <div className="flex items-center justify-between px-4 py-3 border-t border-poster-border/10">
                    <div className="flex items-center gap-3">
                      <span className={cn(
                        'text-xs transition-all duration-300',
                        hasMask ? 'text-green-400' : 'text-poster-accent-orange'
                      )}>
                        {hasMask ? '\u2713 [MASK] detected' : '\u26A0 Add [MASK] to your sentence'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="hidden sm:flex items-center gap-1 text-[10px] text-poster-text-sub/40">
                        <kbd className="px-1.5 py-0.5 rounded bg-poster-surface border border-poster-border/30 text-[10px] font-mono">
                          <Command className="w-2.5 h-2.5 inline" />
                        </kbd>
                        <kbd className="px-1.5 py-0.5 rounded bg-poster-surface border border-poster-border/30 text-[10px] font-mono">
                          Enter
                        </kbd>
                        <span className="ml-0.5">to predict</span>
                      </span>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => predict(input)}
                        disabled={!hasMask || isPredicting}
                        className="gap-1.5 bg-poster-accent-orange hover:bg-poster-accent-orange/80 border-none"
                      >
                        {isPredicting ? <Spinner size="sm" /> : <Play className="w-3.5 h-3.5" />}
                        Predict
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Predictions */}
            <ErrorBoundary>
              {(predictions.length > 0 || isPredicting) && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 px-1">
                    <Sparkles className="w-3.5 h-3.5 text-poster-accent-orange" />
                    <h3 className="text-sm font-medium text-poster-text-main">
                      {isPredicting ? 'Predicting...' : `Top ${predictions.length} Predictions`}
                    </h3>
                  </div>

                  {isPredicting ? (
                    <div className="flex flex-col gap-2">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className="flex items-center gap-4 p-4 rounded-xl bg-poster-surface/30 border border-poster-border/10 animate-pulse"
                          style={{ animationDelay: `${i * 100}ms` }}
                        >
                          <div className="w-8 h-8 rounded-full bg-poster-border/20" />
                          <div className="flex-1 flex flex-col gap-2">
                            <div className="h-4 bg-poster-border/15 rounded-full w-24" />
                            <div className="h-3 bg-poster-border/10 rounded-full w-3/4" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {predictions.map((pred, i) => {
                        const fullSentence = replaceMask(input, pred.token);
                        const confidencePercent = Math.min(pred.score * 100, 100);

                        return (
                          <button
                            key={i}
                            onClick={() => handleApplyPrediction(pred.token)}
                            className="group flex items-center gap-4 p-4 rounded-xl bg-poster-surface/30 backdrop-blur-sm border border-poster-border/20 hover:bg-poster-accent-orange/5 hover:border-poster-accent-orange/30 transition-all duration-300 text-left"
                            style={{
                              animation: `slideInRight 0.3s ease-out ${i * 80}ms both`,
                            }}
                          >
                            {/* Rank circle */}
                            <div className={cn(
                              'flex items-center justify-center w-8 h-8 rounded-full shrink-0 text-xs font-bold transition-all duration-300',
                              i === 0
                                ? 'bg-poster-accent-orange/15 text-poster-accent-orange ring-1 ring-poster-accent-orange/30'
                                : 'bg-poster-surface text-poster-text-sub border border-poster-border/30 group-hover:border-poster-accent-orange/20 group-hover:text-poster-accent-orange'
                            )}>
                              #{i + 1}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                              <div className="flex items-baseline gap-2">
                                <span className="text-base font-semibold text-poster-text-main group-hover:text-poster-accent-orange transition-all duration-300">
                                  {pred.token}
                                </span>
                                <span className={cn(
                                  'text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                                  pred.score >= 0.1
                                    ? 'bg-green-500/10 text-green-400'
                                    : 'bg-poster-surface text-poster-text-sub'
                                )}>
                                  {getConfidenceLabel(pred.score)}
                                </span>
                              </div>
                              <p className="text-xs text-poster-text-sub/60 truncate">
                                &ldquo;{fullSentence}&rdquo;
                              </p>
                              {/* Confidence bar */}
                              <div className="flex items-center gap-2 mt-0.5">
                                <div className="flex-1 h-1.5 rounded-full bg-poster-border/15 overflow-hidden max-w-[200px]">
                                  <div
                                    className={cn(
                                      'h-full rounded-full transition-all duration-500',
                                      getConfidenceColor(pred.score)
                                    )}
                                    style={{ width: `${confidencePercent}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-poster-text-sub/50 font-mono tabular-nums w-12">
                                  {formatScore(pred.score)}
                                </span>
                              </div>
                            </div>

                            {/* Apply hint */}
                            <span className="text-[10px] text-poster-text-sub/0 group-hover:text-poster-text-sub/50 transition-all duration-300 shrink-0">
                              Click to apply
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </ErrorBoundary>
          </div>
        </div>
      </div>

    </div>
  );
}
