/**
 * @file chat-interface.tsx
 * @description Main chat UI component with message display and input
 */
'use client';

import { useRef, useEffect } from 'react';
import { Send, User, Bot, HardDrive, Square } from 'lucide-react';
import { Button, Spinner, IconBox, Badge, Progress } from './ui';
import { cn, formatRelativeTime } from '../_lib/utils';
import { useChatStore } from '../_store/chat.store';
import { useUIStore } from '../_store/ui.store';
import { useModelStore } from '../_store/model.store';
import { useChatInput, useChat } from '../_hooks';
import { CATEGORY_INFO } from '../_lib/constants';

/** Props for the ChatInterface component */
interface ChatInterfaceProps {
  /** Placeholder text for the input field */
  placeholder?: string;
}

/** Main chat UI with message history and input */
export function ChatInterface({ placeholder = 'Type a message...' }: ChatInterfaceProps) {
  // Get chat state from store
  const { messages, streamingMessageId, selectedModel, isStreaming } = useChatStore();
  const { input, isSending } = useUIStore();
  const { loadingModelId, loadProgress, getLoadingModel } = useModelStore();
  const { sendMessage, cancelStreaming } = useChat();

  // Get loading model info
  const loadingModel = getLoadingModel();
  const categoryInfo = loadingModel ? CATEGORY_INFO[loadingModel.category] : null;

  // Setup chat input handling
  const { textareaRef, handleSubmit, handleKeyDown, handleInputChange, isDisabled, canSubmit } =
    useChatInput({ onSendMessage: sendMessage });

  // Auto-scroll to bottom on new messages
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /** Render empty state based on model selection/loading status */
  const renderEmptyState = () => {
    // Loading model state - show progress
    if (loadingModelId) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="flex flex-col items-center justify-center gap-6 max-w-md mx-auto">
            {/* Loading icon */}
            <div className="relative">
              <IconBox size="xl" variant="primary">
                <Spinner size="xl" className="text-poster-primary" />
              </IconBox>
              {loadingModel?.isCached && (
                <div className="absolute -top-2 -right-2">
                  <IconBox size="sm" variant="accent" className="rounded-full">
                    <HardDrive className="w-4 h-4" />
                  </IconBox>
                </div>
              )}
            </div>

            {/* Title */}
            <div className="text-center space-y-2">
              <h3 className="text-xl font-bold text-poster-text-main">
                {loadingModel?.isCached ? 'Loading Model' : 'Downloading Model'}
              </h3>
              <p className="text-lg text-poster-primary font-semibold">{loadingModel?.name}</p>
            </div>

            {/* Model info card */}
            <div className="w-full bg-poster-surface/50 rounded-xl border border-poster-border/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-poster-text-sub">Size</span>
                <Badge variant="ghost" size="sm">
                  {loadingModel?.size}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-poster-text-sub">Context Length</span>
                <span className="text-sm text-poster-text-main">
                  {loadingModel?.contextLength.toLocaleString()} tokens
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-poster-text-sub">Category</span>
                <span className={`text-sm font-medium ${categoryInfo?.color}`}>
                  {categoryInfo?.title}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-poster-text-sub">Status</span>
                <Badge variant={loadingModel?.isCached ? 'success' : 'primary'} size="sm">
                  {loadingModel?.isCached ? 'Cached' : 'Downloading'}
                </Badge>
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full space-y-2">
              <Progress value={loadProgress} max={100} className="h-2" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-poster-text-sub">
                  {loadingModel?.isCached ? 'Loading from cache...' : 'Downloading...'}
                </span>
                <span className="text-poster-primary font-bold">{Math.round(loadProgress)}%</span>
              </div>
            </div>

            {/* Help text */}
            <p className="text-xs text-poster-text-sub/40 text-center max-w-sm">
              {loadingModel?.isCached
                ? 'Loading model from browser cache. This should be quick!'
                : 'First download may take a few minutes. The model will be cached locally for offline use.'}
            </p>
          </div>
        </div>
      );
    }

    // No model selected - prompt to select
    if (!selectedModel) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center opacity-50">
            <IconBox size="lg" variant="surface" className="mx-auto mb-4">
              <Bot className="w-8 h-8 text-poster-primary" />
            </IconBox>
            <p className="text-lg font-semibold text-poster-text-main">No model selected</p>
            <p className="text-sm text-poster-text-sub">Select a model from the sidebar to start</p>
          </div>
        </div>
      );
    }

    // Model selected, no messages
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center opacity-50">
          <IconBox size="lg" variant="surface" className="mx-auto mb-4">
            <Bot className="w-8 h-8 text-poster-primary" />
          </IconBox>
          <p className="text-lg font-semibold text-poster-text-main">No messages yet</p>
          <p className="text-sm text-poster-text-sub">Start a conversation below</p>
        </div>
      </div>
    );
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
                        : 'bg-poster-surface text-poster-text-sub'
                    )}
                  >
                    {message.role === 'user' ? (
                      <User className="w-5 h-5" />
                    ) : (
                      <Bot className="w-5 h-5" />
                    )}
                  </div>
                </div>

                {/* Message header */}
                <div className="chat-header mb-1 text-poster-text-sub/60 text-xs">
                  {message.role === 'user' ? 'You' : 'Assistant'}
                  <time className="ml-2 opacity-50">{formatRelativeTime(message.timestamp)}</time>
                </div>

                {/* Message bubble */}
                <div
                  className={cn(
                    'chat-bubble shadow-md backdrop-blur-sm',
                    message.role === 'user'
                      ? 'bg-poster-primary text-white'
                      : 'bg-poster-surface text-poster-text-main border border-poster-border/30'
                  )}
                >
                  {message.content ||
                    (streamingMessageId === message.id && (
                      <Spinner size="sm" className="text-poster-primary" />
                    ))}
                  {streamingMessageId === message.id && message.content && (
                    <span className="inline-block w-0.5 h-4 bg-poster-primary animate-pulse ml-0.5 align-middle" />
                  )}
                </div>
              </div>
            ))}
        <div ref={messagesEndRef} />
      </div>

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
          {isStreaming ? (
            <button
              type="button"
              onClick={cancelStreaming}
              className="btn btn-sm bg-error hover:bg-error/80 text-white border-none shadow-md self-stretch rounded-lg min-h-0 h-auto px-3"
              title="Stop generation"
            >
              <Square className="w-4 h-4 fill-current" />
            </button>
          ) : (
            <Button
              type="submit"
              variant="primary"
              className="bg-poster-primary hover:bg-poster-primary-dark text-white border-none shadow-md self-stretch rounded-lg min-h-0 h-auto px-3"
              disabled={!canSubmit}
              loading={isSending}
            >
              <Send className="w-4 h-4" />
            </Button>
          )}
        </div>
        <p className="text-[10px] text-poster-text-sub/40 mt-2 text-center">
          Press Enter to send, Shift+Enter for new line
        </p>
      </form>
    </div>
  );
}
