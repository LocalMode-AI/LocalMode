/**
 * @file redactor-view.tsx
 * @description Main view component for the document redactor application
 */
'use client';

import { useState } from 'react';
import { Shield, Sparkles, Play, Download, ArrowLeft, Lock, ScanEye, FileDown, ShieldCheck, AlertTriangle } from 'lucide-react';
import { Button, Spinner } from './ui';
import { ErrorAlert } from './error-boundary';
import { cn, redactText, getPrivacyLevel } from '../_lib/utils';
import {
  MODEL_SIZE,
  SAMPLE_TEXT,
  ENTITY_COLORS,
  ENTITY_LABELS,
  EMBEDDING_MODEL_SIZE,
  MIN_EPSILON,
  MAX_EPSILON,
  EPSILON_STEP,
} from '../_lib/constants';
import { useRedactor } from '../_hooks/use-redactor';
import type { DetectedEntity, PrivacyBudgetState, DPEmbeddingResult } from '../_lib/types';

/** Vibrant inline highlight colors for redacted tokens in the output */
const ENTITY_INLINE_COLORS: Record<string, string> = {
  PER: 'bg-poster-accent-pink/25 text-poster-accent-pink border-b-2 border-poster-accent-pink/50',
  LOC: 'bg-poster-accent-teal/25 text-poster-accent-teal border-b-2 border-poster-accent-teal/50',
  ORG: 'bg-poster-accent-purple/25 text-poster-accent-purple border-b-2 border-poster-accent-purple/50',
  MISC: 'bg-poster-accent-orange/25 text-poster-accent-orange border-b-2 border-poster-accent-orange/50',
};

/** Dot colors for the legend badges */
const ENTITY_DOT_COLORS: Record<string, string> = {
  PER: 'bg-poster-accent-pink',
  LOC: 'bg-poster-accent-teal',
  ORG: 'bg-poster-accent-purple',
  MISC: 'bg-poster-accent-orange',
};

/** Build redacted output with inline styled entity spans */
function buildRedactedSegments(text: string, entities: DetectedEntity[]) {
  if (entities.length === 0) return null;

  const sorted = [...entities].sort((a, b) => a.start - b.start);
  const segments: { text: string; label?: string }[] = [];
  let cursor = 0;

  for (const entity of sorted) {
    if (entity.start > cursor) {
      segments.push({ text: text.slice(cursor, entity.start) });
    }
    segments.push({ text: `[${entity.label}]`, label: entity.label });
    cursor = entity.end;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor) });
  }

  return segments;
}

/** Privacy settings panel with DP toggle, epsilon slider, and budget display */
function PrivacySettingsPanel({
  dpEnabled,
  onToggle,
  epsilon,
  onEpsilonChange,
  budgetState,
}: {
  dpEnabled: boolean;
  onToggle: (enabled: boolean) => void;
  epsilon: number;
  onEpsilonChange: (value: number) => void;
  budgetState: PrivacyBudgetState;
}) {
  const privacyLevel = getPrivacyLevel(epsilon);
  const consumedPercent = (budgetState.consumed / budgetState.maxEpsilon) * 100;

  return (
    <div className="rounded-xl bg-poster-surface/30 border border-poster-border/15 p-4">
      {/* Toggle row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Lock className="w-4 h-4 text-poster-accent-teal" />
          <span className="text-sm font-semibold text-poster-text-main">Enable Differential Privacy</span>
          <span className="px-2 py-0.5 rounded-md bg-poster-accent-teal/10 text-[10px] font-medium text-poster-accent-teal border border-poster-accent-teal/20">
            Embedding {EMBEDDING_MODEL_SIZE}
          </span>
        </div>
        <input
          type="checkbox"
          className="toggle toggle-sm toggle-primary"
          checked={dpEnabled}
          onChange={(e) => onToggle(e.target.checked)}
        />
      </div>

      {/* Expanded controls — only visible when DP is enabled */}
      {dpEnabled && (
        <div className="mt-4 flex flex-col gap-4 pt-4 border-t border-poster-border/10">
          {/* Epsilon slider */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-poster-text-sub">
                Epsilon (privacy parameter)
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-poster-text-main">{epsilon.toFixed(1)}</span>
                <span className={cn('text-xs font-semibold', privacyLevel.color)}>
                  {privacyLevel.label}
                </span>
              </div>
            </div>
            <input
              type="range"
              min={MIN_EPSILON}
              max={MAX_EPSILON}
              step={EPSILON_STEP}
              value={epsilon}
              onChange={(e) => onEpsilonChange(parseFloat(e.target.value))}
              className="range range-xs range-primary"
            />
            <div className="flex justify-between text-[10px] text-poster-text-sub/50">
              <span>More Private</span>
              <span>Less Private</span>
            </div>
          </div>

          {/* Privacy budget display */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-poster-text-sub">Privacy Budget</span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-poster-text-sub">
                  {budgetState.consumed.toFixed(1)} / {budgetState.maxEpsilon.toFixed(1)} used
                </span>
                {budgetState.isExhausted && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-error/15 text-error border border-error/20">
                    Exhausted
                  </span>
                )}
                {budgetState.isLow && !budgetState.isExhausted && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-warning/15 text-warning border border-warning/20">
                    <AlertTriangle className="w-2.5 h-2.5" />
                    Low
                  </span>
                )}
              </div>
            </div>
            <progress
              className={cn(
                'progress w-full h-2',
                budgetState.isExhausted
                  ? 'progress-error'
                  : budgetState.isLow
                    ? 'progress-warning'
                    : 'progress-primary'
              )}
              value={consumedPercent}
              max={100}
            />
            <div className="flex justify-between text-[10px] text-poster-text-sub/50">
              <span>{Math.max(0, budgetState.remaining).toFixed(1)} remaining</span>
              <span>{consumedPercent.toFixed(0)}% consumed</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** DP applied indicator badge shown below the redacted output */
function DPAppliedBadge({ dpResult }: { dpResult: DPEmbeddingResult }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-poster-accent-teal/10 border border-poster-accent-teal/20">
      <Lock className="w-3.5 h-3.5 text-poster-accent-teal" />
      <span className="text-xs font-semibold text-poster-accent-teal">DP Applied</span>
      <span className="w-px h-3 bg-poster-accent-teal/20" />
      <span className="text-xs font-mono text-poster-accent-teal/80">
        epsilon={dpResult.epsilonUsed.toFixed(1)}
      </span>
      <span className="w-px h-3 bg-poster-accent-teal/20" />
      <span className="text-xs font-mono text-poster-text-sub/60">
        {dpResult.dimensions}-dim
      </span>
    </div>
  );
}

/** Main view for the document redactor application */
export function RedactorView() {
  const [input, setInput] = useState('');
  const {
    entities, isScanning, error, scan, downloadRedacted, clearError,
    dpEnabled, setDpEnabled, epsilon, setEpsilon, dpResult, budgetState,
  } = useRedactor();

  const handleLoadSample = () => {
    setInput(SAMPLE_TEXT);
  };

  const redacted = entities.length > 0 ? redactText(input, entities) : '';
  const redactedSegments = buildRedactedSegments(input, entities);

  const entityCounts = entities.reduce(
    (acc, e) => {
      acc[e.label] = (acc[e.label] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const totalEntities = entities.length;
  const hasEntities = totalEntities > 0;
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
              <div className="w-8 h-8 rounded-lg bg-poster-accent-pink/15 flex items-center justify-center ring-1 ring-poster-accent-pink/30 relative">
                <Shield className="w-4 h-4 text-poster-accent-pink" />
                <Lock className="w-2 h-2 text-poster-accent-pink absolute -bottom-0.5 -right-0.5" />
              </div>
              <div>
                <h1 className="text-sm font-semibold text-poster-text-main leading-tight">Document Redactor</h1>
                <p className="text-[11px] text-poster-text-sub/60 leading-tight">PII detection & redaction</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-1 rounded-md bg-poster-accent-pink/10 text-[11px] font-medium text-poster-accent-pink border border-poster-accent-pink/20">
              BERT-NER {MODEL_SIZE}
            </span>
            {hasEntities && (
              <button
                onClick={() => downloadRedacted(input)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-300',
                  'bg-poster-accent-pink/15 text-poster-accent-pink border border-poster-accent-pink/25',
                  'hover:bg-poster-accent-pink/25 hover:shadow-md hover:shadow-poster-accent-pink/10',
                  'animate-pulse hover:animate-none'
                )}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <Download className="w-3.5 h-3.5" />
                Export Clean
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-6xl mx-auto flex flex-col gap-5">
            {/* Error alert */}
            {error && <ErrorAlert message={error.message} onDismiss={clearError} onRetry={() => scan(input)} />}

            {/* Empty state -- shown when no input and no results */}
            {!hasInput && !hasEntities && (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="relative mb-6">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-poster-accent-pink/20 to-poster-accent-pink/5 flex items-center justify-center ring-1 ring-poster-accent-pink/20 shadow-lg shadow-poster-accent-pink/10">
                    <Shield className="w-9 h-9 text-poster-accent-pink" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-lg bg-poster-surface border border-poster-border/30 flex items-center justify-center shadow-sm">
                    <Lock className="w-3.5 h-3.5 text-poster-accent-pink" />
                  </div>
                </div>
                <h2 className="text-xl font-bold text-poster-text-main mb-2">Document Redactor</h2>
                <p className="text-sm text-poster-text-sub/70 text-center max-w-sm mb-6 leading-relaxed">
                  Detect and redact PII — names, locations, organizations — from any text
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {['NER Detection', 'Auto-Redact', 'Download Clean'].map((pill) => (
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

            {/* Stats bar + entity legend */}
            {hasEntities && (
              <div className="flex flex-wrap items-center gap-3 p-3.5 rounded-xl bg-poster-surface/30 border border-poster-border/15">
                {/* Total count */}
                <div className="flex items-center gap-2 pr-3 border-r border-poster-border/20">
                  <ScanEye className="w-4 h-4 text-poster-accent-pink" />
                  <span className="text-sm font-semibold text-poster-text-main">
                    {totalEntities} {totalEntities === 1 ? 'entity' : 'entities'} found
                  </span>
                </div>
                {/* Per-type breakdown badges */}
                {Object.entries(entityCounts).map(([label, count]) => (
                  <span
                    key={label}
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                      ENTITY_COLORS[label] || 'bg-poster-surface text-poster-text-sub'
                    )}
                  >
                    <span className={cn('w-2 h-2 rounded-full flex-shrink-0', ENTITY_DOT_COLORS[label])} />
                    {count} {ENTITY_LABELS[label] || label}
                  </span>
                ))}
              </div>
            )}

            {/* Privacy Settings Panel */}
            <PrivacySettingsPanel
              dpEnabled={dpEnabled}
              onToggle={setDpEnabled}
              epsilon={epsilon}
              onEpsilonChange={setEpsilon}
              budgetState={budgetState}
            />

            {/* Side-by-side panels */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Input panel -- slightly dimmer */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-poster-text-sub uppercase tracking-wider">Original Text</label>
                  <button
                    onClick={handleLoadSample}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-poster-text-sub/60 hover:text-poster-accent-pink hover:bg-poster-accent-pink/10 transition-colors"
                  >
                    <Sparkles className="w-3 h-3" />
                    Load Sample
                  </button>
                </div>
                <div className="relative">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Paste text containing PII to redact..."
                    className="textarea textarea-bordered w-full min-h-[340px] bg-poster-surface/20 border-poster-border/15 text-poster-text-main/70 placeholder:text-poster-text-sub/25 focus:border-poster-accent-pink/40 resize-none text-sm leading-relaxed rounded-xl"
                    disabled={isScanning}
                  />
                  {/* Dim overlay when results are shown */}
                  {hasEntities && (
                    <div className="absolute inset-0 rounded-xl bg-poster-bg/30 pointer-events-none" />
                  )}
                </div>
                <div className="flex items-center justify-end">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => scan(input)}
                    disabled={!input.trim() || isScanning}
                    className={cn(
                      'bg-poster-accent-pink hover:bg-poster-accent-pink/90 border-poster-accent-pink text-white rounded-lg',
                      isScanning && 'opacity-80'
                    )}
                  >
                    {isScanning ? (
                      <Spinner size="sm" className="mr-1.5" />
                    ) : (
                      <Play className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    Scan
                  </Button>
                </div>
              </div>

              {/* Redacted output panel -- elevated with green accent border */}
              <div className="flex flex-col gap-3">
                <label className="text-xs font-semibold text-poster-text-sub uppercase tracking-wider">Redacted Output</label>
                <div
                  className={cn(
                    'min-h-[340px] p-5 rounded-xl border transition-all duration-500',
                    hasEntities
                      ? 'bg-poster-surface/40 border-emerald-500/25 shadow-lg shadow-emerald-500/5 ring-1 ring-emerald-500/10'
                      : 'bg-poster-surface/20 border-poster-border/15'
                  )}
                >
                  {isScanning ? (
                    /* Loading skeleton */
                    <div className="flex flex-col gap-3 animate-pulse">
                      <div className="h-4 w-3/4 rounded bg-poster-surface/40" />
                      <div className="h-4 w-full rounded bg-poster-surface/40" />
                      <div className="h-4 w-5/6 rounded bg-poster-surface/40" />
                      <div className="h-4 w-2/3 rounded bg-poster-surface/40" />
                      <div className="h-4 w-full rounded bg-poster-surface/40" />
                      <div className="h-4 w-4/5 rounded bg-poster-surface/40" />
                    </div>
                  ) : redactedSegments ? (
                    /* Inline-styled redacted text */
                    <p className="text-sm text-poster-text-main/80 leading-relaxed whitespace-pre-wrap">
                      {redactedSegments.map((seg, i) =>
                        seg.label ? (
                          <span
                            key={i}
                            className={cn(
                              'inline-block px-1.5 py-0.5 mx-0.5 rounded-md text-xs font-bold tracking-wide transition-all duration-300',
                              ENTITY_INLINE_COLORS[seg.label] || 'bg-poster-surface text-poster-text-sub'
                            )}
                            title={ENTITY_LABELS[seg.label] || seg.label}
                          >
                            {seg.text}
                          </span>
                        ) : (
                          <span key={i}>{seg.text}</span>
                        )
                      )}
                    </p>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full min-h-[280px] gap-3">
                      <div className="w-12 h-12 rounded-xl bg-poster-surface/40 flex items-center justify-center">
                        <FileDown className="w-5 h-5 text-poster-text-sub/25" />
                      </div>
                      <p className="text-sm text-poster-text-sub/30 font-medium">
                        Redacted text will appear here
                      </p>
                    </div>
                  )}
                </div>
                {hasEntities && (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-emerald-400/70 font-medium flex items-center gap-1.5">
                      <ShieldCheck className="w-3 h-3" />
                      {totalEntities} entities detected and redacted
                    </span>
                  </div>
                )}
                {/* DP Applied indicator */}
                {dpResult && <DPAppliedBadge dpResult={dpResult} />}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
