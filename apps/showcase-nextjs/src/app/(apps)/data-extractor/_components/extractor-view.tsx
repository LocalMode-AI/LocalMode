/**
 * @file extractor-view.tsx
 * @description Main UI component for the data extractor application
 */
'use client';

import { useState } from 'react';
import {
  User,
  Calendar,
  Star,
  ChefHat,
  Briefcase,
  Play,
  Square,
  FileText,
  Braces,
  Cpu,
  Clock,
  Hash,
  RotateCcw,
} from 'lucide-react';
import { Button, Badge, Spinner, IconBox } from './ui';
import { ErrorBoundary, ErrorAlert } from './error-boundary';
import { useExtractor } from '../_hooks';
import { EXTRACTION_TEMPLATES, AVAILABLE_MODELS } from '../_lib/constants';
import { cn, formatTokens, formatDuration } from '../_lib/utils';
import type { TemplateName } from '../_lib/types';

/** Map template icon names to Lucide components */
const ICON_MAP: Record<string, typeof User> = {
  User,
  Calendar,
  Star,
  ChefHat,
  Briefcase,
};

/** Template tab colors */
const TEMPLATE_COLORS: Record<TemplateName, string> = {
  contact: 'text-poster-accent-teal',
  event: 'text-poster-accent-purple',
  review: 'text-poster-accent-orange',
  recipe: 'text-poster-accent-pink',
  job: 'text-poster-primary',
};

/** Main data extractor view component */
export function ExtractorView() {
  const {
    result,
    rawText,
    attempts,
    usage,
    isExtracting,
    error,
    template,
    currentTemplate,
    modelId,
    extract,
    cancel,
    clearError,
    setTemplate,
    setModelId,
  } = useExtractor();

  const [input, setInput] = useState('');

  // Derived state
  const hasInput = input.trim().length > 0;
  const hasResult = result !== null;

  const handleExtract = () => extract(input);
  const handleLoadSample = () => setInput(currentTemplate.sampleText);
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.metaKey && hasInput && !isExtracting) {
      handleExtract();
    }
  };

  return (
    <div className="h-[calc(100vh-4rem)] bg-poster-bg flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-poster-border">
        <div className="flex items-center gap-3">
          <IconBox>
            <Braces className="w-4 h-4" />
          </IconBox>
          <div>
            <h1 className="text-lg font-semibold text-poster-text-main">Data Extractor</h1>
            <p className="text-xs text-poster-text-sub">Extract structured JSON from text using local AI</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-poster-text-sub" />
          <select
            className="select select-bordered select-sm bg-poster-surface text-poster-text-main"
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
          >
            {AVAILABLE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.size})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Template Selector */}
      <div className="flex gap-2 px-6 py-3 border-b border-poster-border overflow-x-auto">
        {(Object.entries(EXTRACTION_TEMPLATES) as [TemplateName, typeof currentTemplate][]).map(
          ([key, tmpl]) => {
            const Icon = ICON_MAP[tmpl.icon] ?? FileText;
            const isActive = key === template;
            return (
              <button
                key={key}
                className={cn(
                  'btn btn-sm gap-2 shrink-0',
                  isActive ? 'btn-primary' : 'btn-ghost text-poster-text-sub'
                )}
                onClick={() => setTemplate(key)}
              >
                <Icon className={cn('w-3.5 h-3.5', isActive ? '' : TEMPLATE_COLORS[key])} />
                {tmpl.name}
              </button>
            );
          }
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left: Input */}
        <div className="flex-1 flex flex-col p-6 border-b lg:border-b-0 lg:border-r border-poster-border overflow-auto">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-poster-text-main">Input Text</span>
            <Button variant="ghost" size="xs" onClick={handleLoadSample}>
              <FileText className="w-3.5 h-3.5" />
              Load Sample
            </Button>
          </div>

          <textarea
            className="textarea textarea-bordered flex-1 min-h-[160px] bg-poster-surface text-poster-text-main resize-none font-mono text-sm"
            placeholder="Paste text to extract structured data from..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />

          {/* Schema Preview */}
          <div className="mt-3 p-3 rounded-lg bg-poster-surface border border-poster-border">
            <div className="flex items-center gap-2 mb-1">
              <Braces className="w-3.5 h-3.5 text-poster-text-sub" />
              <span className="text-xs font-medium text-poster-text-sub">Schema</span>
            </div>
            <code className="text-xs text-poster-primary font-mono">{currentTemplate.schemaDisplay}</code>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 mt-3">
            {isExtracting ? (
              <Button variant="ghost" size="sm" onClick={cancel}>
                <Square className="w-3.5 h-3.5" />
                Cancel
              </Button>
            ) : (
              <Button size="sm" onClick={handleExtract} disabled={!hasInput}>
                <Play className="w-3.5 h-3.5" />
                Extract
              </Button>
            )}
          </div>

          {/* Error */}
          {error && (
            <ErrorAlert
              message={error.message}
              onDismiss={clearError}
              onRetry={hasInput ? handleExtract : undefined}
              className="mt-3"
            />
          )}
        </div>

        {/* Right: Result */}
        <div className="flex-1 flex flex-col p-6 overflow-auto">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-poster-text-main">Result</span>
            {hasResult && (
              <Badge variant="success" size="sm">
                <RotateCcw className="w-3 h-3 mr-1" />
                Attempt {attempts}/3
              </Badge>
            )}
          </div>

          <ErrorBoundary>
            {isExtracting && !hasResult && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <Spinner size="lg" className="mx-auto mb-3 text-poster-primary" />
                  <p className="text-sm text-poster-text-sub">Extracting structured data...</p>
                </div>
              </div>
            )}

            {hasResult && (
              <div className="flex-1 flex flex-col gap-3">
                {/* JSON Result */}
                <pre className="flex-1 p-4 rounded-lg bg-poster-surface border border-poster-border overflow-auto text-sm font-mono text-poster-text-main whitespace-pre-wrap">
                  {JSON.stringify(result, null, 2)}
                </pre>

                {/* Usage Stats */}
                {usage && (
                  <div className="flex items-center gap-4 text-xs text-poster-text-sub">
                    <span className="flex items-center gap-1">
                      <Hash className="w-3 h-3" />
                      {formatTokens(usage.totalTokens)} tokens
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDuration(usage.durationMs)}
                    </span>
                    <span className="flex items-center gap-1">
                      <RotateCcw className="w-3 h-3" />
                      {attempts} attempt{attempts !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}
              </div>
            )}

            {!isExtracting && !hasResult && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center text-poster-text-sub">
                  <Braces className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Select a template, paste text, and click Extract</p>
                  <p className="text-xs mt-1 opacity-60">JSON output will appear here</p>
                </div>
              </div>
            )}
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
