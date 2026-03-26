/**
 * @file writer-view.tsx
 * @description Main view component for the Smart Writer application.
 * Writing assistant powered by Chrome AI with Transformers.js fallback.
 */
'use client';

import { useState } from 'react';
import { FileText, Languages, Sparkles, Copy, Check, Square, Zap, Download, Trash2 } from 'lucide-react';
import { Button, Badge, TextArea, Select, Spinner, IconBox } from './ui';
import { ErrorBoundary, ErrorAlert } from './error-boundary';
import { cn, countWords, formatDuration } from '../_lib/utils';
import { LANGUAGE_PAIRS, SAMPLE_TEXT } from '../_lib/constants';
import { useSmartWriter } from '../_hooks/use-smart-writer';

/** Provider status badge */
function ProviderBadge({ provider, label }: { provider: string; label?: string }) {
  const isChrome = provider === 'chrome-ai';
  return (
    <Badge variant={isChrome ? 'success' : 'default'} className="gap-1">
      {isChrome ? <Zap className="w-3 h-3" /> : <Download className="w-3 h-3" />}
      {label ?? (isChrome ? 'Chrome AI' : 'Transformers.js')}
    </Badge>
  );
}

/** Empty state when no input */
function EmptyState({ onLoadSample }: { onLoadSample: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 p-8 text-center">
      <IconBox className="mb-4 w-14 h-14">
        <Sparkles className="w-7 h-7 text-poster-primary" />
      </IconBox>
      <h2 className="text-lg font-bold text-poster-text-main mb-2">Smart Writer</h2>
      <p className="text-sm text-poster-text-sub mb-6 max-w-md">
        Enter text to summarize or translate. Powered by Chrome&apos;s built-in AI when available, with automatic fallback to Transformers.js.
      </p>
      <Button variant="outline" size="sm" onClick={onLoadSample}>
        <FileText className="w-4 h-4 mr-2" />
        Load Sample Text
      </Button>
    </div>
  );
}

/** Main writer view */
export function WriterView() {
  const [input, setInput] = useState('');
  const [copied, setCopied] = useState(false);

  const {
    activeTab, setActiveTab,
    summary, isSummarizing, summaryError, summaryProvider, handleSummarize, cancelSummary, clearSummary,
    translation, isTranslating, translationError, translateProvider, handleTranslate, cancelTranslation, clearTranslation,
    pairIndex, setPairIndex, currentPair,
    isModelReady,
  } = useSmartWriter();

  const hasInput = input.trim().length > 0;
  const result = activeTab === 'summarize' ? summary : translation;
  const isProcessing = activeTab === 'summarize' ? isSummarizing : isTranslating;
  const error = activeTab === 'summarize' ? summaryError : translationError;
  const activeProvider = activeTab === 'summarize' ? summaryProvider : translateProvider;

  const handleAction = () => {
    if (activeTab === 'summarize') {
      handleSummarize(input);
    } else {
      handleTranslate(input);
    }
  };

  const handleCancel = () => {
    if (activeTab === 'summarize') cancelSummary();
    else cancelTranslation();
  };

  const handleClear = () => {
    if (activeTab === 'summarize') clearSummary();
    else clearTranslation();
  };

  const handleCopy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-[calc(100vh-4rem)] bg-poster-bg flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-poster-border bg-poster-surface/50">
        <div className="flex items-center gap-3">
          <IconBox>
            <Sparkles className="w-5 h-5 text-poster-primary" />
          </IconBox>
          <div>
            <h1 className="text-lg font-bold text-poster-text-main">Smart Writer</h1>
            <p className="text-xs text-poster-text-sub">AI writing assistant</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ProviderBadge provider={activeProvider} />
        </div>
      </header>

      {/* Tab bar */}
      <div className="flex px-6 pt-3 gap-2">
        <button
          className={cn('btn btn-sm', activeTab === 'summarize' ? 'btn-primary' : 'btn-ghost')}
          onClick={() => setActiveTab('summarize')}
        >
          <FileText className="w-4 h-4 mr-1" />
          Summarize
        </button>
        <button
          className={cn('btn btn-sm', activeTab === 'translate' ? 'btn-primary' : 'btn-ghost')}
          onClick={() => setActiveTab('translate')}
        >
          <Languages className="w-4 h-4 mr-1" />
          Translate
        </button>

        {activeTab === 'translate' && (
          <Select
            value={pairIndex}
            onChange={(e) => setPairIndex(Number(e.target.value))}
            className="ml-auto"
          >
            {LANGUAGE_PAIRS.map((pair, i) => (
              <option key={pair.target} value={i}>
                {pair.sourceName} → {pair.targetName}
              </option>
            ))}
          </Select>
        )}
      </div>

      {/* Error alert */}
      {error && (
        <div className="px-6 pt-3">
          <ErrorAlert
            message={error.message}
            onDismiss={handleClear}
            onRetry={() => handleAction()}
          />
        </div>
      )}

      {/* Content */}
      <ErrorBoundary>
        <div className="flex-1 flex flex-col lg:flex-row gap-4 p-6 overflow-hidden">
          {/* Input panel */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-poster-text-sub">Input</span>
              <span className="text-xs text-poster-text-sub">{countWords(input)} words</span>
            </div>
            <TextArea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Enter text to process..."
              className="flex-1 min-h-[200px]"
            />
            <div className="flex items-center gap-2 mt-3">
              {isProcessing ? (
                <Button variant="ghost" size="sm" onClick={handleCancel}>
                  <Square className="w-4 h-4 mr-1" />
                  Cancel
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleAction}
                  disabled={!hasInput || !isModelReady}
                  loading={!isModelReady}
                >
                  <Sparkles className="w-4 h-4 mr-1" />
                  {activeTab === 'summarize' ? 'Summarize' : `Translate to ${currentPair.targetName}`}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setInput(SAMPLE_TEXT)}>
                Load Sample
              </Button>
              {hasInput && (
                <Button variant="ghost" size="sm" onClick={() => { setInput(''); handleClear(); }}>
                  <Trash2 className="w-3 h-3 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          </div>

          {/* Result panel */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-poster-text-sub">
                {activeTab === 'summarize' ? 'Summary' : 'Translation'}
              </span>
              {result && (
                <button onClick={handleCopy} className="btn btn-ghost btn-xs gap-1">
                  {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              )}
            </div>
            <div className="flex-1 rounded-xl border border-poster-border bg-poster-surface p-4 overflow-auto min-h-[200px]">
              {isProcessing ? (
                <div className="flex items-center justify-center h-full">
                  <Spinner size="lg" />
                </div>
              ) : result ? (
                <p className="text-poster-text-main whitespace-pre-wrap leading-relaxed">{result}</p>
              ) : (
                <EmptyState onLoadSample={() => setInput(SAMPLE_TEXT)} />
              )}
            </div>
          </div>
        </div>
      </ErrorBoundary>
    </div>
  );
}
