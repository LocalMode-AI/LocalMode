/**
 * @file meeting-view.tsx
 * @description Main view for the meeting assistant application with audio upload, transcription,
 * summarization, and action item extraction
 */
'use client';

import { useRef } from 'react';
import Link from 'next/link';
import {
  Users,
  Upload,
  ArrowLeft,
  FileText,
  ListChecks,
  Sparkles,
  Download,
  RotateCcw,
  Square,
  Check,
  AudioLines,
} from 'lucide-react';
import { Button, IconBox, StatusDot } from './ui';
import { ErrorBoundary, ErrorAlert } from './error-boundary';
import { useMeeting, type ActiveTab } from '../_hooks/use-meeting';
import { cn, countWords } from '../_lib/utils';
import { WHISPER_MODEL_SIZE, SUMMARIZER_MODEL_SIZE, ACCEPTED_EXTENSIONS } from '../_lib/constants';

/** Priority badge color mappings */
const PRIORITY_COLORS = {
  high: 'badge-error',
  medium: 'badge-warning',
  low: 'badge-info',
} as const;

/** Tab configuration for the results view */
const TABS: { key: ActiveTab; label: string; icon: typeof FileText }[] = [
  { key: 'transcript', label: 'Transcript', icon: FileText },
  { key: 'summary', label: 'Summary', icon: Sparkles },
  { key: 'actions', label: 'Actions', icon: ListChecks },
];

/** File upload drop zone component */
function UploadZone({ onFileSelect }: { onFileSelect: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) onFileSelect(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelect(file);
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onClick={handleClick}
      className="group cursor-pointer rounded-2xl border-2 border-dashed border-poster-border/30 hover:border-poster-accent-orange/40 bg-poster-surface/30 hover:bg-poster-surface/50 transition-all duration-300 p-12 flex flex-col items-center justify-center text-center"
    >
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        onChange={handleChange}
        className="hidden"
      />

      {/* Upload icon with glow */}
      <div className="relative mb-6">
        <div className="absolute inset-0 bg-poster-accent-orange/10 rounded-full blur-2xl scale-150" />
        <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-poster-accent-orange/20 to-poster-accent-orange/5 border border-poster-accent-orange/20 flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
          <Upload className="w-7 h-7 text-poster-accent-orange" />
        </div>
      </div>

      <h3 className="text-lg font-semibold text-poster-text-main mb-2">
        Upload Meeting Audio
      </h3>
      <p className="text-sm text-poster-text-sub mb-3">
        Drag & drop or click to select an audio file
      </p>
      <span className="text-xs text-poster-text-sub/60">
        Supported formats: {ACCEPTED_EXTENSIONS}
      </span>
    </div>
  );
}

/** Processing state view with waveform animation */
function ProcessingState({
  isTranscribing,
  isSummarizing,
  onCancel,
}: {
  isTranscribing: boolean;
  isSummarizing: boolean;
  onCancel: () => void;
}) {
  const label = isTranscribing ? 'Transcribing audio...' : 'Summarizing transcript...';

  return (
    <div className="flex flex-col items-center py-16 animate-fadeIn">
      {/* Waveform animation */}
      <div className="flex items-end gap-1 h-12 mb-6">
        {[40, 70, 100, 80, 50, 90, 60].map((height, i) => (
          <span
            key={i}
            className="w-1.5 bg-poster-accent-orange rounded-full animate-[waveform_0.8s_ease-in-out_infinite]"
            style={{ height: `${height}%`, animationDelay: `${i * 100}ms` }}
          />
        ))}
      </div>

      <div className="flex items-center gap-2 mb-2">
        <StatusDot color="orange" pulse />
        <span className="text-sm font-medium text-poster-accent-orange">{label}</span>
      </div>

      {/* Progress steps */}
      <div className="flex items-center gap-6 mt-4 mb-6">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
              isTranscribing
                ? 'bg-poster-accent-orange text-white'
                : 'bg-poster-accent-orange/20 text-poster-accent-orange'
            )}
          >
            {!isTranscribing ? <Check className="w-3.5 h-3.5" /> : '1'}
          </div>
          <span className="text-xs text-poster-text-sub">Transcribe</span>
        </div>
        <div className="w-8 h-px bg-poster-border/30" />
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
              isSummarizing
                ? 'bg-poster-accent-orange text-white'
                : !isTranscribing && !isSummarizing
                  ? 'bg-poster-accent-orange/20 text-poster-accent-orange'
                  : 'bg-poster-surface-lighter text-poster-text-sub'
            )}
          >
            {!isTranscribing && !isSummarizing ? <Check className="w-3.5 h-3.5" /> : '2'}
          </div>
          <span className="text-xs text-poster-text-sub">Summarize</span>
        </div>
        <div className="w-8 h-px bg-poster-border/30" />
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-poster-surface-lighter flex items-center justify-center text-xs font-bold text-poster-text-sub">
            3
          </div>
          <span className="text-xs text-poster-text-sub">Extract</span>
        </div>
      </div>

      <button
        onClick={onCancel}
        className="text-xs text-poster-text-sub hover:text-poster-text-main underline underline-offset-2 transition-colors duration-200"
      >
        Cancel
      </button>
    </div>
  );
}

/** Results tabbed view for transcript, summary, and action items */
function ResultsView({
  transcript,
  summary,
  actionItems,
  activeTab,
  audioUrl,
  setActiveTab,
  toggleActionItem,
}: {
  transcript: string;
  summary: string;
  actionItems: { id: string; text: string; completed: boolean; priority: 'high' | 'medium' | 'low' }[];
  activeTab: ActiveTab;
  audioUrl: string | null;
  setActiveTab: (tab: ActiveTab) => void;
  toggleActionItem: (id: string) => void;
}) {
  const completedCount = actionItems.filter((item) => item.completed).length;

  return (
    <div className="flex flex-col gap-4 animate-fadeIn">
      {/* Audio player */}
      {audioUrl && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-poster-surface/60 border border-poster-border/20">
          <AudioLines className="w-4 h-4 text-poster-text-sub shrink-0" />
          <audio
            controls
            src={audioUrl}
            className="w-full h-8 opacity-70 hover:opacity-100 transition-opacity duration-200"
            preload="metadata"
          />
        </div>
      )}

      {/* Tabs */}
      <div className="tabs tabs-boxed bg-poster-surface/50 border border-poster-border/20 p-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              className={cn(
                'tab tab-sm gap-1.5 transition-all flex-1',
                isActive
                  ? 'tab-active !bg-poster-accent-orange text-white'
                  : 'text-poster-text-sub hover:text-poster-text-main'
              )}
              onClick={() => setActiveTab(tab.key)}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
              {tab.key === 'actions' && actionItems.length > 0 && (
                <span
                  className={cn(
                    'badge badge-xs ml-1',
                    isActive
                      ? 'bg-white/20 text-white border-none'
                      : 'bg-poster-accent-orange/10 text-poster-accent-orange border-poster-accent-orange/20'
                  )}
                >
                  {actionItems.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="rounded-2xl bg-poster-surface/60 border border-poster-border/20 overflow-hidden">
        {/* Transcript tab */}
        {activeTab === 'transcript' && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-poster-text-sub">
                  Transcript
                </span>
                <span className="badge badge-sm bg-poster-surface-lighter/60 border-poster-border/20 text-poster-text-sub text-[11px]">
                  {countWords(transcript)} words
                </span>
              </div>
            </div>
            <p className="text-sm text-poster-text-main leading-relaxed whitespace-pre-wrap">
              {transcript}
            </p>
          </div>
        )}

        {/* Summary tab */}
        {activeTab === 'summary' && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-poster-text-sub">
                  Summary
                </span>
                {summary && (
                  <span className="badge badge-sm bg-poster-accent-orange/10 text-poster-accent-orange border-poster-accent-orange/20 text-[11px]">
                    {countWords(summary)} words
                  </span>
                )}
              </div>
            </div>
            {summary ? (
              <p className="text-base leading-[1.8] text-poster-text-main font-serif tracking-wide">
                {summary}
              </p>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-10 h-10 rounded-xl bg-poster-accent-orange/10 flex items-center justify-center mb-3">
                  <Sparkles className="w-5 h-5 text-poster-accent-orange/40" />
                </div>
                <p className="text-sm text-poster-text-sub/40 italic">
                  No summary available for this meeting
                </p>
              </div>
            )}
          </div>
        )}

        {/* Actions tab */}
        {activeTab === 'actions' && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-poster-text-sub">
                  Action Items
                </span>
                {actionItems.length > 0 && (
                  <span className="badge badge-sm bg-poster-accent-orange/10 text-poster-accent-orange border-poster-accent-orange/20 text-[11px]">
                    {completedCount}/{actionItems.length} done
                  </span>
                )}
              </div>
            </div>

            {actionItems.length > 0 ? (
              <div className="space-y-2">
                {actionItems.map((item) => (
                  <label
                    key={item.id}
                    className={cn(
                      'flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200',
                      'hover:bg-poster-surface-lighter/30',
                      item.completed && 'opacity-50'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={item.completed}
                      onChange={() => toggleActionItem(item.id)}
                      className="checkbox checkbox-sm checkbox-primary mt-0.5 border-poster-border/40"
                    />
                    <div className="flex-1 min-w-0">
                      <span
                        className={cn(
                          'text-sm text-poster-text-main',
                          item.completed && 'line-through'
                        )}
                      >
                        {item.text}
                      </span>
                    </div>
                    <span
                      className={cn(
                        'badge badge-xs shrink-0',
                        PRIORITY_COLORS[item.priority]
                      )}
                    >
                      {item.priority}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-10 h-10 rounded-xl bg-poster-accent-orange/10 flex items-center justify-center mb-3">
                  <ListChecks className="w-5 h-5 text-poster-accent-orange/40" />
                </div>
                <p className="text-sm text-poster-text-sub/40 italic">
                  No action items detected in this meeting
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Empty state shown before any audio is uploaded */
function EmptyState() {
  return (
    <div className="flex flex-col items-center py-16 animate-fadeIn">
      {/* Concentric rings icon */}
      <div className="relative mb-8">
        <div className="absolute inset-0 bg-poster-accent-orange/10 rounded-full blur-2xl scale-150" />
        <div className="relative w-20 h-20 rounded-full bg-poster-surface border border-poster-border/20 flex items-center justify-center">
          <div className="absolute w-28 h-28 rounded-full border border-poster-accent-orange/10" />
          <div className="absolute w-36 h-36 rounded-full border border-poster-accent-orange/5" />
          <Users className="w-8 h-8 text-poster-accent-orange/60" />
        </div>
      </div>
      <h3 className="text-lg font-semibold text-poster-text-main mb-2">Meeting Assistant</h3>
      <p className="text-sm text-poster-text-sub text-center max-w-xs">
        Upload meeting audio to transcribe, summarize, and extract action items. All processing happens on-device.
      </p>
    </div>
  );
}

/** Main meeting assistant view */
export function MeetingView() {
  const {
    transcript,
    summary,
    actionItems,
    isTranscribing,
    isSummarizing,
    activeTab,
    audioUrl,
    error,
    processMeeting,
    cancelProcessing,
    exportTranscript,
    setActiveTab,
    toggleActionItem,
    clearError,
    reset,
  } = useMeeting();

  const isProcessing = isTranscribing || isSummarizing;
  const hasResults = transcript.length > 0 && !isProcessing;

  /** Handle file selection from upload zone */
  const handleFileSelect = (file: File) => {
    processMeeting(file);
  };

  /** Start a new meeting by resetting state */
  const handleNewMeeting = () => {
    // Revoke existing audio URL to free memory
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    reset();
  };

  return (
    <div className="h-[calc(100vh-4rem)] bg-poster-bg text-poster-text-main font-sans selection:bg-poster-primary/30 relative overflow-hidden">
      {/* Background grid */}
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
            <IconBox
              size="sm"
              variant="primary"
              className="bg-poster-accent-orange/10 text-poster-accent-orange ring-1 ring-poster-accent-orange/30"
            >
              <Users className="w-4 h-4" />
            </IconBox>
            <div>
              <h1 className="text-base font-semibold text-poster-text-main">Meeting Assistant</h1>
              <p className="text-xs text-poster-text-sub">Transcribe & Summarize</p>
            </div>
            <span className="badge badge-sm bg-poster-surface-lighter border-poster-border/30 text-poster-text-sub ml-2 gap-1.5">
              Whisper {WHISPER_MODEL_SIZE}
              <span className="text-poster-accent-orange">&middot;</span>
              BART {SUMMARIZER_MODEL_SIZE}
            </span>
          </div>

          {/* Action bar for results */}
          {hasResults && (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={exportTranscript}>
                <Download className="w-4 h-4 mr-1" />
                Export
              </Button>
              <Button variant="ghost" size="sm" onClick={handleNewMeeting}>
                <RotateCcw className="w-4 h-4 mr-1" />
                New Meeting
              </Button>
            </div>
          )}

          {/* Cancel button during processing */}
          {isProcessing && (
            <Button variant="ghost" size="sm" onClick={cancelProcessing}>
              <Square className="w-4 h-4 mr-1" />
              Cancel
            </Button>
          )}
        </div>

        {/* Gradient accent line under header */}
        <div className="h-px bg-gradient-to-r from-transparent via-poster-accent-orange/40 to-transparent" />

        {/* Error alert */}
        {error && (
          <div className="px-6 pt-4">
            <ErrorAlert
              message={error.message}
              onDismiss={() => clearError()}
            />
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-2xl mx-auto">
            <ErrorBoundary>
              {/* Processing state */}
              {isProcessing && (
                <ProcessingState
                  isTranscribing={isTranscribing}
                  isSummarizing={isSummarizing}
                  onCancel={cancelProcessing}
                />
              )}

              {/* Results view */}
              {hasResults && (
                <ResultsView
                  transcript={transcript}
                  summary={summary}
                  actionItems={actionItems}
                  activeTab={activeTab}
                  audioUrl={audioUrl}
                  setActiveTab={setActiveTab}
                  toggleActionItem={toggleActionItem}
                />
              )}

              {/* Upload zone (shown when no results and not processing) */}
              {!hasResults && !isProcessing && (
                <>
                  <div className="mb-8">
                    <UploadZone onFileSelect={handleFileSelect} />
                  </div>
                  <EmptyState />
                </>
              )}
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  );
}
