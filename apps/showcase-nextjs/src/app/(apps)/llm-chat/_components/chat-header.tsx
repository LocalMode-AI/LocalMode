/**
 * @file chat-header.tsx
 * @description Header component for the chat view with controls and cache toggle
 */
'use client';

import { MessageSquare, Trash2, Cpu, PanelLeftClose, PanelLeft, Zap, Database, Unplug, Bot } from 'lucide-react';
import { Button, IconBox, StatusDot, Spinner } from './ui';
import { useChatStore } from '../_store/chat.store';
import { useUIStore } from '../_store/ui.store';
import { useModelStore } from '../_store/model.store';
import { getModelDisplayName } from '../_services/model.service';
import { BACKEND_INFO, AGENT_TOOLS_INFO } from '../_lib/constants';
import type { CacheStats } from '../_lib/types';

/** Props for the ChatHeader component */
interface ChatHeaderProps {
  /** Whether the model is currently streaming */
  isStreaming: boolean;
  /** Callback to clear all messages */
  clearMessages: () => void;
  /** Whether the semantic cache is enabled */
  cacheEnabled: boolean;
  /** Current cache statistics (null when cache is disabled or not ready) */
  cacheStats: CacheStats | null;
  /** Whether the embedding model is loading for the cache */
  isCacheLoading: boolean;
  /** Callback to toggle cache on/off */
  onToggleCache: (enabled: boolean) => void;
  /** Callback to clear all cache entries */
  onClearCache: () => void;
  /** Whether agent mode is currently enabled */
  agentEnabled: boolean;
  /** Callback to toggle agent mode on/off */
  onToggleAgent: (enabled: boolean) => void;
  /** Whether the current model supports agent mode */
  isAgentAvailable: boolean;
}

/** Header component for the chat view */
export function ChatHeader({
  isStreaming,
  clearMessages,
  cacheEnabled,
  cacheStats,
  isCacheLoading,
  onToggleCache,
  onClearCache,
  agentEnabled,
  onToggleAgent,
  isAgentAvailable,
}: ChatHeaderProps) {
  // Get shared UI state from stores
  const selectedModel = useChatStore((s) => s.selectedModel);
  const { isSidebarOpen, toggleSidebar } = useUIStore();
  const { getModelBackend, crossOriginIsolated } = useModelStore();

  // Derive active backend from selected model
  const activeBackend = selectedModel ? getModelBackend(selectedModel) : undefined;
  const activeBackendInfo = activeBackend ? BACKEND_INFO[activeBackend] : undefined;

  /** Format the hit rate as a percentage string */
  const formatHitRate = (rate: number) => `${Math.round(rate * 100)}%`;

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

        {/* Title and model info */}
        <div className="flex items-center gap-3">
          <IconBox size="sm" variant="primary">
            <MessageSquare className="w-4 h-4" />
          </IconBox>
          <div>
            <h1 className="font-bold text-sm leading-tight text-poster-text-main">LLM Chat</h1>
            {selectedModel && (
              <div className="flex items-center gap-2">
                <Cpu className="w-3 h-3 text-poster-text-sub/60" />
                <span className="text-[10px] text-poster-text-sub/80">
                  {getModelDisplayName(selectedModel)}
                </span>
                {activeBackendInfo && (
                  <span
                    className="text-[10px] text-poster-text-sub/60"
                    title={activeBackendInfo.detail}
                  >
                    {activeBackendInfo.accel} • {activeBackendInfo.format}
                  </span>
                )}
                {activeBackend === 'wasm' && (
                  <span
                    className={`inline-flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded-full ${
                      crossOriginIsolated
                        ? 'text-poster-accent-teal bg-poster-accent-teal/10'
                        : 'text-poster-text-sub/60 bg-poster-surface'
                    }`}
                    title={
                      crossOriginIsolated
                        ? 'SharedArrayBuffer available — multi-threaded WASM'
                        : 'No SharedArrayBuffer — single-threaded WASM (add CORS headers for 2-4x speed)'
                    }
                  >
                    <Unplug className="w-2.5 h-2.5" />
                    {crossOriginIsolated ? 'Multi-thread' : 'Single-thread'}
                  </span>
                )}
                {isStreaming && <StatusDot color="teal" />}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2">
        {/* Agent mode toggle */}
        <div className="flex items-center gap-2">
          {/* Tool badges (visible when agent mode is active) */}
          {agentEnabled && (
            <div className="flex items-center gap-1">
              {AGENT_TOOLS_INFO.map((tool) => (
                <span
                  key={tool.name}
                  className={`inline-flex items-center text-[9px] font-medium px-1.5 py-0.5 rounded-full ${tool.color}`}
                  title={tool.description}
                >
                  {tool.name}
                </span>
              ))}
            </div>
          )}

          {/* Agent toggle */}
          <div
            className="tooltip tooltip-bottom"
            data-tip={
              !isAgentAvailable
                ? 'Agent mode requires a small, medium, or large model'
                : agentEnabled
                  ? 'Disable Agent Mode'
                  : 'Enable Agent Mode'
            }
          >
            <label className="flex items-center gap-1.5 cursor-pointer">
              <Bot className={`w-3.5 h-3.5 ${agentEnabled ? 'text-poster-accent-purple' : 'text-poster-text-sub/40'}`} />
              <input
                type="checkbox"
                className="toggle toggle-xs toggle-secondary"
                checked={agentEnabled}
                onChange={(e) => onToggleAgent(e.target.checked)}
                disabled={!isAgentAvailable}
              />
            </label>
          </div>
        </div>

        {/* Divider */}
        <div className="h-4 w-px bg-poster-border/30" />

        {/* Cache toggle and stats */}
        <div className="flex items-center gap-2">
          {/* Cache stats (visible when cache is enabled and has stats) */}
          {cacheEnabled && cacheStats && !isCacheLoading && (
            <div className="flex items-center gap-2 text-[10px] text-poster-text-sub/80">
              <Database className="w-3 h-3 text-poster-accent-teal" />
              <span>{cacheStats.entries} entries</span>
              <span className="text-poster-text-sub/40">|</span>
              <span>{formatHitRate(cacheStats.hitRate)} hit rate</span>
            </div>
          )}

          {/* Clear cache button (visible when cache is enabled with entries) */}
          {cacheEnabled && cacheStats && cacheStats.entries > 0 && !isCacheLoading && (
            <div className="tooltip tooltip-bottom" data-tip="Clear Cache">
              <Button
                variant="ghost"
                size="xs"
                onClick={onClearCache}
                className="text-poster-text-sub hover:text-poster-accent-orange hover:bg-poster-accent-orange/10"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          )}

          {/* Cache toggle */}
          <div
            className="tooltip tooltip-bottom"
            data-tip={
              agentEnabled
                ? 'Cache is not available in agent mode'
                : cacheEnabled
                  ? 'Disable Cache'
                  : 'Enable Cache'
            }
          >
            <label className="flex items-center gap-1.5 cursor-pointer">
              {isCacheLoading ? (
                <Spinner size="xs" className="text-poster-accent-teal" />
              ) : (
                <Zap className={`w-3.5 h-3.5 ${cacheEnabled && !agentEnabled ? 'text-poster-accent-teal' : 'text-poster-text-sub/40'}`} />
              )}
              <input
                type="checkbox"
                className="toggle toggle-xs toggle-success"
                checked={cacheEnabled && !agentEnabled}
                onChange={(e) => onToggleCache(e.target.checked)}
                disabled={isCacheLoading || agentEnabled}
              />
            </label>
          </div>
        </div>

        {/* Divider */}
        <div className="h-4 w-px bg-poster-border/30" />

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
