/**
 * @file model-selector.tsx
 * @description Sidebar component for selecting and managing AI models
 */
'use client';

import { useState } from 'react';
import { Download, Check, Cpu, RefreshCw, Trash2 } from 'lucide-react';
import { Button, Spinner } from './ui';
import { ErrorAlert } from './error-boundary';
import { CATEGORY_INFO, MODEL_CATEGORIES, BACKEND_INFO, BACKEND_FILTER_TABS } from '../_lib/constants';
import { cn, groupModelsByCategory } from '../_lib/utils';
import { useModelStore } from '../_store/model.store';
import { useChatStore } from '../_store/chat.store';
import { useModelSelector } from '../_hooks';
import type { BackendFilter, ModelCategory, ModelInfo } from '../_lib/types';

/** Props for the ModelSelector component */
interface ModelSelectorProps {
  /** Callback to clear chat messages (owned by useChat hook) */
  clearMessages: () => void;
}

/** Sidebar component for selecting and managing AI models */
export function ModelSelector({ clearMessages }: ModelSelectorProps) {
  // Local filter state — only used in this component
  const [backendFilter, setBackendFilter] = useState<BackendFilter>('all');

  // Get state from stores
  const {
    isLoading,
    deletingModelId,
    error,
    clearError,
    webGPUSupported,
    models,
  } = useModelStore();

  const selectedModelId = useChatStore((state) => state.selectedModel);
  const { checkCacheStatus, handleSidebarModelSelect, handleDeleteCache } = useModelSelector({ clearMessages });

  // Derive filtered models and grouped results
  const filteredModels = backendFilter === 'all' ? models : models.filter((m) => m.backend === backendFilter);
  const groupedModels = groupModelsByCategory(filteredModels) as Record<ModelCategory, ModelInfo[]>;
  const cachedCount = models.filter((m) => m.isCached).length;

  // Per-backend counts for tab badges
  const backendCounts: Record<BackendFilter, number> = {
    all: models.length,
    webgpu: models.filter((m) => m.backend === 'webgpu').length,
    onnx: models.filter((m) => m.backend === 'onnx').length,
    wasm: models.filter((m) => m.backend === 'wasm').length,
  };

  /** Handle delete button click with event propagation stop */
  const onDeleteClick = (modelId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    handleDeleteCache(modelId);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="h-full flex flex-col bg-poster-surface/50 border-r border-poster-border/30">
        <div className="flex flex-col items-center justify-center gap-4 py-20 flex-1">
          <Spinner size="lg" className="text-poster-primary" />
          <p className="text-poster-text-sub text-sm">Checking cached models...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-poster-surface/50 border-r border-poster-border/30">
      {/* Header */}
      <div className="p-4 border-b border-poster-border/30">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-sm text-poster-text-main">Models</h2>
          <div className="flex items-center gap-1">
            <span className="text-xs text-poster-accent-teal">{cachedCount} cached</span>
            <Button
              variant="ghost"
              size="xs"
              onClick={checkCacheStatus}
              className="text-poster-text-sub hover:text-poster-primary"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Backend filter tabs */}
        <div className="grid grid-cols-4 gap-1 p-0.5 rounded-lg bg-poster-bg/50 border border-poster-border/20">
          {BACKEND_FILTER_TABS.map((tab) => {
            const isActive = backendFilter === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => setBackendFilter(tab.value)}
                className={cn(
                  'px-1 py-1 rounded-md text-[10px] font-medium transition-all text-center leading-tight',
                  isActive
                    ? 'bg-poster-primary text-white shadow-sm'
                    : 'text-poster-text-sub hover:text-poster-text-main hover:bg-poster-surface-lighter'
                )}
              >
                <span className="block">{tab.label}</span>
                <span className={cn('block text-[9px]', isActive ? 'text-white/70' : 'opacity-50')}>
                  {backendCounts[tab.value]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="p-2">
          <ErrorAlert message={error.message} onDismiss={clearError} onRetry={checkCacheStatus} />
        </div>
      )}

      {/* Model list */}
      <div className="flex-1 overflow-y-auto">
        {MODEL_CATEGORIES.map((category) => {
          const categoryModels = groupedModels[category];
          if (!categoryModels?.length) return null;

          return (
            <div key={category} className="py-2">
              {/* Category header */}
              <div className={`px-4 py-2 flex items-center gap-2 ${CATEGORY_INFO[category].color}`}>
                <Cpu className="w-3 h-3" />
                <span className="text-xs font-semibold">{CATEGORY_INFO[category].title}</span>
              </div>

              {/* Models in category */}
              {categoryModels.map((model) => {
                const isSelected = model.id === selectedModelId;
                const isDeleting = deletingModelId === model.id;
                const backendInfo = BACKEND_INFO[model.backend];
                const isWebGPUUnavailable = model.backend === 'webgpu' && webGPUSupported === false;

                return (
                  <div
                    key={model.id}
                    role="button"
                    tabIndex={isSelected ? -1 : 0}
                    onClick={() => !isSelected && handleSidebarModelSelect(model.id)}
                    onKeyDown={(e) =>
                      e.key === 'Enter' && !isSelected && handleSidebarModelSelect(model.id)
                    }
                    className={`group w-full px-4 py-3 text-left transition-all ${
                      isSelected
                        ? 'bg-poster-primary/10 border-l-2 border-poster-primary'
                        : 'hover:bg-poster-surface/80 border-l-2 border-transparent cursor-pointer'
                    } ${isWebGPUUnavailable ? 'opacity-60' : ''}`}
                    {...(isWebGPUUnavailable && { 'data-tip': 'Requires WebGPU' })}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-poster-text-main truncate">
                            {model.name}
                          </span>
                          <span className={cn(
                            'shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium',
                            backendInfo.bgColor, backendInfo.color
                          )}>
                            {backendInfo.label}
                          </span>
                          {model.vision && (
                            <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium bg-poster-accent-pink/10 text-poster-accent-pink">
                              Vision
                            </span>
                          )}
                          {model.isCached && (
                            <Check className="w-3 h-3 text-poster-accent-teal shrink-0" />
                          )}
                        </div>
                        <span className="text-[10px] text-poster-text-sub/60">
                          {model.size} • {model.contextLength.toLocaleString()} tokens • {backendInfo.accel} • {backendInfo.format}
                        </span>
                      </div>
                      {model.isCached ? (
                        <button
                          onClick={(e) => onDeleteClick(model.id, e)}
                          disabled={isDeleting}
                          className="opacity-0 group-hover:opacity-100 text-error hover:text-error/80 p-1 cursor-pointer disabled:cursor-not-allowed"
                        >
                          {isDeleting ? <Spinner size="xs" /> : <Trash2 className="w-3 h-3" />}
                        </button>
                      ) : (
                        <Download className="w-3.5 h-3.5 text-poster-text-sub/40 shrink-0" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
