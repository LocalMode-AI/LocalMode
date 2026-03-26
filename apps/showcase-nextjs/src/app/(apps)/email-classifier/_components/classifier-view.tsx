/**
 * @file classifier-view.tsx
 * @description Main view component for the email classifier application
 */
'use client';

import { useState } from 'react';
import { Mail, Play, Sparkles, X, Plus, Tag, ArrowLeft, Inbox, Zap, Layers } from 'lucide-react';
import { Button, IconBox, Spinner } from './ui';
import { ErrorBoundary, ErrorAlert } from './error-boundary';
import { cn, formatScore } from '../_lib/utils';
import { MODEL_SIZE, SAMPLE_EMAILS, DEFAULT_CATEGORIES } from '../_lib/constants';
import { useClassifier } from '../_hooks/use-classifier';

/** Unique color palette for category chips */
const CATEGORY_COLORS = [
  'bg-poster-accent-teal/15 text-poster-accent-teal border-poster-accent-teal/25',
  'bg-poster-accent-purple/15 text-poster-accent-purple border-poster-accent-purple/25',
  'bg-poster-accent-pink/15 text-poster-accent-pink border-poster-accent-pink/25',
  'bg-poster-accent-orange/15 text-poster-accent-orange border-poster-accent-orange/25',
  'bg-poster-primary/15 text-poster-primary border-poster-primary/25',
  'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  'bg-amber-500/15 text-amber-400 border-amber-500/25',
  'bg-rose-500/15 text-rose-400 border-rose-500/25',
] as const;

/** Bar color palette for results chart */
const BAR_COLORS = [
  'from-poster-accent-teal to-poster-accent-teal/60',
  'from-poster-accent-purple to-poster-accent-purple/60',
  'from-poster-accent-pink to-poster-accent-pink/60',
  'from-poster-accent-orange to-poster-accent-orange/60',
  'from-poster-primary to-poster-primary/60',
] as const;

/** Main view for the email classifier application */
export function ClassifierView() {
  const [input, setInput] = useState('');
  const [categories, setCategories] = useState<string[]>([...DEFAULT_CATEGORIES]);
  const [newCategory, setNewCategory] = useState('');

  const {
    results,
    isClassifying,
    error,
    classify,
    clearError,
  } = useClassifier();

  /** Classify with current input and categories */
  const handleClassify = () => classify(input, categories);

  /** Load a random sample email into the input */
  const handleLoadSample = () => {
    setInput(SAMPLE_EMAILS[Math.floor(Math.random() * SAMPLE_EMAILS.length)]);
  };

  /** Add a new category to the list */
  const handleAddCategory = () => {
    if (newCategory.trim() && !categories.includes(newCategory.trim())) {
      setCategories([...categories, newCategory.trim()]);
      setNewCategory('');
    }
  };

  /** Remove a category from the list */
  const handleRemoveCategory = (cat: string) => {
    setCategories(categories.filter((c) => c !== cat));
  };

  // Derive top result from results
  const topResult = results.length > 0 ? results[0] : null;
  const hasResults = results.length > 0;
  const hasInput = input.trim().length > 0;

  return (
    <div className="h-[calc(100vh-4rem)] bg-poster-bg flex flex-col relative overflow-hidden">
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
              <div className="w-8 h-8 rounded-lg bg-poster-accent-teal/15 flex items-center justify-center ring-1 ring-poster-accent-teal/30">
                <Mail className="w-4 h-4 text-poster-accent-teal" />
              </div>
              <div>
                <h1 className="text-sm font-semibold text-poster-text-main leading-tight">Email Classifier</h1>
                <p className="text-[11px] text-poster-text-sub/60 leading-tight">Zero-shot categorization</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-md bg-poster-accent-teal/10 text-[11px] font-medium text-poster-accent-teal border border-poster-accent-teal/20">
              MobileBERT-MNLI {MODEL_SIZE}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-3xl mx-auto flex flex-col gap-6">
            {/* Error alert */}
            {error && (
              <ErrorAlert
                message={error.message}
                onDismiss={clearError}
                onRetry={handleClassify}
              />
            )}

            {/* Empty state — shown when no input and no results */}
            {!hasInput && !hasResults && (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="relative mb-6">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-poster-accent-teal/20 to-poster-accent-teal/5 flex items-center justify-center ring-1 ring-poster-accent-teal/20 shadow-lg shadow-poster-accent-teal/10">
                    <Inbox className="w-9 h-9 text-poster-accent-teal" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-lg bg-poster-surface border border-poster-border/30 flex items-center justify-center shadow-sm">
                    <Sparkles className="w-3.5 h-3.5 text-poster-accent-orange" />
                  </div>
                </div>
                <h2 className="text-xl font-bold text-poster-text-main mb-2">Email Classifier</h2>
                <p className="text-sm text-poster-text-sub/70 text-center max-w-sm mb-6 leading-relaxed">
                  Classify emails into categories using zero-shot AI — no training data needed
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {['Custom Categories', 'Zero-Shot AI', 'Instant Classification'].map((pill) => (
                    <span
                      key={pill}
                      className="px-3 py-1.5 rounded-full bg-poster-surface border border-poster-border/20 text-xs text-poster-text-sub/80 font-medium"
                    >
                      {pill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Categories */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Tag className="w-3.5 h-3.5 text-poster-accent-teal" />
                <label className="text-xs font-semibold text-poster-text-sub uppercase tracking-wider">Categories</label>
                <span className="text-[10px] text-poster-text-sub/40 font-medium ml-1">{categories.length}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {categories.map((cat, i) => (
                  <span
                    key={cat}
                    className={cn(
                      'group flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-200 hover:shadow-sm',
                      CATEGORY_COLORS[i % CATEGORY_COLORS.length]
                    )}
                  >
                    {cat}
                    <button
                      onClick={() => handleRemoveCategory(cat)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:text-error ml-0.5"
                      aria-label={`Remove ${cat}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <div className="flex items-center gap-1.5">
                  <input
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                    placeholder="New category..."
                    className="input input-bordered input-sm h-8 w-28 bg-poster-surface/30 border-poster-border/20 text-xs placeholder:text-poster-text-sub/30 focus:border-poster-accent-teal/40 focus:outline-none"
                  />
                  <button
                    onClick={handleAddCategory}
                    className="w-7 h-7 rounded-full border border-dashed border-poster-border/30 flex items-center justify-center text-poster-text-sub/50 hover:text-poster-accent-teal hover:border-poster-accent-teal/40 transition-colors"
                    aria-label="Add category"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Input */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-poster-text-sub uppercase tracking-wider">Email Text</label>
                <button
                  onClick={handleLoadSample}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-poster-text-sub/60 hover:text-poster-accent-teal hover:bg-poster-accent-teal/10 transition-colors"
                >
                  <Sparkles className="w-3 h-3" />
                  Load Sample
                </button>
              </div>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Paste an email to classify..."
                className="textarea textarea-bordered w-full min-h-[120px] bg-poster-surface/30 border-poster-border/20 text-poster-text-main placeholder:text-poster-text-sub/30 focus:border-poster-accent-teal/40 resize-none text-sm leading-relaxed rounded-xl"
                disabled={isClassifying}
              />
              <div className="flex items-center justify-end">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleClassify}
                  disabled={!input.trim() || isClassifying}
                  className={cn(
                    'bg-poster-accent-teal hover:bg-poster-accent-teal/90 border-poster-accent-teal text-white rounded-lg',
                    isClassifying && 'opacity-80'
                  )}
                >
                  {isClassifying ? (
                    <Spinner size="sm" className="mr-1.5" />
                  ) : (
                    <Play className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Classify
                </Button>
              </div>
            </div>

            {/* Loading skeleton */}
            {isClassifying && !hasResults && (
              <div className="flex flex-col gap-3 animate-pulse">
                <div className="h-28 rounded-xl bg-poster-surface/40 border border-poster-border/10" />
                <div className="flex flex-col gap-2">
                  {categories.map((cat) => (
                    <div key={cat} className="h-12 rounded-lg bg-poster-surface/30 border border-poster-border/10" />
                  ))}
                </div>
              </div>
            )}

            {/* Results */}
            <ErrorBoundary>
              {hasResults && (
                <div className="flex flex-col gap-5">
                  {/* Top result hero card */}
                  {topResult && (
                    <div className="relative overflow-hidden rounded-2xl">
                      {/* Gradient border glow */}
                      <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-poster-accent-teal via-poster-primary to-poster-accent-purple p-px">
                        <div className="w-full h-full rounded-2xl bg-poster-bg" />
                      </div>
                      {/* Pulsing glow */}
                      <div className="absolute -inset-1 bg-gradient-to-r from-poster-accent-teal/20 via-transparent to-poster-accent-purple/20 rounded-2xl blur-xl animate-pulse" />
                      {/* Content */}
                      <div className="relative p-6 flex items-center gap-5">
                        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-poster-accent-teal/20 to-poster-accent-teal/5 flex items-center justify-center flex-shrink-0 ring-1 ring-poster-accent-teal/20">
                          <Layers className="w-6 h-6 text-poster-accent-teal" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-medium text-poster-text-sub/50 uppercase tracking-wider mb-1">Top Classification</p>
                          <p className="text-2xl font-bold text-poster-text-main truncate">{topResult.label}</p>
                        </div>
                        <div className="flex flex-col items-end flex-shrink-0">
                          <span className="text-3xl font-bold text-poster-accent-teal tabular-nums">
                            {formatScore(topResult.score)}
                          </span>
                          <span className="text-[11px] text-poster-text-sub/50 font-medium">confidence</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* All results — horizontal bar chart */}
                  <div className="flex flex-col gap-2.5">
                    <p className="text-[11px] font-semibold text-poster-text-sub/50 uppercase tracking-wider">All Categories</p>
                    {results.map((r, i) => {
                      const isTop = i === 0;
                      const pct = Math.round(r.score * 100);
                      return (
                        <div
                          key={r.label}
                          className={cn(
                            'group relative flex items-center gap-3 p-3.5 rounded-xl border transition-all duration-300',
                            isTop
                              ? 'bg-poster-accent-teal/5 border-poster-accent-teal/20'
                              : 'bg-poster-surface/20 border-poster-border/10 hover:border-poster-border/25'
                          )}
                          style={{ animationDelay: `${i * 80}ms` }}
                        >
                          {/* Background bar fill */}
                          <div
                            className={cn(
                              'absolute inset-y-0 left-0 rounded-xl transition-all duration-700 ease-out',
                              isTop
                                ? 'bg-gradient-to-r from-poster-accent-teal/10 to-transparent'
                                : 'bg-gradient-to-r from-poster-surface/40 to-transparent'
                            )}
                            style={{ width: `${Math.max(pct, 3)}%` }}
                          />
                          {/* Label */}
                          <span className={cn(
                            'relative text-sm font-medium flex-1 truncate',
                            isTop ? 'text-poster-accent-teal' : 'text-poster-text-main/80'
                          )}>
                            {r.label}
                          </span>
                          {/* Bar track */}
                          <div className="relative w-40 h-2 rounded-full bg-poster-surface/50 overflow-hidden flex-shrink-0">
                            <div
                              className={cn(
                                'h-full rounded-full bg-gradient-to-r transition-all duration-700 ease-out',
                                BAR_COLORS[i % BAR_COLORS.length]
                              )}
                              style={{ width: `${Math.max(pct, 2)}%` }}
                            />
                          </div>
                          {/* Percentage */}
                          <span className={cn(
                            'relative text-xs font-mono w-14 text-right tabular-nums',
                            isTop ? 'text-poster-accent-teal font-semibold' : 'text-poster-text-sub/60'
                          )}>
                            {formatScore(r.score)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  );
}
