/**
 * @file chat-view.tsx
 * @description Main chat view layout with sidebar, chat interface, and error handling
 */
'use client';

import { ModelSelector } from './model-selector';
import { ChatInterface } from './chat-interface';
import { ChatHeader } from './chat-header';
import { ErrorBoundary } from './error-boundary';
import { useUIStore } from '../_store/ui.store';

/** Main chat view with sidebar and chat interface */
export function ChatView() {
  const isSidebarOpen = useUIStore((state) => state.isSidebarOpen);

  return (
    <div className="h-[calc(100vh-4rem)] bg-poster-bg text-poster-text-main font-sans selection:bg-poster-primary/30 relative overflow-hidden">
      {/* Background grid */}
      <div className="bg-grid fixed inset-0 z-0 pointer-events-none opacity-50" />

      <div className="relative z-10 flex h-full">
        {/* Sidebar with error boundary */}
        <aside
          className={`transition-all duration-300 ease-in-out ${
            isSidebarOpen ? 'w-72' : 'w-0'
          } overflow-hidden shrink-0`}
        >
          <ErrorBoundary>
            <ModelSelector />
          </ErrorBoundary>
        </aside>

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0">
          <ChatHeader />

          <div className="flex-1 overflow-hidden flex justify-center">
            <div className="w-full max-w-6xl h-full">
              <ErrorBoundary>
                <ChatInterface />
              </ErrorBoundary>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
