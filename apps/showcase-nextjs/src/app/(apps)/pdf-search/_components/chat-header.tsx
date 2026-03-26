/**
 * @file chat-header.tsx
 * @description Header component for the PDF search view with controls
 */
'use client';

import { useState, useEffect, useRef } from 'react';
import { FileText, Trash2, PanelLeftClose, PanelLeft, Settings, Zap, Target, Loader2 } from 'lucide-react';
import { Button, IconBox, StatusDot, Badge } from './ui';
import { useChatStore } from '../_store/chat.store';
import { useUIStore } from '../_store/ui.store';
import { usePDFStore } from '../_store/pdf.store';
import { SEARCH_CONFIG, CHUNKING_STRATEGIES } from '../_lib/constants';
import { formatThreshold } from '../_lib/utils';
import { calibrateSearchThreshold } from '../_services/pdf.service';
import { isWebGPUSupported } from '@localmode/core';
import type { QueueStats } from '@localmode/core';
import type { ChunkingStrategy } from '../_lib/types';

/** Props for the ChatHeader component */
interface ChatHeaderProps {
  /** Live queue statistics for display */
  queueStats?: QueueStats;
}

/** Header component for the PDF chat view */
export function ChatHeader({ queueStats }: ChatHeaderProps) {
  // Detect WebGPU support for GPU badge
  const [gpuAvailable, setGpuAvailable] = useState(false);
  useEffect(() => {
    isWebGPUSupported().then(setGpuAvailable);
  }, []);

  // Get state from stores
  const { clearMessages, isSearching } = useChatStore();
  const {
    isSidebarOpen,
    toggleSidebar,
    topK,
    setTopK,
    useReranking,
    setUseReranking,
    modelsReady,
    chunkingStrategy,
    setChunkingStrategy,
    threshold,
    setThreshold,
    isCalibrating,
    setCalibrating,
  } = useUIStore();
  const { documents } = usePDFStore();

  // AbortController for calibration cancellation
  const calibrationAbortRef = useRef<AbortController | null>(null);

  return (
    <header className="h-16 min-h-16 border-b border-poster-border/30 flex items-center justify-between px-4 bg-poster-surface/80 backdrop-blur-md sticky top-0 z-40">
      {/* Left section */}
      <div className="flex items-center gap-3">
        {/* Sidebar toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleSidebar}
          className="text-poster-text-sub hover:text-poster-text-main"
        >
          {isSidebarOpen ? (
            <PanelLeftClose className="w-5 h-5" />
          ) : (
            <PanelLeft className="w-5 h-5" />
          )}
        </Button>

        {/* Title and info */}
        <div className="flex items-center gap-3">
          <IconBox size="sm" variant="primary">
            <FileText className="w-4 h-4" />
          </IconBox>
          <div>
            <h1 className="font-bold text-sm leading-tight text-poster-text-main">PDF Search</h1>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-poster-text-sub/80">
                {documents.length} document{documents.length !== 1 ? 's' : ''}
              </span>
              {gpuAvailable && (
                <Badge variant="neutral" size="sm" className="bg-poster-accent-teal/10 text-poster-accent-teal text-[9px]">
                  <Zap className="w-2.5 h-2.5 mr-0.5" />
                  GPU
                </Badge>
              )}
              {documents.length > 0 && (
                <Badge
                  variant="neutral"
                  size="sm"
                  className={`text-[9px] ${
                    threshold.source === 'calibrated'
                      ? 'bg-poster-accent-purple/10 text-poster-accent-purple'
                      : 'bg-white/10 text-poster-text-sub'
                  }`}
                >
                  <Target className="w-2.5 h-2.5 mr-0.5" />
                  {formatThreshold(threshold.value)} {threshold.source === 'calibrated' ? 'cal' : 'preset'}
                </Badge>
              )}
              {isSearching && <StatusDot color="teal" />}
              {queueStats && queueStats.pending > 0 && (
                <Badge variant="neutral" size="sm" className="bg-poster-accent-teal/10 text-poster-accent-teal text-[9px]">
                  {queueStats.pending} queued
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2">
        {/* Settings dropdown */}
        <div className="dropdown dropdown-end">
          <label
            tabIndex={0}
            className="btn btn-ghost btn-sm btn-square text-poster-text-sub hover:text-poster-text-main hover:bg-white/5"
          >
            <Settings className="w-5 h-5" />
          </label>
          <div
            tabIndex={0}
            className="dropdown-content menu p-4 shadow-xl bg-poster-surface rounded-box w-72 z-50 border border-poster-border/30 mt-2 backdrop-blur-md"
          >
            <div className="text-xs font-bold text-poster-text-sub/50 uppercase tracking-wider mb-3">
              Search Settings
            </div>

            {/* Top K slider */}
            <div className="form-control mb-4">
              <label className="label cursor-pointer justify-between py-1">
                <span className="label-text font-medium text-poster-text-main">Results (k)</span>
                <Badge variant="neutral" size="sm" className="bg-white/10 text-poster-text-sub">
                  {topK}
                </Badge>
              </label>
              <input
                type="range"
                min="1"
                max={SEARCH_CONFIG.maxTopK}
                value={topK}
                onChange={(e) => setTopK(Number(e.target.value))}
                className="range range-xs range-primary mt-2"
              />
            </div>

            {/* Reranking toggle */}
            <div className="form-control mb-4">
              <label className="label cursor-pointer justify-between py-1 hover:bg-white/5 rounded-lg -mx-2 px-2 transition-colors">
                <div className="flex flex-col">
                  <span className="label-text font-medium text-poster-text-main">Reranking</span>
                  <span className="text-xs text-poster-text-sub/50">Improve accuracy</span>
                </div>
                <input
                  type="checkbox"
                  className="toggle toggle-primary toggle-sm"
                  checked={useReranking}
                  onChange={(e) => setUseReranking(e.target.checked)}
                />
              </label>
            </div>

            {/* Divider */}
            <div className="border-t border-poster-border/20 mb-3" />

            {/* Chunking strategy toggle */}
            <div className="form-control mb-4">
              <label className="label py-1">
                <span className="label-text font-medium text-poster-text-main">Chunking</span>
              </label>
              <div className="join w-full mt-1">
                {(Object.entries(CHUNKING_STRATEGIES) as [ChunkingStrategy, { label: string; description: string }][]).map(
                  ([key, { label }]) => (
                    <button
                      key={key}
                      type="button"
                      className={`join-item btn btn-xs flex-1 ${
                        chunkingStrategy === key
                          ? 'btn-primary'
                          : 'btn-ghost bg-white/5 text-poster-text-sub hover:bg-white/10'
                      }`}
                      onClick={() => setChunkingStrategy(key)}
                    >
                      {label}
                    </button>
                  )
                )}
              </div>
              <span className="text-[10px] text-poster-text-sub/40 mt-1">
                {CHUNKING_STRATEGIES[chunkingStrategy].description}
              </span>
            </div>

            {/* Divider */}
            <div className="border-t border-poster-border/20 mb-3" />

            {/* Threshold display */}
            <div className="form-control">
              <label className="label cursor-pointer justify-between py-1">
                <span className="label-text font-medium text-poster-text-main">Threshold</span>
                <Badge
                  variant="neutral"
                  size="sm"
                  className={`text-[10px] ${
                    threshold.source === 'calibrated'
                      ? 'bg-poster-accent-purple/10 text-poster-accent-purple'
                      : 'bg-white/10 text-poster-text-sub'
                  }`}
                >
                  {formatThreshold(threshold.value)} ({threshold.source})
                </Badge>
              </label>
              <button
                type="button"
                className="btn btn-xs btn-ghost bg-poster-accent-purple/10 text-poster-accent-purple hover:bg-poster-accent-purple/20 mt-1 gap-1"
                disabled={documents.length === 0 || isCalibrating}
                onClick={async () => {
                  if (documents.length === 0) return;

                  // Collect all chunk texts from uploaded documents
                  const corpusTexts = documents.flatMap((doc) =>
                    doc.chunks.map((c) => c.text)
                  );

                  if (corpusTexts.length < 2) return;

                  // Abort any previous calibration
                  calibrationAbortRef.current?.abort();
                  const controller = new AbortController();
                  calibrationAbortRef.current = controller;

                  setCalibrating(true);
                  try {
                    const result = await calibrateSearchThreshold(
                      corpusTexts,
                      controller.signal
                    );
                    setThreshold({
                      value: result.threshold,
                      source: 'calibrated',
                      sampleSize: result.sampleSize,
                    });
                  } catch (err) {
                    // Silently ignore AbortError
                    if (err instanceof DOMException && err.name === 'AbortError') return;
                    console.error('[ChatHeader] Calibration failed:', err);
                  } finally {
                    setCalibrating(false);
                  }
                }}
              >
                {isCalibrating ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Calibrating...
                  </>
                ) : (
                  <>
                    <Target className="w-3 h-3" />
                    Calibrate Threshold
                  </>
                )}
              </button>
              {documents.length === 0 && (
                <span className="text-[10px] text-poster-text-sub/40 mt-1">
                  Upload documents first to calibrate
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Clear chat button */}
        <div className="tooltip tooltip-bottom" data-tip="Clear Chat">
          <Button
            variant="ghost"
            size="sm"
            onClick={clearMessages}
            className="btn-square text-poster-text-sub hover:text-error hover:bg-error/10"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
