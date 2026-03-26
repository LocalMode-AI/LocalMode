/**
 * @file explorer-view.tsx
 * @description Main view for the GGUF Explorer app. Manages tab navigation
 * and renders Browse, Inspect, or Chat panels.
 */
'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  Cpu,
  Search,
  FileText,
  MessageSquare,
} from 'lucide-react';
import { IconBox, TabBar, Badge } from './ui';
import { ErrorBoundary, ErrorAlert } from './error-boundary';
import { ModelBrowser } from './model-browser';
import { ModelCard } from './model-card';
import { ChatPanel } from './chat-panel';
import { useExplorer } from '../_hooks';
import { cn } from '../_lib/utils';
import { TABS, TAB_LABELS } from '../_lib/constants';
import type { ExplorerTab } from '../_lib/types';

/** Tab icon mapping */
const TAB_ICONS: Record<ExplorerTab, React.ReactNode> = {
  browse: <Search className="w-3.5 h-3.5" />,
  inspect: <FileText className="w-3.5 h-3.5" />,
  chat: <MessageSquare className="w-3.5 h-3.5" />,
};

/** Main explorer view component */
export function ExplorerView() {
  const explorer = useExplorer();

  // Determine which tabs are disabled
  const disabledTabs: ExplorerTab[] = [];
  if (!explorer.canInspect) disabledTabs.push('inspect');
  if (!explorer.canChat) disabledTabs.push('chat');

  // Derive model info for header badge
  const modelName = explorer.selectedModel?.entry?.name
    ?? explorer.selectedModel?.url.split('/').pop()?.split(':').pop()
    ?? null;

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
            <IconBox size="sm" variant="primary">
              <Cpu className="w-4 h-4" />
            </IconBox>
            <div>
              <h1 className="text-base font-semibold text-poster-text-main">GGUF Explorer</h1>
              <p className="text-xs text-poster-text-sub">Inspect, test, and chat with GGUF models</p>
            </div>
            {modelName && (
              <Badge variant="ghost" size="sm" className="ml-2 gap-1.5 bg-poster-surface-lighter border-poster-border/30 text-poster-text-sub">
                <Cpu className="w-3 h-3 text-poster-primary" />
                {modelName}
              </Badge>
            )}
          </div>
        </div>

        {/* Gradient accent line */}
        <div className="h-px bg-gradient-to-r from-transparent via-poster-primary/40 to-transparent" />

        {/* Tabs */}
        <TabBar
          tabs={TABS}
          activeTab={explorer.activeTab}
          onTabChange={explorer.setActiveTab}
          labels={TAB_LABELS}
          disabledTabs={disabledTabs}
        />

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {/* Error alerts */}
          {explorer.inspectError && explorer.activeTab === 'inspect' && (
            <div className="p-6 pb-0">
              <ErrorAlert
                message={explorer.inspectError.message}
                onDismiss={explorer.clearInspectError}
                onRetry={explorer.retryInspection}
              />
            </div>
          )}

          {/* Tab content */}
          <div className={cn('h-full', explorer.activeTab !== 'chat' && 'p-6')}>
            <div className={cn(explorer.activeTab !== 'chat' && 'max-w-5xl mx-auto')}>
              <ErrorBoundary>
                {explorer.activeTab === 'browse' && (
                  <ModelBrowser
                    onSelectCurated={explorer.selectCuratedModel}
                    onSelectCustomUrl={explorer.selectCustomUrl}
                  />
                )}

                {explorer.activeTab === 'inspect' && (
                  <ModelCard
                    result={explorer.inspectionResult}
                    isLoading={explorer.isInspecting}
                  />
                )}

                {explorer.activeTab === 'chat' && (
                  <ChatPanel
                    inspectionResult={explorer.inspectionResult}
                    downloadProgress={explorer.downloadProgress}
                    isModelLoaded={explorer.isModelLoaded}
                    isDownloading={explorer.isDownloading}
                    chatError={explorer.chatError}
                    onClearChatError={explorer.clearChatError}
                    onDownload={explorer.downloadModel}
                    onSendMessage={explorer.sendMessage}
                    onCancelStreaming={explorer.cancelStreaming}
                    messages={explorer.messages}
                    isStreaming={explorer.isStreaming}
                  />
                )}
              </ErrorBoundary>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
