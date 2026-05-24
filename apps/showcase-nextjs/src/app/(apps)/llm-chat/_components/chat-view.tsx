/**
 * @file chat-view.tsx
 * @description Main chat view layout with sidebar, chat interface, and error handling
 */
'use client';

import { useEffect } from 'react';
import { ModelSelector } from './model-selector';
import { ChatInterface } from './chat-interface';
import { ChatHeader } from './chat-header';
import { ErrorBoundary } from './error-boundary';
import { useUIStore } from '../_store/ui.store';
import { useChatStore } from '../_store/chat.store';
import { useModelStore } from '../_store/model.store';
import { useChat } from '../_hooks';
import { MIN_AGENT_MODEL_SIZE_BYTES } from '../_lib/constants';

/** Main chat view with sidebar and chat interface */
export function ChatView() {
  const { isSidebarOpen, toggleSidebar } = useUIStore();
  const { cacheEnabled, setCacheEnabled, agentEnabled, setAgentEnabled, selectedModel } = useChatStore();
  const models = useModelStore((s) => s.models);
  const {
    messages,
    isStreaming,
    streamingMessageId,
    sendMessage,
    cancelStreaming,
    clearMessages,
    cacheStats,
    isCacheLoading,
    clearCache,
  } = useChat();

  // Look up current model info
  const selectedModelInfo = models.find((m) => m.id === selectedModel);
  const supportsVision = selectedModelInfo?.vision ?? false;
  const isAgentAvailable = Boolean(
    selectedModel && selectedModelInfo && selectedModelInfo.sizeBytes >= MIN_AGENT_MODEL_SIZE_BYTES
  );

  // Auto-disable agent mode when switching to an incompatible model
  useEffect(() => {
    if (agentEnabled && !isAgentAvailable) {
      setAgentEnabled(false);
    }
  }, [agentEnabled, isAgentAvailable, setAgentEnabled]);

  return (
    <div className="h-[calc(100vh-4rem)] bg-poster-bg text-poster-text-main font-sans selection:bg-poster-primary/30 relative overflow-hidden">
      {/* Background grid */}
      <div className="bg-grid fixed inset-0 z-0 pointer-events-none opacity-50" />

      <div className="relative z-10 flex h-full">
        {/* Mobile sidebar overlay backdrop */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-30 lg:hidden"
            onClick={toggleSidebar}
          />
        )}

        {/* Sidebar with error boundary */}
        <aside
          className={`transition-all duration-300 ease-in-out shrink-0 ${
            isSidebarOpen
              ? 'fixed left-0 top-16 bottom-0 w-72 z-40 bg-poster-bg lg:relative lg:top-0 lg:z-auto lg:bg-transparent'
              : 'w-0'
          } overflow-hidden`}
        >
          <ErrorBoundary>
            <ModelSelector clearMessages={clearMessages} />
          </ErrorBoundary>
        </aside>

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0">
          <ChatHeader
            isStreaming={isStreaming}
            clearMessages={clearMessages}
            cacheEnabled={cacheEnabled}
            cacheStats={cacheStats}
            isCacheLoading={isCacheLoading}
            onToggleCache={setCacheEnabled}
            onClearCache={clearCache}
            agentEnabled={agentEnabled}
            onToggleAgent={setAgentEnabled}
            isAgentAvailable={isAgentAvailable}
          />

          <div className="flex-1 overflow-hidden flex justify-center">
            <div className="w-full max-w-6xl h-full">
              <ErrorBoundary>
                <ChatInterface
                  messages={messages}
                  isStreaming={isStreaming}
                  streamingMessageId={streamingMessageId}
                  sendMessage={sendMessage}
                  cancelStreaming={cancelStreaming}
                  supportsVision={supportsVision}
                />
              </ErrorBoundary>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
