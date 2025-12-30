/**
 * @file chat-header.tsx
 * @description Header component for the PDF search view with controls
 */
'use client';

import { FileText, Trash2, PanelLeftClose, PanelLeft, Settings } from 'lucide-react';
import { Button, IconBox, StatusDot, Badge } from './ui';
import { useChatStore } from '../_store/chat.store';
import { useUIStore } from '../_store/ui.store';
import { usePDFStore } from '../_store/pdf.store';
import { SEARCH_CONFIG } from '../_lib/constants';

/** Header component for the PDF chat view */
export function ChatHeader() {
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
  } = useUIStore();
  const { documents } = usePDFStore();

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
              {isSearching && <StatusDot color="teal" />}
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
            <div className="form-control">
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
