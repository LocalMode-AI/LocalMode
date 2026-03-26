/**
 * @file translator-view.tsx
 * @description Main view component for the translator application
 */
'use client';

import { useState } from 'react';
import { Languages, ArrowRightLeft, Play, Square, Copy, Check, ArrowLeft, Globe, Wifi, Zap } from 'lucide-react';
import { Button, IconBox, Spinner } from './ui';
import { ErrorBoundary, ErrorAlert } from './error-boundary';
import { cn } from '../_lib/utils';
import { LANGUAGE_PAIRS, MODEL_SIZE } from '../_lib/constants';
import { useTranslator } from '../_hooks/use-translator';

/** Language code to accent border color mapping */
const LANGUAGE_ACCENTS: Record<string, string> = {
  en: 'border-t-blue-500',
  de: 'border-t-amber-500',
  fr: 'border-t-indigo-500',
  es: 'border-t-red-500',
};

/** Language code to flag emoji mapping */
const LANGUAGE_FLAGS: Record<string, string> = {
  en: '\uD83C\uDDEC\uD83C\uDDE7',
  de: '\uD83C\uDDE9\uD83C\uDDEA',
  fr: '\uD83C\uDDEB\uD83C\uDDF7',
  es: '\uD83C\uDDEA\uD83C\uDDF8',
};

/** Main translator view */
export function TranslatorView() {
  const [input, setInputLocal] = useState('');
  const [pairIndex, setPairIndexLocal] = useState(0);
  const [copied, setCopied] = useState(false);

  const {
    translation: output,
    isTranslating,
    error,
    handleTranslate,
    cancel,
    clearError,
  } = useTranslator();

  const setInput = (value: string) => setInputLocal(value);
  const setPairIndex = (value: number) => setPairIndexLocal(value);

  const pair = LANGUAGE_PAIRS[pairIndex];
  const hasInput = input.trim().length > 0;
  const hasOutput = output.length > 0;

  const handleCopy = async () => {
    if (output) {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSwapLanguages = () => {
    const reversePairIndex = LANGUAGE_PAIRS.findIndex(
      (p) => p.source === pair.target && p.target === pair.source
    );
    if (reversePairIndex !== -1) {
      setPairIndex(reversePairIndex);
      if (output) {
        setInput(output);
      }
    }
  };

  /** Get unique source languages from language pairs */
  const sourceLanguages = [...new Set(LANGUAGE_PAIRS.map((p) => p.source))];

  /** Get available target languages for the current source */
  const targetLanguages = LANGUAGE_PAIRS.filter((p) => p.source === pair.source);

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
            <IconBox size="sm" className="bg-poster-accent-teal/10 text-poster-accent-teal ring-1 ring-poster-accent-teal/30">
              <Languages className="w-4 h-4" />
            </IconBox>
            <div>
              <h1 className="text-base font-semibold text-poster-text-main">Offline Translator</h1>
              <p className="text-xs text-poster-text-sub">Opus-MT models, entirely local</p>
            </div>
          </div>
          <div className="badge badge-ghost badge-sm gap-1.5 bg-poster-accent-teal/10 text-poster-accent-teal border-poster-accent-teal/20">
            <span className="w-1.5 h-1.5 rounded-full bg-poster-accent-teal" />
            Opus-MT &bull; {MODEL_SIZE}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-5xl mx-auto flex flex-col gap-8">
            {error && <ErrorAlert message={error.message} onDismiss={clearError} onRetry={() => handleTranslate(input, pairIndex)} />}

            {/* Empty state */}
            {!hasInput && !hasOutput && !isTranslating && (
              <div className="flex flex-col items-center justify-center py-12 gap-5">
                <div className="relative">
                  <div className="w-20 h-20 rounded-2xl bg-poster-accent-teal/10 flex items-center justify-center ring-1 ring-poster-accent-teal/20 shadow-lg shadow-poster-accent-teal/5">
                    <Languages className="w-10 h-10 text-poster-accent-teal" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-lg bg-poster-surface border border-poster-border/30 flex items-center justify-center shadow-sm">
                    <Globe className="w-3.5 h-3.5 text-poster-text-sub" />
                  </div>
                </div>
                <div className="text-center">
                  <h2 className="text-xl font-semibold text-poster-text-main mb-1.5">Offline Translator</h2>
                  <p className="text-sm text-poster-text-sub max-w-md">
                    Translate between {LANGUAGE_PAIRS.length} language pairs, entirely in your browser
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                  <span className="badge badge-ghost badge-sm gap-1.5 bg-poster-surface border-poster-border/30 text-poster-text-sub">
                    <Wifi className="w-3 h-3" />
                    Works offline
                  </span>
                  <span className="badge badge-ghost badge-sm gap-1.5 bg-poster-surface border-poster-border/30 text-poster-text-sub">
                    <Zap className="w-3 h-3" />
                    Runs locally
                  </span>
                  <span className="badge badge-ghost badge-sm gap-1.5 bg-poster-surface border-poster-border/30 text-poster-text-sub">
                    <Globe className="w-3 h-3" />
                    {sourceLanguages.length} languages
                  </span>
                </div>
              </div>
            )}

            {/* Language selector cards */}
            <div className="flex items-center justify-center gap-3">
              {/* Source language card */}
              <div className="flex-1">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-poster-text-sub/60 font-medium pl-1">From</span>
                  <div className="flex flex-wrap gap-1.5">
                    {sourceLanguages.map((lang) => {
                      const isActive = pair.source === lang;
                      const langName = LANGUAGE_PAIRS.find((p) => p.source === lang)?.sourceName ?? lang;
                      return (
                        <button
                          key={lang}
                          onClick={() => {
                            const newPair = LANGUAGE_PAIRS.find((p) => p.source === lang);
                            if (newPair) setPairIndex(LANGUAGE_PAIRS.indexOf(newPair));
                          }}
                          className={cn(
                            'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-300 border',
                            isActive
                              ? 'bg-poster-accent-teal/10 border-poster-accent-teal/30 text-poster-accent-teal shadow-sm'
                              : 'bg-poster-surface/50 border-poster-border/20 text-poster-text-sub hover:bg-poster-surface hover:border-poster-border/40'
                          )}
                        >
                          <span className="text-sm">{LANGUAGE_FLAGS[lang]}</span>
                          {langName}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Swap button */}
              <button
                onClick={handleSwapLanguages}
                className="group flex items-center justify-center w-10 h-10 rounded-full bg-poster-surface border border-poster-border/30 hover:border-poster-accent-teal/40 hover:bg-poster-accent-teal/10 transition-all duration-300 shadow-sm mt-5"
                title="Swap languages"
              >
                <ArrowRightLeft className="w-4 h-4 text-poster-text-sub group-hover:text-poster-accent-teal transition-all duration-300 group-hover:rotate-180" />
              </button>

              {/* Target language card */}
              <div className="flex-1">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-poster-text-sub/60 font-medium pl-1">To</span>
                  <div className="flex flex-wrap gap-1.5">
                    {targetLanguages.map((p) => {
                      const isActive = pair.target === p.target;
                      return (
                        <button
                          key={p.target}
                          onClick={() => setPairIndex(LANGUAGE_PAIRS.indexOf(p))}
                          className={cn(
                            'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-300 border',
                            isActive
                              ? 'bg-poster-accent-teal/10 border-poster-accent-teal/30 text-poster-accent-teal shadow-sm'
                              : 'bg-poster-surface/50 border-poster-border/20 text-poster-text-sub hover:bg-poster-surface hover:border-poster-border/40'
                          )}
                        >
                          <span className="text-sm">{LANGUAGE_FLAGS[p.target]}</span>
                          {p.targetName}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Translation panels */}
            <ErrorBoundary>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Source panel */}
                <div className={cn(
                  'flex flex-col rounded-2xl bg-poster-surface/30 backdrop-blur-sm border border-poster-border/20 overflow-hidden transition-all duration-300',
                  'border-t-2',
                  LANGUAGE_ACCENTS[pair.source] ?? 'border-t-poster-primary'
                )}>
                  {/* Source header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-poster-border/10">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{LANGUAGE_FLAGS[pair.source]}</span>
                      <span className="text-sm font-medium text-poster-text-main">{pair.sourceName}</span>
                    </div>
                    <span className="text-xs text-poster-text-sub/60 tabular-nums">{input.length} chars</span>
                  </div>

                  {/* Source textarea */}
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={`Type ${pair.sourceName} text here...`}
                    className="w-full min-h-[220px] p-4 bg-transparent text-poster-text-main placeholder:text-poster-text-sub/30 focus:outline-none resize-none text-sm leading-relaxed"
                    disabled={isTranslating}
                  />

                  {/* Source footer */}
                  <div className="flex items-center justify-end px-4 py-3 border-t border-poster-border/10">
                    {isTranslating ? (
                      <Button variant="ghost" size="sm" onClick={cancel} className="gap-1.5 text-red-400 hover:text-red-300">
                        <Square className="w-3.5 h-3.5" />
                        Stop
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleTranslate(input, pairIndex)}
                        disabled={!hasInput}
                        className="gap-1.5 bg-poster-accent-teal hover:bg-poster-accent-teal/80 border-none"
                      >
                        <Play className="w-3.5 h-3.5" />
                        Translate
                      </Button>
                    )}
                  </div>
                </div>

                {/* Target panel */}
                <div className={cn(
                  'flex flex-col rounded-2xl bg-poster-surface/30 backdrop-blur-sm border border-poster-border/20 overflow-hidden transition-all duration-300',
                  'border-t-2',
                  LANGUAGE_ACCENTS[pair.target] ?? 'border-t-poster-primary'
                )}>
                  {/* Target header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-poster-border/10">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{LANGUAGE_FLAGS[pair.target]}</span>
                      <span className="text-sm font-medium text-poster-text-main">{pair.targetName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {hasOutput && (
                        <span className="text-xs text-poster-text-sub/60 tabular-nums">{output.length} chars</span>
                      )}
                      {hasOutput && (
                        <button
                          onClick={handleCopy}
                          className={cn(
                            'flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all duration-300',
                            copied
                              ? 'bg-green-500/10 text-green-400'
                              : 'hover:bg-poster-surface text-poster-text-sub hover:text-poster-text-main'
                          )}
                        >
                          <span className={cn(
                            'transition-all duration-300',
                            copied && 'scale-110'
                          )}>
                            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          </span>
                          {copied ? 'Copied!' : 'Copy'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Target content */}
                  <div className="min-h-[220px] p-4">
                    {isTranslating ? (
                      <div className="flex flex-col gap-3 animate-pulse">
                        <div className="h-4 bg-poster-border/20 rounded-full w-3/4" />
                        <div className="h-4 bg-poster-border/15 rounded-full w-1/2" />
                        <div className="h-4 bg-poster-border/10 rounded-full w-5/6" />
                        <div className="h-4 bg-poster-border/10 rounded-full w-2/3" />
                      </div>
                    ) : hasOutput ? (
                      <p className="text-sm text-poster-text-main leading-relaxed whitespace-pre-wrap">{output}</p>
                    ) : (
                      <p className="text-sm text-poster-text-sub/30 italic">Translation will appear here...</p>
                    )}
                  </div>

                  {/* Target footer */}
                  <div className="flex items-center justify-end px-4 py-3 border-t border-poster-border/10">
                    <span className="text-[10px] text-poster-text-sub/40">Powered by Opus-MT</span>
                  </div>
                </div>
              </div>
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  );
}
