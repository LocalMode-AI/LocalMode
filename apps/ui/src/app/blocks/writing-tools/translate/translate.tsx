'use client';

/**
 * @file translate.tsx
 * @description Translate block — 24 directed offline Opus-MT pairs (English-centric, every model id verified) with swap-carries-output, per-panel char counts, copy, cancel, and truthful badging (Chrome Translator API ⇄ Opus-MT fallback).
 */
import { useEffect, useState } from 'react';
import {
  useTranslate,
  useProviderFallback,
  toAppError,
  providerName,
  type ResolvedModel,
} from '@localmode/react';
import type { TranslationModel } from '@localmode/core';

import { LanguagePairSelector } from '@/components/language-pair-selector';
import { ProviderBadge } from '@/components/provider-badge';
import { CopyButton } from '@/components/copy-button';
import { ErrorAlert } from '@/components/error-alert';
import { cn } from '@/lib/utils';

/** A UI language (for the pair selector). */
interface Language {
  code: string;
  name: string;
  flag: string;
}

/**
 * Every language the Translate block offers. Opus-MT is English-centric, so
 * exactly one side of a pair is always English — the block enforces that so
 * every selectable pair maps to a real `Xenova/opus-mt-{src}-{tgt}` model.
 * (Portuguese was dropped — `Xenova/opus-mt-en-pt` 401s on the Hub.)
 */
const LANGUAGES: Language[] = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'it', name: 'Italian', flag: '🇮🇹' },
  { code: 'nl', name: 'Dutch', flag: '🇳🇱' },
  { code: 'ru', name: 'Russian', flag: '🇷🇺' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
  { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
  { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
  { code: 'fi', name: 'Finnish', flag: '🇫🇮' },
  { code: 'uk', name: 'Ukrainian', flag: '🇺🇦' },
  { code: 'sv', name: 'Swedish', flag: '🇸🇪' },
];

/** Non-English languages, each paired bidirectionally with English. */
const NON_ENGLISH_CODES = LANGUAGES.filter((l) => l.code !== 'en').map((l) => l.code);

/** Total directed pairs: 12 non-English languages × 2 directions = 24. */
const DIRECTED_PAIR_COUNT = NON_ENGLISH_CODES.length * 2;

/** Human-readable model-size hint for the Opus-MT fallback models. */
const OPUS_MT_SIZE = '~80 MB per pair';

/** Resolve the verified Opus-MT model id for an English-centric directed pair. */
function opusMtModelId(source: string, target: string): string {
  return `Xenova/opus-mt-${source}-${target}`;
}

/** Look up a {@link Language} by code (falls back to a bare code entry). */
function languageByCode(code: string): Language {
  return LANGUAGES.find((l) => l.code === code) ?? { code, name: code, flag: '' };
}

/** Translate sample sentence (English source; short and deterministic). */
const TRANSLATE_SAMPLE = 'The weather is nice today and I want to go for a walk.';

const FIRST_NON_EN = LANGUAGES.find((l) => l.code !== 'en')!.code;

export function TranslateBlock() {
  const [source, setSource] = useState('en');
  const [target, setTarget] = useState('de');
  const [input, setInput] = useState('');
  const [resolved, setResolved] = useState<ResolvedModel<TranslationModel> | null>(null);
  // Inject bundler-visible provider loaders (the hook's default Function()-hidden
  // import cannot be resolved as a bare specifier in the browser).
  const { resolveTranslator } = useProviderFallback({
    loadChromeAI: () => import('@localmode/chrome-ai'),
    loadTransformers: () => import('@localmode/transformers'),
  });

  const { data, error, isLoading, execute, cancel, reset } = useTranslate({
    model: resolved?.model as TranslationModel,
  });

  // Resolve the translator for the current directed pair (no download until run).
  useEffect(() => {
    let alive = true;
    setResolved(null);
    void resolveTranslator({
      source,
      target,
      fallbackModelId: opusMtModelId(source, target),
    }).then((r) => {
      if (alive) setResolved(r);
    });
    return () => {
      alive = false;
    };
  }, [source, target, resolveTranslator]);

  const output = data?.translation ?? '';
  const ready = !!resolved;
  const appErr = toAppError(error);
  const modelId = data?.response.modelId ?? resolved?.modelId ?? null;

  // English-centric constraint: exactly one side is always English.
  const selectSource = (code: string) => {
    reset();
    if (code === 'en') {
      setSource('en');
      if (target === 'en') setTarget(FIRST_NON_EN);
    } else {
      setSource(code);
      setTarget('en');
    }
  };
  const selectTarget = (code: string) => {
    reset();
    if (code === 'en') {
      setTarget('en');
      if (source === 'en') setSource(FIRST_NON_EN);
    } else {
      setTarget(code);
      setSource('en');
    }
  };

  // Swap direction (reverse pair always exists here) + carry output → input.
  const swap = () => {
    const carried = output;
    reset();
    setSource(target);
    setTarget(source);
    if (carried) setInput(carried);
  };

  const translate = () => {
    if (!input.trim() || !ready || isLoading) return;
    void execute({ text: input, sourceLanguage: source, targetLanguage: target });
  };

  const targetName = languageByCode(target).name;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <p className="text-xs text-muted-foreground">
        Translate - 24 offline Opus-MT pairs. Models load only behind an explicit action.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span data-provider={resolved?.provider ?? 'resolving'}>
          <ProviderBadge
            providerName={resolved ? providerName(resolved.provider) : null}
            tier={resolved?.tier ?? 'download'}
            modelId={modelId}
          />
        </span>
        <span data-model-id={modelId ?? ''} className="sr-only">
          {modelId ?? ''}
        </span>
        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
          {['Works offline', 'Runs locally', `${DIRECTED_PAIR_COUNT} pairs`, `Opus-MT · ${OPUS_MT_SIZE}`].map(
            (b) => (
              <span key={b} className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">
                {b}
              </span>
            ),
          )}
        </div>
      </div>

      {/* The selector's own swap button is the swap affordance; the E2E drives
          it via a role lookup scoped inside this testid container. */}
      <div className="flex items-center gap-2">
        <LanguagePairSelector
          languages={LANGUAGES}
          sourceCode={source}
          targetCode={target}
          onSelectSource={selectSource}
          onSelectTarget={selectTarget}
          onSwap={swap}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Source panel */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{languageByCode(source).name}</span>
            <span>{input.length} chars</span>
          </div>
          <textarea
            aria-label="Text to translate"
            dir="auto"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
            rows={6}
            placeholder="Enter text to translate…"
            className="w-full resize-y rounded-md border border-border bg-background p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => setInput(TRANSLATE_SAMPLE)}
            disabled={isLoading}
            className="self-start rounded text-xs text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            Load sample
          </button>
        </div>

        {/* Target panel */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{targetName}</span>
            {output && <span>{output.length} chars</span>}
          </div>
          <div
            data-provider={resolved?.provider ?? ''}
            role="region"
            aria-label="Translation"
            aria-live="polite"
            dir="auto"
            className="min-h-[8.5rem] whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-2 text-sm"
          >
            {isLoading ? (
              <span className="flex flex-col gap-2" aria-label="Translating…">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-3 animate-pulse rounded bg-muted" style={{ width: `${90 - i * 15}%` }} />
                ))}
              </span>
            ) : output ? (
              output
            ) : (
              <span className="text-muted-foreground">Translation will appear here…</span>
            )}
          </div>
          {output && !isLoading && (
            <span className="self-start">
              <CopyButton value={output} />
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          data-running={isLoading}
          onClick={isLoading ? cancel : translate}
          disabled={!ready || (!input.trim() && !isLoading)}
          className={cn(
            'inline-flex h-8 items-center rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
            isLoading
              ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
              : 'bg-primary text-primary-foreground hover:bg-primary/90',
          )}
        >
          {isLoading ? 'Stop' : ready ? `Translate to ${targetName}` : 'Preparing…'}
        </button>
      </div>

      {appErr && (
        <span>
          <ErrorAlert message={appErr.message} onRetry={translate} onDismiss={reset} />
        </span>
      )}
    </div>
  );
}
