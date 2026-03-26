/**
 * @file search-view.tsx
 * @description Main search view with note management, semantic search, VQ toggle, and drift detection
 */
'use client';

import { useState, useRef } from 'react';
import {
  Search,
  Plus,
  Trash2,
  BookOpen,
  Sparkles,
  Database,
  X,
  ArrowLeft,
  Settings,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Zap,
  HardDrive,
  Download,
  Upload,
  Gpu,
  FileText,
  Check,
  Scissors,
} from 'lucide-react';
import { Button, Spinner, Progress, Select, LatencyBadge } from './ui';
import { ErrorBoundary, ErrorAlert } from './error-boundary';
import { useSemanticSearch } from '../_hooks/use-semantic-search';
import { useImportExportNotes } from '../_hooks/use-import-export';
import {
  cn,
  formatScore,
  formatRelativeTime,
  getScoreColor,
  calculateRawStorageBytes,
  calculateQuantizedStorageBytes,
  calculatePQStorageBytes,
  formatBytes,
  getChunkColor,
  formatChunkBadge,
} from '../_lib/utils';
import { MODEL_OPTIONS, QUANTIZATION_OPTIONS, EXPORT_FORMAT_OPTIONS, ACCEPTED_IMPORT_TYPES, CHUNKING_MODE_OPTIONS } from '../_lib/constants';
import type { QuantizationType, ExportFormat, ChunkingMode } from '../_lib/types';

/** Main search view layout with all sections */
export function SearchView() {
  const {
    notes,
    searchQuery,
    searchResults,
    isAdding,
    isSearching,
    isLoadingSamples,
    error,
    quantizationType,
    gpuEnabled,
    searchLatency,
    selectedModelId,
    selectedModel,
    driftWarning,
    isReindexing,
    reindexProgress,
    chunkingMode,
    chunkStats,
    getChunksForNote,
    addNote,
    search,
    deleteNote,
    loadSamples,
    clearAllNotes,
    setSearchQuery,
    setSearchResults,
    clearError,
    handleQuantizationChange,
    handleChunkingModeChange,
    toggleGPU,
    handleModelChange,
    reindex,
    cancelReindex,
    exportNotes,
    importNotes,
    db,
    embeddingModel,
    syncImportedNotes,
  } = useSemanticSearch();

  // Import/Export hook (new: multi-format import with preview)
  const {
    importFile: importExternalFile,
    confirmImport,
    dismissPreview,
    exportCSV: exportCSVImportExport,
    exportJSONL: exportJSONLImportExport,
    cancel: cancelImport,
    reset: resetImportExport,
    isImporting: isImportingExternal,
    isParsing,
    isExporting: isExportingExternal,
    progress: importProgress,
    stats: importStats,
    parseResult: importPreview,
    error: importExportError,
    hasPreview,
    hasStats,
  } = useImportExportNotes({ db, model: embeddingModel });

  // Local UI state
  const [noteText, setNoteText] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('json');
  const importInputRef = useRef<HTMLInputElement>(null);
  const externalImportInputRef = useRef<HTMLInputElement>(null);

  /** Handle adding a new note */
  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    await addNote(noteText.trim());
    setNoteText('');
  };

  /** Handle search on Enter key */
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      search(searchQuery);
    }
  };

  /** Handle search input change */
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  // Derived state
  const hasNotes = notes.length > 0;
  const hasResults = searchResults.length > 0;
  const showResults = searchQuery.trim().length > 0 && hasResults;

  // Storage size calculations
  const rawBytes = calculateRawStorageBytes(notes.length, selectedModel.dimensions);
  const sq8Bytes = calculateQuantizedStorageBytes(notes.length, selectedModel.dimensions);
  const pqBytes = calculatePQStorageBytes(notes.length, selectedModel.dimensions);

  // Derived: operations in progress (disables controls)
  const isBusy = isReindexing || isAdding || isLoadingSamples || isImportingExternal;

  /** Handle import file selection (native VectorDB JSON format) */
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await importNotes(file);
      // Reset the input so the same file can be re-imported
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  /** Handle external import file selection (Pinecone, ChromaDB, CSV, JSONL) */
  const handleExternalImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await importExternalFile(file);
      // Reset the input so the same file can be re-imported
      if (externalImportInputRef.current) externalImportInputRef.current.value = '';
    }
  };

  /** Confirm external import and sync imported notes */
  const handleConfirmImport = async () => {
    if (!importPreview) return;
    const result = await confirmImport();
    if (result && result.imported > 0 && importPreview.records) {
      // Sync successfully imported records into the notes list
      syncImportedNotes(importPreview.records);
    }
  };

  /** Format duration in milliseconds to a human-readable string */
  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  /** Capitalize the first letter of a format name for display */
  const formatLabel = (format: string) => {
    return format.charAt(0).toUpperCase() + format.slice(1);
  };

  return (
    <div className="h-[calc(100vh-4rem)] bg-poster-bg text-poster-text-main font-sans selection:bg-poster-primary/30 relative overflow-hidden">
      {/* Background grid */}
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
              <div className="w-8 h-8 rounded-lg bg-poster-primary/15 flex items-center justify-center ring-1 ring-poster-primary/30">
                <Search className="w-4 h-4 text-poster-primary" />
              </div>
              <div>
                <h1 className="text-sm font-semibold text-poster-text-main leading-tight">Semantic Search</h1>
                <p className="text-[11px] text-poster-text-sub/60 leading-tight">Search by meaning, not keywords</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-md bg-poster-primary/10 text-[11px] font-medium text-poster-primary border border-poster-primary/20">
              {selectedModel.label} {selectedModel.dimensions}d
            </span>
            {gpuEnabled && (
              <span className="px-2.5 py-1 rounded-md bg-poster-accent-orange/10 text-[11px] font-medium text-poster-accent-orange border border-poster-accent-orange/20">
                <Gpu className="w-3 h-3 inline mr-0.5 -mt-px" />
                GPU
              </span>
            )}
            {quantizationType === 'scalar' && (
              <span className="px-2.5 py-1 rounded-md bg-poster-accent-teal/10 text-[11px] font-medium text-poster-accent-teal border border-poster-accent-teal/20">
                <Zap className="w-3 h-3 inline mr-0.5 -mt-px" />
                SQ8
              </span>
            )}
            {quantizationType === 'pq' && (
              <span className="px-2.5 py-1 rounded-md bg-poster-accent-purple/10 text-[11px] font-medium text-poster-accent-purple border border-poster-accent-purple/20">
                <Zap className="w-3 h-3 inline mr-0.5 -mt-px" />
                PQ
              </span>
            )}
            {chunkingMode !== 'off' && (
              <span className="px-2.5 py-1 rounded-md bg-poster-accent-pink/10 text-[11px] font-medium text-poster-accent-pink border border-poster-accent-pink/20">
                <Scissors className="w-3 h-3 inline mr-0.5 -mt-px" />
                {chunkingMode === 'recursive' ? 'Recursive' : 'Semantic'}
              </span>
            )}
            <span className="px-2.5 py-1 rounded-md bg-poster-surface text-[11px] font-medium text-poster-text-sub border border-poster-border/20">
              <Database className="w-3 h-3 inline mr-1 -mt-px" />
              {notes.length} notes
            </span>
            {hasNotes && (
              <>
                {/* Hidden file input for multi-format import */}
                <input
                  ref={externalImportInputRef}
                  type="file"
                  accept={ACCEPTED_IMPORT_TYPES}
                  className="hidden"
                  onChange={handleExternalImportFile}
                />
                {/* Import button */}
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => externalImportInputRef.current?.click()}
                  disabled={isBusy || isParsing}
                  loading={isParsing}
                >
                  <Upload className="w-3 h-3 mr-1" />
                  Import
                </Button>
                {/* Export dropdown */}
                <div className="dropdown dropdown-end">
                  <Button
                    variant="ghost"
                    size="xs"
                    tabIndex={0}
                    disabled={isBusy || isExportingExternal}
                    loading={isExportingExternal}
                  >
                    <Download className="w-3 h-3 mr-1" />
                    Export
                    <ChevronDown className="w-3 h-3 ml-0.5" />
                  </Button>
                  <ul tabIndex={0} className="dropdown-content z-50 menu menu-sm p-2 shadow-lg bg-poster-surface border border-poster-border/20 rounded-lg w-44">
                    <li>
                      <button onClick={exportCSVImportExport}>
                        <FileText className="w-3.5 h-3.5" />
                        Export as CSV
                      </button>
                    </li>
                    <li>
                      <button onClick={exportJSONLImportExport}>
                        <FileText className="w-3.5 h-3.5" />
                        Export as JSONL
                      </button>
                    </li>
                  </ul>
                </div>
                {/* Clear button */}
                <Button variant="ghost" size="xs" onClick={clearAllNotes}>
                  <Trash2 className="w-3 h-3 mr-1" />
                  Clear
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Error Alert */}
            {error && (
              <ErrorAlert
                message={error.message}
                onDismiss={clearError}
                onRetry={clearError}
              />
            )}

            {/* Import/Export Error Alert */}
            {importExportError && (
              <ErrorAlert
                message={importExportError.message}
                onDismiss={resetImportExport}
                onRetry={resetImportExport}
              />
            )}

            {/* Import Completion Stats Banner */}
            {hasStats && !isImportingExternal && importStats && (
              <div className="card bg-success/5 border border-success/20 shadow-sm animate-in fade-in duration-300">
                <div className="card-body p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium text-success">
                      <Check className="w-4 h-4" />
                      Import Complete
                    </div>
                    <button
                      className="text-poster-text-sub/30 hover:text-poster-text-main transition-colors p-1 rounded-lg hover:bg-poster-surface-lighter/50"
                      onClick={dismissPreview}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <span className="badge badge-success badge-sm font-medium">
                      {importStats.imported} imported
                    </span>
                    {importStats.skipped > 0 && (
                      <span className="badge badge-warning badge-sm font-medium">
                        {importStats.skipped} skipped
                      </span>
                    )}
                    {importStats.reEmbedded > 0 && (
                      <span className="badge badge-info badge-sm font-medium">
                        {importStats.reEmbedded} re-embedded
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-[11px] text-poster-text-sub/60">
                    <span>Source: {formatLabel(importStats.format)}</span>
                    <span className="text-poster-text-sub/20">|</span>
                    <span>Duration: {formatDuration(importStats.durationMs)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Import Progress Card */}
            {isImportingExternal && (
              <div className="card bg-poster-surface border border-poster-border/20 shadow-sm animate-in fade-in duration-300">
                <div className="card-body p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-poster-text-sub">
                    <Spinner size="sm" className="text-poster-primary" />
                    Importing...
                  </div>
                  <Progress
                    value={importProgress?.completed ?? 0}
                    max={importProgress?.total ?? 100}
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-poster-text-sub/70">
                      {importProgress?.phase
                        ? `${formatLabel(importProgress.phase)}... ${importProgress.completed} / ${importProgress.total}`
                        : 'Preparing...'}
                    </p>
                    <Button variant="ghost" size="xs" onClick={cancelImport}>
                      <X className="w-3 h-3 mr-1" />
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Import Preview Panel */}
            {hasPreview && !isImportingExternal && !hasStats && importPreview && (
              <div className="card bg-poster-surface border border-poster-primary/20 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="card-body p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-poster-text-main">
                    <FileText className="w-4 h-4 text-poster-primary" />
                    Import Preview
                  </div>

                  <div className="rounded-lg bg-black/20 border border-poster-border/10 p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2 text-[12px]">
                      <div className="space-y-0.5">
                        <p className="text-poster-text-sub/50">Format</p>
                        <p className="font-medium text-poster-text-main">
                          <span className="badge badge-primary badge-sm">{formatLabel(importPreview.format)}</span>
                        </p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-poster-text-sub/50">Total Records</p>
                        <p className="font-medium text-poster-text-main">{importPreview.totalRecords}</p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-poster-text-sub/50">With Vectors</p>
                        <p className="font-medium text-poster-text-main">{importPreview.recordsWithVectors}</p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-poster-text-sub/50">Text Only</p>
                        <p className="font-medium text-poster-text-main">{importPreview.recordsWithTextOnly}</p>
                      </div>
                      {importPreview.dimensions !== null && (
                        <div className="space-y-0.5">
                          <p className="text-poster-text-sub/50">Dimensions</p>
                          <p className="font-medium text-poster-text-main">{importPreview.dimensions}d</p>
                        </div>
                      )}
                    </div>

                    {/* Text-only notice */}
                    {importPreview.recordsWithTextOnly > 0 && (
                      <p className="text-[11px] text-poster-accent-teal/80 mt-1">
                        {importPreview.recordsWithTextOnly} text-only record{importPreview.recordsWithTextOnly !== 1 ? 's' : ''} will be embedded with the current model ({selectedModel.label}).
                      </p>
                    )}

                    {/* Dimension mismatch warning */}
                    {importPreview.dimensions !== null && importPreview.dimensions !== selectedModel.dimensions && (
                      <div className="flex items-start gap-1.5 mt-1 text-[11px] text-warning">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>
                          Dimension mismatch: file has {importPreview.dimensions}d vectors, current DB uses {selectedModel.dimensions}d. Records with mismatched dimensions will be skipped.
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 justify-end">
                    <Button variant="ghost" size="xs" onClick={dismissPreview}>
                      Cancel
                    </Button>
                    <Button variant="primary" size="xs" onClick={handleConfirmImport}>
                      <Check className="w-3 h-3 mr-1" />
                      Confirm Import
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Empty State */}
            {!hasNotes && (
              <div className="flex flex-col items-center pt-12 pb-8 animate-in fade-in duration-500">
                <div className="relative mb-6">
                  <div className="w-20 h-20 rounded-2xl bg-poster-primary/10 flex items-center justify-center ring-1 ring-poster-primary/20">
                    <Search className="w-10 h-10 text-poster-primary" />
                  </div>
                  <div className="absolute -top-1 -right-1 w-6 h-6 rounded-lg bg-poster-accent-orange/15 flex items-center justify-center ring-1 ring-poster-accent-orange/25">
                    <Sparkles className="w-3.5 h-3.5 text-poster-accent-orange" />
                  </div>
                </div>
                <h2 className="text-2xl font-bold text-poster-text-main mb-2">Semantic Search</h2>
                <p className="text-sm text-poster-text-sub/70 text-center max-w-md mb-6">
                  Build a knowledge base and search by meaning, not just keywords.
                  Powered by sentence embeddings.
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={loadSamples}
                  loading={isLoadingSamples}
                  className="gap-1.5"
                >
                  <BookOpen className="w-4 h-4" />
                  Load Sample Notes
                </Button>
              </div>
            )}

            {/* Search bar */}
            {hasNotes && (
              <ErrorBoundary>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                    {isSearching ? (
                      <Spinner size="sm" className="text-poster-primary" />
                    ) : (
                      <Search className="w-5 h-5 text-poster-text-sub/30 group-focus-within:text-poster-primary transition-colors" />
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="Search your notes by meaning..."
                    className={cn(
                      'input input-lg w-full pl-12 pr-28 shadow-sm',
                      'bg-poster-surface border-poster-border/20 text-poster-text-main',
                      'focus:border-poster-primary/50 focus:shadow-lg focus:shadow-poster-primary/5',
                      'placeholder:text-poster-text-sub/30 transition-all duration-200',
                      'rounded-xl text-[15px]'
                    )}
                    value={searchQuery}
                    onChange={handleSearchChange}
                    onKeyDown={handleSearchKeyDown}
                  />
                  <div className="absolute inset-y-0 right-4 flex items-center gap-2">
                    {searchQuery && (
                      <button
                        className="text-poster-text-sub/30 hover:text-poster-text-main transition-colors"
                        onClick={() => {
                          setSearchQuery('');
                          setSearchResults([]);
                          search('');
                        }}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    <Button
                      variant="primary"
                      size="xs"
                      onClick={() => search(searchQuery)}
                      disabled={!searchQuery.trim() || isSearching}
                      loading={isSearching}
                    >
                      <Search className="w-3 h-3 mr-1" />
                      Search
                    </Button>
                  </div>
                </div>
              </ErrorBoundary>
            )}

            {/* Settings Panel */}
            {hasNotes && (
              <ErrorBoundary>
                <div className="card bg-poster-surface border border-poster-border/20 shadow-sm">
                  {/* Settings header (toggle) */}
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-poster-text-sub hover:text-poster-text-main transition-colors"
                    onClick={() => setSettingsOpen(!settingsOpen)}
                  >
                    <div className="flex items-center gap-2">
                      <Settings className="w-4 h-4" />
                      Settings
                    </div>
                    {settingsOpen ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>

                  {/* Settings content */}
                  {settingsOpen && (
                    <div className="px-4 pb-4 space-y-4 border-t border-poster-border/10 pt-4">
                      {/* Model picker */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-poster-text-sub" htmlFor="model-select">
                          Embedding Model
                        </label>
                        <select
                          id="model-select"
                          className="select select-bordered select-sm w-full bg-black/20 border-poster-border/20 text-poster-text-main"
                          value={selectedModelId}
                          onChange={(e) => handleModelChange(e.target.value)}
                          disabled={isBusy}
                        >
                          {MODEL_OPTIONS.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.label} ({opt.dimensions}d, {opt.size})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* GPU toggle */}
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-poster-text-sub">
                            <Gpu className="w-3.5 h-3.5" />
                            WebGPU Acceleration
                          </div>
                          <p className="text-[11px] text-poster-text-sub/50">
                            GPU-accelerated vector search (falls back to CPU)
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          className="toggle toggle-primary toggle-sm"
                          checked={gpuEnabled}
                          onChange={toggleGPU}
                          disabled={isBusy}
                        />
                      </div>

                      {/* Quantization picker */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-poster-text-sub flex items-center gap-1.5" htmlFor="quantization-select">
                          <Zap className="w-3.5 h-3.5" />
                          Vector Quantization
                        </label>
                        <Select
                          id="quantization-select"
                          options={QUANTIZATION_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
                          value={quantizationType}
                          onChange={(e) => handleQuantizationChange(e.target.value as QuantizationType)}
                          disabled={isBusy}
                        />
                        <p className="text-[11px] text-poster-text-sub/50">
                          {QUANTIZATION_OPTIONS.find((o) => o.value === quantizationType)?.description}
                        </p>
                      </div>

                      {/* Chunking mode picker */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-poster-text-sub flex items-center gap-1.5" htmlFor="chunking-select">
                          <Scissors className="w-3.5 h-3.5" />
                          Chunking Mode
                        </label>
                        <Select
                          id="chunking-select"
                          options={CHUNKING_MODE_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
                          value={chunkingMode}
                          onChange={(e) => handleChunkingModeChange(e.target.value as ChunkingMode)}
                          disabled={isBusy}
                        />
                        <p className="text-[11px] text-poster-text-sub/50">
                          {CHUNKING_MODE_OPTIONS.find((o) => o.value === chunkingMode)?.description}
                        </p>
                      </div>

                      {/* Chunk statistics card (only visible when chunking is active and notes exist) */}
                      {chunkingMode !== 'off' && chunkStats && (
                        <div className="rounded-lg bg-black/20 border border-poster-border/10 p-3 space-y-1">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-poster-text-sub">
                            <Scissors className="w-3.5 h-3.5" />
                            Chunk Statistics
                          </div>
                          <div className="text-[11px] text-poster-text-sub/70 space-y-0.5">
                            <p>Total chunks: <span className="text-poster-text-main font-medium">{chunkStats.totalChunks}</span></p>
                            <p>Avg chunk size: <span className="text-poster-text-main font-medium">{chunkStats.avgChunkSize} chars</span></p>
                            <p>Avg chunks/note: <span className="text-poster-text-main font-medium">{chunkStats.avgChunksPerNote}</span></p>
                          </div>
                        </div>
                      )}

                      {/* Storage stats */}
                      <div className="rounded-lg bg-black/20 border border-poster-border/10 p-3 space-y-1">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-poster-text-sub">
                          <HardDrive className="w-3.5 h-3.5" />
                          Storage Estimate
                        </div>
                        {notes.length > 0 ? (
                          <div className="text-[11px] text-poster-text-sub/70 space-y-0.5">
                            <p>
                              {notes.length} vector{notes.length !== 1 ? 's' : ''} x {selectedModel.dimensions}d
                            </p>
                            <div className="space-y-0.5">
                              <p>
                                <span className={quantizationType === 'none' ? 'text-poster-primary font-medium' : ''}>
                                  Raw: {formatBytes(rawBytes)}
                                </span>
                              </p>
                              <p>
                                <span className={quantizationType === 'scalar' ? 'text-poster-accent-teal font-medium' : ''}>
                                  SQ8: {formatBytes(sq8Bytes)}
                                </span>
                                {quantizationType === 'scalar' && (
                                  <span className="text-poster-accent-teal ml-1">
                                    (saving {formatBytes(rawBytes - sq8Bytes)})
                                  </span>
                                )}
                              </p>
                              <p>
                                <span className={quantizationType === 'pq' ? 'text-poster-accent-purple font-medium' : ''}>
                                  PQ: {formatBytes(pqBytes)}
                                </span>
                                {quantizationType === 'pq' && (
                                  <span className="text-poster-accent-purple ml-1">
                                    (saving {formatBytes(rawBytes - pqBytes)})
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[11px] text-poster-text-sub/50">0 vectors, 0 B</p>
                        )}
                      </div>

                      {/* Import / Export section */}
                      <div className="rounded-lg bg-black/20 border border-poster-border/10 p-3 space-y-2.5">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-poster-text-sub">
                          <Database className="w-3.5 h-3.5" />
                          Data Import / Export
                        </div>
                        <div className="flex items-center gap-2">
                          <Select
                            options={EXPORT_FORMAT_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
                            value={exportFormat}
                            onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
                            className="flex-1"
                          />
                          <Button
                            variant="primary"
                            size="xs"
                            onClick={() => exportNotes(exportFormat)}
                            disabled={!hasNotes}
                          >
                            <Download className="w-3 h-3 mr-1" />
                            Export
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            ref={importInputRef}
                            type="file"
                            accept=".json"
                            className="hidden"
                            onChange={handleImportFile}
                          />
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => importInputRef.current?.click()}
                            disabled={isBusy}
                          >
                            <Upload className="w-3 h-3 mr-1" />
                            Import JSON
                          </Button>
                          <span className="text-[11px] text-poster-text-sub/40">
                            Native VectorDB format (.json)
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Drift Warning Banner */}
                  {driftWarning && (
                    <div className="mx-4 mb-4 rounded-lg bg-warning/10 border border-warning/30 p-3 space-y-3">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                        <div className="space-y-1 flex-1 min-w-0">
                          <p className="text-xs font-medium text-warning">
                            Embedding Model Drift Detected
                          </p>
                          <p className="text-[11px] text-poster-text-sub/70">
                            Vectors were embedded with <span className="font-medium text-poster-text-main">{driftWarning.storedModelId}</span>.
                            Current model is <span className="font-medium text-poster-text-main">{driftWarning.currentModelId}</span>.
                            Search quality may be degraded.
                          </p>
                        </div>
                      </div>

                      {/* Reindex progress bar */}
                      {isReindexing && reindexProgress && (
                        <div className="space-y-1.5">
                          <Progress
                            value={reindexProgress.completed}
                            max={reindexProgress.total}
                          />
                          <p className="text-[11px] text-poster-text-sub/70">
                            {reindexProgress.phase === 'indexing'
                              ? 'Rebuilding index...'
                              : `${reindexProgress.completed} of ${reindexProgress.total} documents`}
                          </p>
                        </div>
                      )}

                      {/* Reindex actions */}
                      <div className="flex items-center gap-2">
                        {isReindexing ? (
                          <Button variant="ghost" size="xs" onClick={cancelReindex}>
                            <X className="w-3 h-3 mr-1" />
                            Cancel
                          </Button>
                        ) : (
                          <Button
                            variant="primary"
                            size="xs"
                            onClick={reindex}
                            loading={isReindexing}
                          >
                            <RefreshCw className="w-3 h-3 mr-1" />
                            Re-embed All Documents
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </ErrorBoundary>
            )}

            {/* Search Results */}
            {showResults && (
              <ErrorBoundary>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-poster-text-sub">
                    <Sparkles className="w-4 h-4 text-poster-accent-orange" />
                    {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found
                    {searchLatency && (
                      <>
                        <span className="text-poster-text-sub/30">--</span>
                        <LatencyBadge latency={searchLatency} />
                      </>
                    )}
                  </div>
                  {searchResults.map((result, index) => (
                    <div
                      key={`${result.note.id}-${result.chunkIndex ?? 'full'}-${index}`}
                      className={cn(
                        'card bg-poster-surface border border-poster-border/20 shadow-sm',
                        'hover:border-poster-primary/25 hover:shadow-md transition-all duration-200',
                        'animate-in fade-in slide-in-from-bottom-2'
                      )}
                      style={{ animationDelay: `${index * 60}ms`, animationFillMode: 'both' }}
                    >
                      <div className="card-body p-4 flex-row items-start gap-4">
                        <div className="flex-1 min-w-0">
                          {/* Show chunk text when chunking is active, otherwise full note text */}
                          <p className="text-sm text-poster-text-main leading-relaxed">
                            {result.chunkText ?? result.note.text}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <p className="text-[11px] text-poster-text-sub/40">
                              {formatRelativeTime(result.note.createdAt)}
                            </p>
                            {/* Chunk position badge */}
                            {result.totalChunks != null && result.chunkIndex != null && (
                              <span className="badge badge-xs badge-ghost text-poster-accent-pink font-medium">
                                Chunk {result.chunkIndex + 1} of {result.totalChunks}
                              </span>
                            )}
                          </div>
                        </div>
                        <div
                          className={cn(
                            'badge badge-sm shrink-0 font-semibold',
                            result.score >= 0.8
                              ? 'badge-success'
                              : result.score >= 0.6
                                ? 'badge-warning'
                                : 'badge-ghost text-poster-accent-orange'
                          )}
                        >
                          {formatScore(result.score)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ErrorBoundary>
            )}

            {/* No results message */}
            {searchQuery.trim().length > 0 && !hasResults && !isSearching && (
              <div className="text-center py-10 text-poster-text-sub/40 text-sm">
                No results found. Press Enter to search.
              </div>
            )}

            {/* Add Note Section */}
            {hasNotes && (
              <ErrorBoundary>
                <div className="card bg-poster-surface border border-poster-border/20 shadow-sm">
                  <div className="card-body p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-poster-text-sub">
                      <Plus className="w-4 h-4" />
                      Add Note
                    </div>
                    <textarea
                      className={cn(
                        'textarea textarea-bordered w-full bg-black/20',
                        'border-poster-border/20 text-poster-text-main',
                        'focus:border-poster-primary/50 placeholder:text-poster-text-sub/30',
                        'min-h-[80px] resize-none'
                      )}
                      placeholder="Type a note to add to the knowledge base..."
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleAddNote();
                        }
                      }}
                    />
                    <div className="flex items-center gap-2 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={loadSamples}
                        loading={isLoadingSamples}
                        disabled={isLoadingSamples || isAdding}
                      >
                        <BookOpen className="w-4 h-4 mr-1" />
                        Load Sample Notes
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleAddNote}
                        loading={isAdding}
                        disabled={!noteText.trim() || isAdding}
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Add Note
                      </Button>
                    </div>
                  </div>
                </div>
              </ErrorBoundary>
            )}

            {/* Notes grid */}
            {hasNotes && (
              <ErrorBoundary>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-poster-text-sub">
                    <Database className="w-4 h-4" />
                    All Notes ({notes.length})
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {notes.map((note, index) => {
                      const chunks = chunkingMode !== 'off' ? getChunksForNote(note.id) : [];
                      const hasChunks = chunks.length > 1;

                      return (
                        <div
                          key={note.id}
                          className={cn(
                            'card bg-poster-surface border border-poster-border/20 shadow-sm group',
                            'hover:border-poster-primary/20 hover:shadow-md transition-all duration-200',
                            'animate-in fade-in'
                          )}
                          style={{ animationDelay: `${index * 30}ms`, animationFillMode: 'both' }}
                        >
                          <div className="card-body p-4">
                            <div className="flex items-start gap-3">
                              <div className="flex-1 min-w-0">
                                {/* Chunk boundary visualization when chunking is active */}
                                {hasChunks ? (
                                  <div className="space-y-1">
                                    {chunks.map((chunk, ci) => (
                                      <div key={ci}>
                                        <div
                                          className={cn(
                                            'rounded px-2 py-1.5 text-sm text-poster-text-main leading-relaxed',
                                            getChunkColor(ci)
                                          )}
                                        >
                                          <span className="badge badge-xs badge-ghost font-mono text-[10px] mr-1.5 align-top">
                                            {formatChunkBadge(ci)}
                                          </span>
                                          {chunk.text}
                                        </div>
                                        {/* Semantic boundary similarity score between chunks */}
                                        {chunkingMode === 'semantic' && ci < chunks.length - 1 && chunk.rightSimilarity != null && (
                                          <div className="flex items-center justify-center py-0.5">
                                            <span className="text-[10px] text-poster-text-sub/40 font-mono tabular-nums">
                                              sim: {chunk.rightSimilarity.toFixed(2)}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-sm text-poster-text-main leading-relaxed line-clamp-4">
                                    {note.text}
                                  </p>
                                )}
                                <p className="text-[11px] text-poster-text-sub/40 mt-2">
                                  {formatRelativeTime(note.createdAt)}
                                  {hasChunks && (
                                    <span className="ml-2 text-poster-accent-pink/60">
                                      {chunks.length} chunks
                                    </span>
                                  )}
                                </p>
                              </div>
                              <button
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-poster-text-sub/30 hover:text-error shrink-0 p-1 rounded-lg hover:bg-error/10"
                                onClick={() => deleteNote(note.id)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </ErrorBoundary>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
