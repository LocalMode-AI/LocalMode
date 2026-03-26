/**
 * @file summarizer-view.tsx
 * @description Main view component for the text summarizer application.
 * Editorial/publishing-tool design with split-pane layout, rich empty state,
 * magazine-like typography for summaries, and detailed compression stats.
 */
'use client';

import {
  FileText,
  Trash2,
  Sparkles,
  Play,
  Square,
  Copy,
  Check,
  ArrowLeft,
  Clock,
  BarChart3,
  Zap,
  SlidersHorizontal,
} from 'lucide-react';
import { useState } from 'react';
import { Button, IconBox, Spinner } from './ui';
import { ErrorBoundary, ErrorAlert } from './error-boundary';
import { cn, countWords, compressionRatio } from '../_lib/utils';
import { MODEL_SIZE, SAMPLE_TEXT, LENGTH_CONFIGS } from '../_lib/constants';
import { useSummarizer } from '../_hooks/use-summarizer';
import type { SummaryLength } from '../_lib/types';

/** Estimate reading time saved based on word count difference */
function timeSaved(originalWords: number, summaryWords: number) {
  const wordsPerMinute = 238;
  const saved = Math.max(0, originalWords - summaryWords);
  const minutes = Math.round(saved / wordsPerMinute);
  if (minutes < 1) return '< 1 min';
  return `${minutes} min`;
}

/** Skeleton shimmer lines for the loading state */
function SummarySkeleton() {
  return (
    <div className="flex flex-col gap-3 py-2 animate-pulse">
      <div className="h-4 rounded-full bg-poster-accent-purple/15 w-full" />
      <div className="h-4 rounded-full bg-poster-accent-purple/10 w-[92%]" />
      <div className="h-4 rounded-full bg-poster-accent-purple/15 w-[78%]" />
      <div className="h-4 rounded-full bg-poster-accent-purple/10 w-[85%]" />
      <div className="h-4 rounded-full bg-poster-accent-purple/15 w-[60%]" />
    </div>
  );
}

/** Rich empty state shown before any summarization */
function EmptyState({ onLoadSample }: { onLoadSample: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-16 px-6 animate-fadeIn">
      {/* Icon with gradient background */}
      <div className="relative mb-8">
        <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-poster-accent-purple/30 to-poster-primary/20 blur-2xl scale-150" />
        <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-poster-accent-purple to-poster-primary flex items-center justify-center shadow-lg shadow-poster-accent-purple/25">
          <FileText className="w-10 h-10 text-white" />
        </div>
      </div>

      {/* Title and subtitle */}
      <h2 className="text-2xl font-bold text-poster-text-main mb-2 tracking-tight">
        Document Summarizer
      </h2>
      <p className="text-sm text-poster-text-sub text-center max-w-sm mb-6 leading-relaxed">
        Condense long documents into clear, concise summaries — powered entirely by on-device AI.
      </p>

      {/* Feature badges */}
      <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
        {[
          { icon: SlidersHorizontal, label: 'Adjustable Length' },
          { icon: Zap, label: 'AI-Powered' },
          { icon: Clock, label: 'Instant Results' },
        ].map(({ icon: Icon, label }) => (
          <span
            key={label}
            className="inline-flex items-center gap-1.5 rounded-full bg-poster-surface-lighter/60 border border-poster-border/20 px-3 py-1.5 text-xs text-poster-text-sub"
          >
            <Icon className="w-3 h-3 text-poster-accent-purple" />
            {label}
          </span>
        ))}
      </div>

      {/* CTA */}
      <Button variant="primary" size="md" onClick={onLoadSample}>
        <Sparkles className="w-4 h-4 mr-2" />
        Try with Sample Text
      </Button>
    </div>
  );
}

/** Stats bar shown when a summary exists */
function StatsBar({ input, summary }: { input: string; summary: string }) {
  const originalWords = countWords(input);
  const summaryWords = countWords(summary);
  const ratio = compressionRatio(input, summary);

  const stats = [
    { label: 'Original', value: `${originalWords} words` },
    { label: 'Summary', value: `${summaryWords} words` },
    { label: 'Compression', value: `${ratio}%` },
    { label: 'Time Saved', value: timeSaved(originalWords, summaryWords) },
  ];

  return (
    <div className="flex items-center justify-center gap-1 py-3 px-4 rounded-xl bg-poster-surface/60 border border-poster-border/20 animate-fadeIn">
      {stats.map((stat, i) => (
        <div key={stat.label} className="flex items-center">
          {i > 0 && <div className="w-px h-8 bg-poster-border/20 mx-4" />}
          <div className="text-center px-2">
            <p className="text-[11px] uppercase tracking-wider text-poster-text-sub/60 mb-0.5">
              {stat.label}
            </p>
            <p className="text-sm font-semibold text-poster-text-main">{stat.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Main summarizer view */
export function SummarizerView() {
  const [input, setInput] = useState('');
  const [length, setLength] = useState<SummaryLength>('medium');
  const [copied, setCopied] = useState(false);

  const { summary, isSummarizing, error, handleSummarize, cancel, clearError } = useSummarizer();

  const reset = () => {
    setInput('');
  };

  const handleLoadSample = () => {
    setInput(SAMPLE_TEXT);
  };

  const handleCopy = async () => {
    if (summary) {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const hasContent = input.trim().length > 0 || summary.length > 0;
  const ratio = summary ? compressionRatio(input, summary) : 0;

  return (
    <div className="h-[calc(100vh-4rem)] bg-poster-bg flex flex-col relative overflow-hidden">
      <div className="bg-grid fixed inset-0 z-0 pointer-events-none opacity-50" />

      <div className="relative z-10 flex flex-col h-full">
        {/* ── Header ── */}
        <div className="h-16 min-h-16 border-b border-poster-border/30 flex items-center justify-between px-6 bg-poster-surface/80 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <a
              href="/"
              className="btn btn-ghost btn-sm btn-circle text-poster-text-sub hover:text-poster-text-main transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </a>
            <div className="w-px h-6 bg-poster-border/30" />
            <IconBox size="sm" variant="primary" className="bg-poster-accent-purple/10 text-poster-accent-purple ring-poster-accent-purple/30">
              <FileText className="w-4 h-4" />
            </IconBox>
            <div>
              <h1 className="text-base font-semibold text-poster-text-main tracking-tight">
                Text Summarizer
              </h1>
            </div>
            <span className="badge badge-sm bg-poster-surface-lighter/80 border-poster-border/30 text-poster-text-sub text-[11px] font-medium ml-1">
              distilbart &middot; {MODEL_SIZE}
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={reset}>
            <Trash2 className="w-4 h-4 mr-1" />
            Reset
          </Button>
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-auto">
          <div className="max-w-6xl mx-auto flex flex-col h-full px-6 py-5 gap-5">
            {/* Error alert */}
            {error && (
              <ErrorAlert message={error.message} onDismiss={clearError} onRetry={() => handleSummarize(input, length)} />
            )}

            {/* Length selector + action row */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-poster-text-sub uppercase tracking-wider">
                  Length
                </span>
                <div className="tabs tabs-boxed bg-poster-surface/50 border border-poster-border/20 p-1">
                  {(Object.keys(LENGTH_CONFIGS) as SummaryLength[]).map((key) => (
                    <button
                      key={key}
                      className={cn(
                        'tab tab-sm transition-all',
                        length === key
                          ? 'tab-active !bg-poster-accent-purple text-white'
                          : 'text-poster-text-sub hover:text-poster-text-main'
                      )}
                      onClick={() => setLength(key)}
                    >
                      {LENGTH_CONFIGS[key].label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isSummarizing ? (
                  <Button variant="ghost" size="sm" onClick={cancel}>
                    <Square className="w-4 h-4 mr-1" />
                    Stop
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleSummarize(input, length)}
                    disabled={!input.trim()}
                    className="bg-poster-accent-purple hover:bg-poster-accent-purple/80 border-none"
                  >
                    <Play className="w-4 h-4 mr-1" />
                    Summarize
                  </Button>
                )}
              </div>
            </div>

            {/* ── Split pane or empty state ── */}
            <ErrorBoundary>
              {!hasContent ? (
                <div className="flex-1 flex items-center justify-center">
                  <EmptyState onLoadSample={handleLoadSample} />
                </div>
              ) : (
                <div className="flex-1 flex flex-col gap-5 min-h-0">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 flex-1 rounded-2xl overflow-hidden border border-poster-border/20 shadow-xl shadow-black/20">
                    {/* ── Left panel: Original ── */}
                    <div className="flex flex-col bg-poster-surface/40">
                      {/* Panel header */}
                      <div className="flex items-center justify-between px-5 py-3 border-b border-poster-border/20">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wider text-poster-text-sub">
                            Original
                          </span>
                          <span className="badge badge-sm bg-poster-surface-lighter/60 border-poster-border/20 text-poster-text-sub text-[11px]">
                            {countWords(input)} words
                          </span>
                        </div>
                        <Button variant="ghost" size="xs" onClick={handleLoadSample}>
                          <Sparkles className="w-3 h-3 mr-1" />
                          Sample
                        </Button>
                      </div>
                      {/* Textarea */}
                      <div className="flex-1 p-1">
                        <textarea
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          placeholder="Paste or type the text you want to summarize..."
                          className="textarea w-full h-full min-h-[280px] bg-transparent border-none text-poster-text-main placeholder:text-poster-text-sub/30 focus:outline-none resize-none text-sm leading-relaxed p-4"
                          disabled={isSummarizing}
                        />
                      </div>
                    </div>

                    {/* ── Divider ── */}
                    <div className="hidden lg:block relative w-0">
                      <div className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-poster-accent-purple/40 to-transparent" />
                    </div>
                    {/* Mobile divider */}
                    <div className="lg:hidden h-px bg-gradient-to-r from-transparent via-poster-accent-purple/40 to-transparent" />

                    {/* ── Right panel: Summary ── */}
                    <div className="flex flex-col bg-poster-surface/60">
                      {/* Panel header */}
                      <div className="flex items-center justify-between px-5 py-3 border-b border-poster-border/20">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wider text-poster-text-sub">
                            Summary
                          </span>
                          {summary && (
                            <span className="inline-flex items-center gap-1 badge badge-sm bg-poster-accent-purple/15 border-poster-accent-purple/30 text-poster-accent-purple text-[11px] font-medium">
                              <BarChart3 className="w-2.5 h-2.5" />
                              {ratio}% shorter
                            </span>
                          )}
                        </div>
                        {summary && (
                          <Button variant="ghost" size="xs" onClick={handleCopy}>
                            {copied ? (
                              <Check className="w-3 h-3 mr-1 text-success" />
                            ) : (
                              <Copy className="w-3 h-3 mr-1" />
                            )}
                            {copied ? 'Copied' : 'Copy'}
                          </Button>
                        )}
                      </div>
                      {/* Summary content */}
                      <div className="flex-1 p-5 min-h-[280px] overflow-auto">
                        {isSummarizing ? (
                          <SummarySkeleton />
                        ) : summary ? (
                          <div className="animate-fadeIn">
                            <p className="text-base leading-[1.8] text-poster-text-main font-serif tracking-wide">
                              {summary}
                            </p>
                            {/* Mini compression bar */}
                            <div className="mt-6 flex items-center gap-3">
                              <div className="flex-1 h-1.5 rounded-full bg-poster-surface-lighter/50 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-poster-accent-purple to-poster-primary transition-all duration-700"
                                  style={{ width: `${100 - ratio}%` }}
                                />
                              </div>
                              <span className="text-[11px] text-poster-text-sub whitespace-nowrap">
                                {100 - ratio}% of original
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center h-full text-center">
                            <div className="w-10 h-10 rounded-xl bg-poster-accent-purple/10 flex items-center justify-center mb-3">
                              <FileText className="w-5 h-5 text-poster-accent-purple/40" />
                            </div>
                            <p className="text-sm text-poster-text-sub/40 italic">
                              Your summary will appear here
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ── Stats bar ── */}
                  {summary && <StatsBar input={input} summary={summary} />}
                </div>
              )}
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  );
}
