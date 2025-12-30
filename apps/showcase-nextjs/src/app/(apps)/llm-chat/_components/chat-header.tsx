/**
 * @file chat-header.tsx
 * @description Header component for the chat view with controls
 */
'use client';

import { MessageSquare, Trash2, Cpu, PanelLeftClose, PanelLeft } from 'lucide-react';
import { Button, IconBox, StatusDot } from './ui';
import { useChatStore } from '../_store/chat.store';
import { useUIStore } from '../_store/ui.store';
import { getModelDisplayName } from '../_services/model.service';

/** Header component for the chat view */
export function ChatHeader() {
  // Get state from stores
  const { selectedModel, clearMessages, isStreaming } = useChatStore();
  const { isSidebarOpen, toggleSidebar } = useUIStore();

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
                {isStreaming && <StatusDot color="teal" />}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2">
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
