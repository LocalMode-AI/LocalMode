/**
 * @file sentiment-view.tsx
 * @description Main view component for the sentiment analyzer application.
 * Polished analytics dashboard with rich empty state, stats cards, and animated results.
 */
'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import {
  Heart,
  Trash2,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  Play,
  Square,
  ArrowLeft,
  BarChart3,
  Zap,
  Clock,
} from 'lucide-react';
import { Button, IconBox, Progress } from './ui';
import { ErrorBoundary, ErrorAlert } from './error-boundary';
import { cn, calculateStats, formatScore } from '../_lib/utils';
import { SAMPLE_TEXTS, MODEL_SIZE } from '../_lib/constants';
import { useSentiment } from '../_hooks/use-sentiment';
import type { SentimentResult } from '../_lib/types';

/** Feature pill shown in empty state */
function FeaturePill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-poster-surface border border-poster-border/30 text-xs text-poster-text-sub">
      {icon}
      {label}
    </span>
  );
}

/** Rich empty state with gradient icon, description, and sample loader */
function EmptyState({ onLoadSamples }: { onLoadSamples: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 animate-fadeIn">
      {/* Gradient icon with sparkle effect */}
      <div className="relative mb-8">
        <div className="absolute inset-0 rounded-3xl bg-poster-accent-pink/20 blur-2xl animate-pulse-glow" />
        <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-poster-accent-pink to-poster-accent-pink/60 flex items-center justify-center shadow-lg shadow-poster-accent-pink/20">
          <Heart className="w-10 h-10 text-white" />
        </div>
        <div className="absolute -top-1 -right-1">
          <Sparkles className="w-5 h-5 text-poster-accent-pink animate-float" />
        </div>
      </div>

      {/* Title and subtitle */}
      <h2 className="text-2xl font-bold text-poster-text-main mb-2">Sentiment Analyzer</h2>
      <p className="text-sm text-poster-text-sub text-center max-w-md mb-6 leading-relaxed">
        Analyze customer feedback, reviews, and text for positive or negative sentiment
      </p>

      {/* Feature pills */}
      <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
        <FeaturePill icon={<BarChart3 className="w-3.5 h-3.5 text-poster-accent-pink" />} label="Batch Analysis" />
        <FeaturePill icon={<Zap className="w-3.5 h-3.5 text-poster-accent-pink" />} label="Confidence Scores" />
        <FeaturePill icon={<Clock className="w-3.5 h-3.5 text-poster-accent-pink" />} label="Real-time Results" />
      </div>

      {/* Load samples CTA */}
      <button
        onClick={onLoadSamples}
        className="btn btn-primary btn-md gap-2 shadow-lg shadow-poster-accent-pink/10 bg-poster-accent-pink hover:bg-poster-accent-pink/80 border-poster-accent-pink hover:border-poster-accent-pink/80 transition-all duration-300 hover:scale-105 cursor-pointer"
      >
        <Sparkles className="w-4 h-4" />
        Load Sample Reviews
      </button>
    </div>
  );
}

/** Stats dashboard using daisyUI stat component */
function StatsDashboard({ results }: { results: SentimentResult[] }) {
  const stats = calculateStats(results);
  if (stats.total === 0) return null;

  const positivePercent = Math.round((stats.positive / stats.total) * 100);
  const negativePercent = Math.round((stats.negative / stats.total) * 100);
  const avgConfidence = Math.round(stats.avgScore * 100);

  return (
    <div className="animate-fadeIn">
      <div className="stats stats-horizontal bg-poster-surface/50 border border-poster-border/30 shadow-lg w-full">
        <div className="stat">
          <div className="stat-figure text-success">
            <ThumbsUp className="w-6 h-6" />
          </div>
          <div className="stat-title text-poster-text-sub">Positive</div>
          <div className="stat-value text-success text-2xl">{stats.positive}</div>
          <div className="stat-desc text-poster-text-sub/70">{positivePercent}% of total</div>
        </div>

        <div className="stat">
          <div className="stat-figure text-error">
            <ThumbsDown className="w-6 h-6" />
          </div>
          <div className="stat-title text-poster-text-sub">Negative</div>
          <div className="stat-value text-error text-2xl">{stats.negative}</div>
          <div className="stat-desc text-poster-text-sub/70">{negativePercent}% of total</div>
        </div>

        <div className="stat">
          <div className="stat-figure text-poster-accent-pink">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div className="stat-title text-poster-text-sub">Total</div>
          <div className="stat-value text-poster-text-main text-2xl">{stats.total}</div>
          <div className="stat-desc text-poster-text-sub/70">{stats.total === 1 ? 'review' : 'reviews'} analyzed</div>
        </div>

        <div className="stat">
          <div className="stat-figure text-poster-accent-teal">
            <Zap className="w-6 h-6" />
          </div>
          <div className="stat-title text-poster-text-sub">Avg Confidence</div>
          <div className="stat-value text-poster-accent-teal text-2xl">{avgConfidence}%</div>
          <div className="stat-desc text-poster-text-sub/70">model certainty</div>
        </div>
      </div>
    </div>
  );
}

/** Individual animated result card */
function ResultCard({ result, index }: { result: SentimentResult; index: number }) {
  const isPositive = result.label === 'POSITIVE';
  const confidencePercent = Math.round(result.score * 100);

  return (
    <div
      className={cn(
        'animate-fadeIn opacity-0 [animation-fill-mode:forwards]',
        'flex items-start gap-4 p-4 rounded-xl border-l-4 bg-poster-surface/40 border border-poster-border/20',
        'transition-all duration-300 hover:scale-[1.01] hover:shadow-lg hover:shadow-black/20 cursor-default',
        isPositive ? 'border-l-success' : 'border-l-error'
      )}
      style={{ animationDelay: `${index * 75}ms` }}
    >
      {/* Sentiment icon */}
      <div
        className={cn(
          'mt-0.5 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
          isPositive ? 'bg-success/15 text-success' : 'bg-error/15 text-error'
        )}
      >
        {isPositive ? <ThumbsUp className="w-4 h-4" /> : <ThumbsDown className="w-4 h-4" />}
      </div>

      {/* Text content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-poster-text-main leading-relaxed">{result.text}</p>
        <div className="flex items-center gap-2 mt-2">
          <span
            className={cn(
              'badge badge-sm font-medium',
              isPositive ? 'badge-success badge-outline' : 'badge-error badge-outline'
            )}
          >
            {result.label}
          </span>
          <span className="text-xs text-poster-text-sub">{formatScore(result.score)}</span>
        </div>
      </div>

      {/* Radial progress for confidence */}
      <div className="flex-shrink-0">
        <div
          className={cn(
            'radial-progress text-xs font-semibold',
            isPositive ? 'text-success' : 'text-error'
          )}
          style={
            {
              '--value': confidencePercent,
              '--size': '3rem',
              '--thickness': '3px',
            } as React.CSSProperties
          }
          role="progressbar"
        >
          {confidencePercent}%
        </div>
      </div>
    </div>
  );
}

/** Main sentiment analyzer view */
export function SentimentView() {
  const { results, isAnalyzing, progress, error, analyze, cancel, clearError, clearResults } = useSentiment();
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleAnalyze = () => {
    if (input.trim()) {
      analyze(input);
    }
  };

  const handleLoadSamples = () => {
    setInput(SAMPLE_TEXTS.join('\n'));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleAnalyze();
    }
  };

  const lineCount = input.split('\n').filter((l) => l.trim()).length;
  const charCount = input.length;
  const hasResults = results.length > 0;
  const hasInput = input.trim().length > 0;

  return (
    <div className="h-[calc(100vh-4rem)] bg-poster-bg flex flex-col relative overflow-hidden">
      <div className="bg-grid fixed inset-0 z-0 pointer-events-none opacity-50" />

      <div className="relative z-10 flex flex-col h-full">
        {/* Header */}
        <div className="h-16 min-h-16 border-b border-poster-border/30 flex items-center justify-between px-6 bg-poster-surface/80 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center justify-center w-8 h-8 rounded-lg text-poster-text-sub hover:text-poster-text-main hover:bg-poster-surface-lighter transition-all duration-200 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <IconBox size="sm" variant="primary" className="bg-poster-accent-pink/10 text-poster-accent-pink ring-1 ring-poster-accent-pink/30">
              <Heart className="w-4 h-4" />
            </IconBox>
            <div>
              <h1 className="text-base font-semibold text-poster-text-main">Sentiment Analyzer</h1>
              <p className="text-xs text-poster-text-sub">Analyze customer feedback sentiment</p>
            </div>
            <span className="badge badge-sm bg-poster-surface-lighter border-poster-border/30 text-poster-text-sub ml-2 gap-1.5">
              distilbert
              <span className="text-poster-accent-pink">&middot;</span>
              {MODEL_SIZE}
            </span>
          </div>
          {hasResults && (
            <Button variant="ghost" size="sm" onClick={clearResults} className="hover:text-error transition-colors duration-200">
              <Trash2 className="w-4 h-4 mr-1" />
              Clear
            </Button>
          )}
        </div>

        {/* Gradient accent line under header */}
        <div className="h-px bg-gradient-to-r from-transparent via-poster-accent-pink/40 to-transparent" />

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-4xl mx-auto flex flex-col gap-6">
            {/* Error */}
            {error && <ErrorAlert message={error.message} onDismiss={clearError} onRetry={handleAnalyze} />}

            {/* Empty state (no results and no input) */}
            {!hasResults && !hasInput && !isAnalyzing && (
              <EmptyState onLoadSamples={handleLoadSamples} />
            )}

            {/* Input area (shown when there's input or results or analyzing) */}
            {(hasInput || hasResults || isAnalyzing) && (
              <div className="flex flex-col gap-3 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-poster-text-main">
                    Enter reviews (one per line)
                  </label>
                  <Button variant="ghost" size="xs" onClick={handleLoadSamples} className="hover:text-poster-accent-pink transition-colors duration-200">
                    <Sparkles className="w-3 h-3 mr-1" />
                    Load Samples
                  </Button>
                </div>
                <div className="relative group">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={'Enter text to analyze sentiment...\nPut each review on a new line for batch analysis.'}
                    className={cn(
                      'textarea textarea-bordered w-full min-h-[180px] bg-poster-surface/50 border-poster-border/30 text-poster-text-main placeholder:text-poster-text-sub/40 resize-none text-sm leading-relaxed',
                      'focus:border-poster-accent-pink/50 focus:shadow-[inset_0_0_20px_rgba(236,72,153,0.05)] focus:outline-none',
                      'transition-all duration-300'
                    )}
                    disabled={isAnalyzing}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-poster-text-sub">
                      {lineCount} {lineCount === 1 ? 'line' : 'lines'}
                      <span className="text-poster-border mx-1.5">&middot;</span>
                      {charCount.toLocaleString()} chars
                    </span>
                    <span className="text-xs text-poster-text-sub/50">
                      &#8984; Enter to analyze
                    </span>
                  </div>
                  {isAnalyzing ? (
                    <Button variant="ghost" size="sm" onClick={cancel} className="hover:text-error transition-colors duration-200">
                      <Square className="w-4 h-4 mr-1" />
                      Stop
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleAnalyze}
                      disabled={!hasInput}
                      className="bg-poster-accent-pink hover:bg-poster-accent-pink/80 border-poster-accent-pink hover:border-poster-accent-pink/80 transition-all duration-300 hover:shadow-lg hover:shadow-poster-accent-pink/20 cursor-pointer disabled:opacity-40"
                    >
                      <Play className="w-4 h-4 mr-1" />
                      Analyze
                    </Button>
                  )}
                </div>

                {/* Animated progress bar with gradient shimmer */}
                {isAnalyzing && (
                  <div className="relative h-2 rounded-full overflow-hidden bg-poster-surface animate-fadeIn">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-poster-accent-pink via-poster-accent-purple to-poster-accent-pink bg-[length:200%_100%] animate-[shimmer_2s_linear_infinite] transition-all duration-500"
                      style={{ width: `${Math.max(progress * 100, 3)}%` }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Results */}
            <ErrorBoundary>
              <StatsDashboard results={results} />
              {hasResults && (
                <div className="flex flex-col gap-3">
                  {results.map((result, i) => (
                    <ResultCard key={i} result={result} index={i} />
                  ))}
                </div>
              )}
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  );
}
