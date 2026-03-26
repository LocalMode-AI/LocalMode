/**
 * @file migrator-view.tsx
 * @description Main view component for the data migrator application.
 * File upload, format detection, preview, import with progress, and export.
 */
'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Upload,
  FileDown,
  Play,
  Square,
  Trash2,
  Sparkles,
  Database,
  FileText,
  Zap,
  Clock,
  ArrowRightLeft,
  ToggleLeft,
  ToggleRight,
  CheckCircle2,
} from 'lucide-react';
import { Button, IconBox, FormatBadge, ProgressBar, StatsCard, Spinner } from './ui';
import { ErrorBoundary, ErrorAlert } from './error-boundary';
import { cn, formatFileSize, formatDuration, truncateText } from '../_lib/utils';
import {
  EMBEDDING_MODEL_SIZE,
  FORMAT_LABELS,
  PHASE_LABELS,
  SUPPORTED_EXTENSIONS,
} from '../_lib/constants';
import { useMigrator } from '../_hooks/use-migrator';

/** Feature pill shown in empty state */
function FeaturePill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-poster-surface border border-poster-border/30 text-xs text-poster-text-sub">
      {icon}
      {label}
    </span>
  );
}

/** Rich empty state with gradient icon and description */
function EmptyState({ onFileSelect }: { onFileSelect: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) onFileSelect(file);
  };

  return (
    <div className="flex flex-col items-center justify-center py-16 animate-fadeIn">
      {/* Gradient icon */}
      <div className="relative mb-8">
        <div className="absolute inset-0 rounded-3xl bg-poster-accent-teal/20 blur-2xl animate-pulse-glow" />
        <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-poster-accent-teal to-poster-accent-teal/60 flex items-center justify-center shadow-lg shadow-poster-accent-teal/20">
          <ArrowRightLeft className="w-10 h-10 text-white" />
        </div>
        <div className="absolute -top-1 -right-1">
          <Sparkles className="w-5 h-5 text-poster-accent-teal animate-float" />
        </div>
      </div>

      {/* Title and subtitle */}
      <h2 className="text-2xl font-bold text-poster-text-main mb-2">Data Migrator</h2>
      <p className="text-sm text-poster-text-sub text-center max-w-md mb-6 leading-relaxed">
        Import vector data from Pinecone, ChromaDB, CSV, or JSONL files.
        Export to interoperable formats. All processing happens locally.
      </p>

      {/* Feature pills */}
      <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
        <FeaturePill icon={<Database className="w-3.5 h-3.5 text-poster-accent-teal" />} label="Pinecone & ChromaDB" />
        <FeaturePill icon={<FileText className="w-3.5 h-3.5 text-poster-accent-teal" />} label="CSV & JSONL" />
        <FeaturePill icon={<Zap className="w-3.5 h-3.5 text-poster-accent-teal" />} label="Re-embedding" />
      </div>

      {/* Upload area */}
      <div
        className="w-full max-w-md border-2 border-dashed border-poster-border/40 rounded-2xl p-8 flex flex-col items-center gap-4 hover:border-poster-accent-teal/50 transition-colors cursor-pointer"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="w-8 h-8 text-poster-text-sub" />
        <div className="text-center">
          <p className="text-sm font-medium text-poster-text-main">
            Drop your export file here
          </p>
          <p className="text-xs text-poster-text-sub mt-1">
            Supports {SUPPORTED_EXTENSIONS.join(', ')} files
          </p>
        </div>
        <button className="btn btn-primary btn-sm gap-2 bg-poster-accent-teal hover:bg-poster-accent-teal/80 border-poster-accent-teal hover:border-poster-accent-teal/80 cursor-pointer">
          <Upload className="w-4 h-4" />
          Select File
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={SUPPORTED_EXTENSIONS.join(',')}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFileSelect(file);
          }}
        />
      </div>
    </div>
  );
}

/** Preview table showing first N records */
function PreviewTable({ records }: { records: Array<{ id: string; textSnippet?: string; vectorDims: number; metadataKeys: string[] }> }) {
  if (records.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-xl border border-poster-border/30">
      <table className="table table-sm">
        <thead>
          <tr className="bg-poster-surface/50">
            <th className="text-poster-text-sub">ID</th>
            <th className="text-poster-text-sub">Text</th>
            <th className="text-poster-text-sub">Vector</th>
            <th className="text-poster-text-sub">Metadata</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id} className="hover:bg-poster-surface/30">
              <td className="text-xs font-mono text-poster-text-main">{truncateText(r.id, 24)}</td>
              <td className="text-xs text-poster-text-sub">{r.textSnippet ?? '-'}</td>
              <td className="text-xs">
                {r.vectorDims > 0 ? (
                  <span className="badge badge-sm badge-success badge-outline">{r.vectorDims}d</span>
                ) : (
                  <span className="badge badge-sm badge-warning badge-outline">text only</span>
                )}
              </td>
              <td className="text-xs text-poster-text-sub">
                {r.metadataKeys.length > 0 ? r.metadataKeys.slice(0, 3).join(', ') : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Import statistics display */
function ImportStatsDisplay({ stats }: { stats: { imported: number; skipped: number; reEmbedded: number; totalParsed: number; format: string; dimensions: number; durationMs: number } }) {
  return (
    <div className="animate-fadeIn">
      <div className="flex items-center gap-2 mb-4">
        <CheckCircle2 className="w-5 h-5 text-success" />
        <h3 className="text-sm font-semibold text-poster-text-main">Import Complete</h3>
      </div>
      <div className="stats stats-horizontal bg-poster-surface/50 border border-poster-border/30 shadow-lg w-full">
        <StatsCard label="Imported" value={stats.imported} color="text-success" />
        <StatsCard label="Skipped" value={stats.skipped} color="text-warning" />
        <StatsCard label="Re-embedded" value={stats.reEmbedded} color="text-info" />
        <StatsCard label="Duration" value={formatDuration(stats.durationMs)} color="text-poster-accent-teal" />
      </div>
    </div>
  );
}

/** Main migrator view */
export function MigratorView() {
  const {
    fileName,
    reEmbedEnabled,
    previewRecords,
    parseResult,
    stats,
    progress,
    error,
    isImporting,
    isParsing,
    isExporting,
    hasDb,
    handleFileSelect,
    handleImport,
    handleReset,
    setReEmbedEnabled,
    exportCSV,
    exportJSONL,
    cancel,
  } = useMigrator();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasPreview = parseResult !== null;
  const isComplete = stats !== null;
  const isWorking = isImporting || isParsing || isExporting;

  const progressPercent = progress
    ? progress.overallTotal > 0 ? progress.overallCompleted / progress.overallTotal : 0
    : 0;

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
            <IconBox size="sm" variant="primary" className="bg-poster-accent-teal/10 text-poster-accent-teal ring-1 ring-poster-accent-teal/30">
              <ArrowRightLeft className="w-4 h-4" />
            </IconBox>
            <div>
              <h1 className="text-base font-semibold text-poster-text-main">Data Migrator</h1>
              <p className="text-xs text-poster-text-sub">Import & export vector database data</p>
            </div>
            {parseResult && (
              <FormatBadge format={parseResult.format} />
            )}
          </div>
          <div className="flex items-center gap-2">
            {hasDb && (
              <>
                <Button variant="ghost" size="sm" onClick={exportCSV} disabled={isWorking}>
                  <FileDown className="w-4 h-4 mr-1" />
                  CSV
                </Button>
                <Button variant="ghost" size="sm" onClick={exportJSONL} disabled={isWorking}>
                  <FileDown className="w-4 h-4 mr-1" />
                  JSONL
                </Button>
              </>
            )}
            {(hasPreview || isComplete) && (
              <Button variant="ghost" size="sm" onClick={handleReset} className="hover:text-error transition-colors duration-200">
                <Trash2 className="w-4 h-4 mr-1" />
                Reset
              </Button>
            )}
          </div>
        </div>

        {/* Gradient accent line */}
        <div className="h-px bg-gradient-to-r from-transparent via-poster-accent-teal/40 to-transparent" />

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-4xl mx-auto flex flex-col gap-6">
            {/* Error */}
            {error && <ErrorAlert message={error.message} onDismiss={handleReset} />}

            {/* Empty state */}
            {!hasPreview && !isComplete && !isParsing && (
              <EmptyState onFileSelect={handleFileSelect} />
            )}

            {/* Loading state */}
            {isParsing && (
              <div className="flex flex-col items-center justify-center py-16 animate-fadeIn">
                <Spinner size="lg" className="text-poster-accent-teal mb-4" />
                <p className="text-sm text-poster-text-sub">Parsing {fileName}...</p>
              </div>
            )}

            {/* Preview panel */}
            {hasPreview && !isComplete && (
              <div className="flex flex-col gap-6 animate-fadeIn">
                {/* File info bar */}
                <div className="flex items-center justify-between bg-poster-surface/50 rounded-xl p-4 border border-poster-border/30">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-poster-accent-teal" />
                    <div>
                      <p className="text-sm font-medium text-poster-text-main">{fileName}</p>
                      <p className="text-xs text-poster-text-sub">
                        {FORMAT_LABELS[parseResult.format] ?? parseResult.format}
                        <span className="text-poster-border mx-1.5">&middot;</span>
                        {parseResult.totalRecords} records
                        <span className="text-poster-border mx-1.5">&middot;</span>
                        {parseResult.recordsWithVectors} with vectors
                        {parseResult.recordsWithTextOnly > 0 && (
                          <>
                            <span className="text-poster-border mx-1.5">&middot;</span>
                            <span className="text-warning">{parseResult.recordsWithTextOnly} text-only</span>
                          </>
                        )}
                        {parseResult.dimensions && (
                          <>
                            <span className="text-poster-border mx-1.5">&middot;</span>
                            {parseResult.dimensions}d vectors
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  <FormatBadge format={parseResult.format} />
                </div>

                {/* Re-embedding toggle (shown when text-only records exist) */}
                {parseResult.recordsWithTextOnly > 0 && (
                  <div className="flex items-center justify-between bg-poster-surface/50 rounded-xl p-4 border border-poster-border/30">
                    <div>
                      <p className="text-sm font-medium text-poster-text-main">Re-embed text-only records</p>
                      <p className="text-xs text-poster-text-sub">
                        {parseResult.recordsWithTextOnly} records have text but no vectors.
                        Enable to re-embed with a local model ({EMBEDDING_MODEL_SIZE}).
                      </p>
                    </div>
                    <button
                      onClick={() => setReEmbedEnabled(!reEmbedEnabled)}
                      className="cursor-pointer"
                    >
                      {reEmbedEnabled ? (
                        <ToggleRight className="w-8 h-8 text-poster-accent-teal" />
                      ) : (
                        <ToggleLeft className="w-8 h-8 text-poster-text-sub" />
                      )}
                    </button>
                  </div>
                )}

                {/* Preview table */}
                <div>
                  <h3 className="text-sm font-semibold text-poster-text-main mb-2">
                    Preview (first {previewRecords.length} records)
                  </h3>
                  <PreviewTable records={previewRecords} />
                </div>

                {/* Import progress */}
                {isImporting && progress && (
                  <div className="flex flex-col gap-2 animate-fadeIn">
                    <ProgressBar
                      value={progressPercent}
                      label={PHASE_LABELS[progress.phase] ?? progress.phase}
                    />
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex items-center justify-end gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={SUPPORTED_EXTENSIONS.join(',')}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileSelect(file);
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isImporting}
                  >
                    <Upload className="w-4 h-4 mr-1" />
                    Change File
                  </Button>
                  {isImporting ? (
                    <Button variant="ghost" size="sm" onClick={cancel} className="hover:text-error">
                      <Square className="w-4 h-4 mr-1" />
                      Cancel
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleImport}
                      className="bg-poster-accent-teal hover:bg-poster-accent-teal/80 border-poster-accent-teal hover:border-poster-accent-teal/80 transition-all duration-300 hover:shadow-lg hover:shadow-poster-accent-teal/20 cursor-pointer"
                    >
                      <Play className="w-4 h-4 mr-1" />
                      Import {parseResult.totalRecords} Records
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Import complete */}
            <ErrorBoundary>
              {isComplete && stats && (
                <ImportStatsDisplay stats={stats} />
              )}
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  );
}
