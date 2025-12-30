/**
 * @file chat-interface.tsx
 * @description Main chat UI component with message display and input
 */
'use client';

import { useRef, useEffect } from 'react';
import { Send, User, Bot, FileText, AlertCircle } from 'lucide-react';
import { Button, Spinner, IconBox } from './ui';
import { cn, formatRelativeTime } from '../_lib/utils';
import { useChatStore } from '../_store/chat.store';
import { usePDFStore } from '../_store/pdf.store';
import { useChatInput, usePDFSearch, useModelLoader } from '../_hooks';
import { DemoSuggestions } from '../_demo';

/** Main chat UI with message history and input */
export function ChatInterface() {
  // Get state from stores
  const { messages, isSearching } = useChatStore();
  const { documents } = usePDFStore();

  // Hooks
  const { askQuestion } = usePDFSearch();
  const {
    isReady,
    isLoading,
    loadingModelName,
    loadingProgress,
    error: modelError,
    loadModels,
  } = useModelLoader();

  // Setup chat input handling
  const {
    textareaRef,
    input,
    handleSubmit,
    handleKeyDown,
    handleInputChange,
    isDisabled,
    canSubmit,
    placeholder,
  } = useChatInput({ onSendMessage: askQuestion });

  // Auto-scroll to bottom on new messages
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /** Render empty state based on conditions */
  const renderEmptyState = () => {
    // Model loading error state
    if (modelError) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="flex flex-col items-center justify-center gap-6 max-w-md mx-auto">
            <IconBox size="xl" variant="error">
              <AlertCircle className="w-12 h-12 text-error" />
            </IconBox>

            <div className="text-center space-y-2">
              <h3 className="text-xl font-bold text-poster-text-main">Model Loading Failed</h3>
              <p className="text-sm text-error">{modelError}</p>
            </div>

            <Button variant="primary" onClick={loadModels}>
              Retry Loading
            </Button>

            <p className="text-xs text-poster-text-sub/40 text-center max-w-sm">
              This may be a browser compatibility issue. Try refreshing the page or using a
              different browser.
            </p>
          </div>
        </div>
      );
    }

    // Loading models state
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="flex flex-col items-center justify-center gap-6 max-w-md mx-auto">
            <IconBox size="xl" variant="primary">
              <Spinner size="xl" className="text-poster-primary" />
            </IconBox>

            <div className="text-center space-y-2">
              <h3 className="text-xl font-bold text-poster-text-main">Loading Model</h3>
              <p className="text-lg text-poster-primary font-semibold">{loadingModelName}</p>
            </div>

            <div className="w-full space-y-2">
              <progress
                className="progress progress-primary w-full"
                value={loadingProgress}
                max={100}
              />
              <p className="text-sm text-poster-text-sub text-center">
                {Math.round(loadingProgress)}% complete
              </p>
            </div>

            <p className="text-xs text-poster-text-sub/40 text-center max-w-sm">
              First load may take a moment. Models will be cached for offline use.
            </p>
          </div>
        </div>
      );
    }

    // No documents uploaded
    if (documents.length === 0) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center max-w-md mx-auto opacity-50">
            <IconBox size="lg" variant="surface" className="mx-auto mb-4">
              <FileText className="w-8 h-8 text-poster-primary" />
            </IconBox>
            <p className="text-lg font-semibold text-poster-text-main mb-2">
              No documents uploaded
            </p>
            <p className="text-sm text-poster-text-sub">
              Upload PDFs using the sidebar to start asking questions
            </p>
          </div>
        </div>
      );
    }

    // Documents uploaded, no messages
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center opacity-50">
          <IconBox size="lg" variant="surface" className="mx-auto mb-4">
            <Bot className="w-8 h-8 text-poster-primary" />
          </IconBox>
          <p className="text-lg font-semibold text-poster-text-main">Ready to answer</p>
          <p className="text-sm text-poster-text-sub">
            Ask a question about your {documents.length} document{documents.length > 1 ? 's' : ''}
          </p>
        </div>
      </div>
    );
  };

  /** Get message icon based on role */
  const getMessageIcon = (role: string) => {
    switch (role) {
      case 'user':
        return <User className="w-5 h-5" />;
      case 'assistant':
        return <Bot className="w-5 h-5" />;
      case 'system':
        return <AlertCircle className="w-5 h-5" />;
      default:
        return <Bot className="w-5 h-5" />;
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Messages area */}
      <div
        className={cn(
          'flex-1 min-h-0 p-4',
          messages.length === 0 ? 'overflow-hidden' : 'overflow-y-auto space-y-6'
        )}
      >
        {messages.length === 0
          ? renderEmptyState()
          : messages.map((message) => (
              <div
                key={message.id}
                className={cn('chat', message.role === 'user' ? 'chat-end' : 'chat-start')}
              >
                {/* Avatar */}
                <div className="chat-image avatar">
                  <div
                    className={cn(
                      'w-10 rounded-full flex items-center justify-center border border-white/5',
                      message.role === 'user'
                        ? 'bg-poster-primary/20 text-poster-primary'
                        : message.role === 'system'
                          ? 'bg-poster-accent-teal/20 text-poster-accent-teal'
                          : 'bg-poster-surface text-poster-text-sub'
                    )}
                  >
                    {getMessageIcon(message.role)}
                  </div>
                </div>

                {/* Message header */}
                <div className="chat-header mb-1 text-poster-text-sub/60 text-xs">
                  {message.role === 'user'
                    ? 'You'
                    : message.role === 'system'
                      ? 'System'
                      : 'Assistant'}
                  <time className="ml-2 opacity-50">{formatRelativeTime(message.timestamp)}</time>
                </div>

                {/* Message bubble */}
                <div
                  className={cn(
                    'chat-bubble shadow-md backdrop-blur-sm whitespace-pre-wrap',
                    message.role === 'user'
                      ? 'bg-poster-primary text-white'
                      : message.role === 'system'
                        ? 'bg-poster-accent-teal/10 text-poster-accent-teal border border-poster-accent-teal/30'
                        : 'bg-poster-surface text-poster-text-main border border-poster-border/30'
                  )}
                >
                  {message.content}
                </div>
              </div>
            ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Demo suggestions - self-contained, handles its own visibility */}
      <DemoSuggestions />

      {/* Input form */}
      <form onSubmit={handleSubmit} className="p-4">
        <div className="flex w-full bg-poster-surface border border-poster-border/30 rounded-xl p-1 shadow-inner items-stretch gap-1">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isDisabled}
            className="textarea textarea-ghost flex-1 resize-none min-h-10 max-h-40 bg-transparent text-poster-text-main placeholder:text-poster-text-sub/40 focus:bg-transparent focus:outline-none"
            rows={1}
          />
          <Button
            type="submit"
            variant="primary"
            className="bg-poster-primary hover:bg-poster-primary-dark text-white border-none shadow-md self-stretch rounded-lg min-h-0 h-auto px-3"
            disabled={!canSubmit}
            loading={isSearching}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-[10px] text-poster-text-sub/40 mt-2 text-center">
          Press Enter to send, Shift+Enter for new line
        </p>
      </form>
    </div>
  );
}
