/**
 * @file chat-interface.tsx
 * @description Main chat UI component with message display and input
 */
'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, HardDrive, Square, Zap, Wrench, CheckCircle, Clock, ChevronDown, ImagePlus, X } from 'lucide-react';
import { Button, Spinner, IconBox, Badge, Progress } from './ui';
import { cn, formatRelativeTime, getDisplayText } from '../_lib/utils';
import { useChatStore } from '../_store/chat.store';
import { useUIStore } from '../_store/ui.store';
import { useModelStore } from '../_store/model.store';
import { useChatInput } from '../_hooks';
import { CATEGORY_INFO, AGENT_TOOLS_INFO } from '../_lib/constants';
import type { ChatMessage, AgentStepDisplay, ChatImageAttachment } from '../_lib/types';

/** Props for the ChatInterface component */
interface ChatInterfaceProps {
  /** Chat messages to display */
  messages: ChatMessage[];
  /** Whether the model is currently streaming */
  isStreaming: boolean;
  /** ID of the message currently being streamed */
  streamingMessageId: string | null;
  /** Callback to send a message */
  sendMessage: (text: string, images?: ChatImageAttachment[]) => Promise<void>;
  /** Callback to cancel streaming */
  cancelStreaming: () => void;
  /** Placeholder text for the input field */
  placeholder?: string;
  /** Whether the selected model supports vision input */
  supportsVision?: boolean;
}

/** Get the color class for a tool name badge */
function getToolColor(toolName: string) {
  const info = AGENT_TOOLS_INFO.find((t) => t.name === toolName || t.name === toolName.replace('_web', ''));
  return info?.color ?? 'text-poster-text-sub bg-poster-surface';
}

/** Render a single collapsible agent step card */
function AgentStepCard({ step }: { step: AgentStepDisplay }) {
  const [expanded, setExpanded] = useState(false);

  if (step.type === 'finish') {
    return (
      <div className="flex items-center gap-2 py-1 text-xs text-success">
        <CheckCircle className="w-3 h-3" />
        <span className="font-medium">Final Answer</span>
        <span className="text-poster-text-sub/50 ml-auto">
          <Clock className="w-3 h-3 inline mr-0.5" />
          {step.durationMs}ms
        </span>
      </div>
    );
  }

  return (
    <div className="border border-poster-border/20 rounded-lg overflow-hidden mb-1">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-poster-surface/50 transition-colors cursor-pointer"
      >
        <Wrench className="w-3 h-3 text-poster-text-sub/60 shrink-0" />
        <span className="text-poster-text-sub/60">Step {step.index + 1}</span>
        <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full ${getToolColor(step.toolName ?? '')}`}>
          {step.toolName}
        </span>
        <span className="text-poster-text-sub/50 ml-auto shrink-0">
          <Clock className="w-3 h-3 inline mr-0.5" />
          {step.durationMs}ms
        </span>
        <ChevronDown className={cn('w-3 h-3 text-poster-text-sub/40 transition-transform', expanded && 'rotate-180')} />
      </button>
      {expanded && (
        <div className="px-3 py-2 border-t border-poster-border/20 bg-poster-surface/30 space-y-1">
          {step.toolArgs && Object.keys(step.toolArgs).length > 0 && (
            <div className="text-[10px] text-poster-text-sub/60">
              <span className="font-semibold">Args: </span>
              {Object.entries(step.toolArgs).map(([k, v]) => (
                <span key={k} className="mr-2">
                  {k}={typeof v === 'string' ? `"${v.length > 80 ? v.slice(0, 80) + '...' : v}"` : JSON.stringify(v)}
                </span>
              ))}
            </div>
          )}
          {step.observation && (
            <div className="text-[10px] text-poster-text-sub leading-relaxed whitespace-pre-wrap">
              <span className="font-semibold">Result: </span>
              {step.observation.length > 300 ? step.observation.slice(0, 300) + '...' : step.observation}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Render collapsible agent step cards for an agent-mode assistant message */
function renderAgentSteps(steps: AgentStepDisplay[]) {
  return (
    <div className="mb-2 space-y-0.5">
      {steps.map((step) => (
        <AgentStepCard key={step.index} step={step} />
      ))}
    </div>
  );
}

/** Main chat UI with message history and input */
export function ChatInterface({
  messages,
  isStreaming,
  streamingMessageId,
  sendMessage,
  cancelStreaming,
  placeholder = 'Type a message...',
  supportsVision = false,
}: ChatInterfaceProps) {
  // Get UI state from stores
  const selectedModel = useChatStore((s) => s.selectedModel);
  const { input, isSending } = useUIStore();
  const { loadingModelId, loadProgress, getLoadingModel } = useModelStore();

  // Get loading model info
  const loadingModel = getLoadingModel();
  const categoryInfo = loadingModel ? CATEGORY_INFO[loadingModel.category] : null;

  // Setup chat input handling (with image upload integration)
  const { textareaRef, handleSubmit, handleKeyDown, handleInputChange, isDisabled, canSubmit, imageUpload } =
    useChatInput({ onSendMessage: sendMessage, isStreaming, supportsVision });

  // Drag-and-drop state
  const [isDragOver, setIsDragOver] = useState(false);

  /** File input ref for image picker */
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Handle drag over */
  const handleDragOver = (e: React.DragEvent) => {
    if (!supportsVision) return;
    e.preventDefault();
    setIsDragOver(true);
  };

  /** Handle drag leave */
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  /** Handle drop */
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!supportsVision) return;
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    if (files.length > 0) {
      imageUpload.addImages(files);
    }
  };

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
                  {/* Agent step cards (collapsed by default) */}
                  {message.role === 'assistant' && message.agentSteps && message.agentSteps.length > 0 && (
                    renderAgentSteps(message.agentSteps)
                  )}
                  {/* Image display for multimodal messages */}
                  {Array.isArray(message.content) && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {message.content
                        .filter((p) => p.type === 'image')
                        .map((p, idx) => (
                          <img
                            key={idx}
                            src={`data:${(p as { mimeType: string; data: string }).mimeType};base64,${(p as { data: string }).data}`}
                            alt={`Attached image ${idx + 1}`}
                            className="max-w-48 max-h-48 rounded-lg object-cover"
                          />
                        ))}
                    </div>
                  )}
                  {/* Text content */}
                  {(() => {
                    const textContent = typeof message.content === 'string' ? message.content : getDisplayText(message.content);
                    if (textContent && textContent !== 'Thinking...') return textContent;
                    if (textContent === 'Thinking...' && streamingMessageId === message.id) {
                      return (
                        <span className="flex items-center gap-2">
                          <Spinner size="sm" className="text-poster-primary" />
                          <span className="text-poster-text-sub/60 text-sm">Thinking...</span>
                        </span>
                      );
                    }
                    if (!textContent && streamingMessageId === message.id) return <Spinner size="sm" className="text-poster-primary" />;
                    return textContent;
                  })()}
                  {streamingMessageId === message.id && (() => {
                    const textContent = typeof message.content === 'string' ? message.content : getDisplayText(message.content);
                    return textContent && textContent !== 'Thinking...';
                  })() && (
                    <span className="inline-block w-0.5 h-4 bg-poster-primary animate-pulse ml-0.5 align-middle" />
                  )}
                </div>

                {/* Cached response badge */}
                {message.role === 'assistant' && message.cached && (
                  <div className="chat-footer mt-1">
                    <span className="inline-flex items-center gap-1 text-[10px] text-poster-accent-teal bg-poster-accent-teal/10 px-2 py-0.5 rounded-full">
                      <Zap className="w-3 h-3" />
                      Cached{message.cacheDurationMs !== undefined && message.cacheDurationMs > 0
                        ? ` (${message.cacheDurationMs}ms)`
                        : ''}
                    </span>
                  </div>
                )}
              </div>
            ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input form */}
      <form onSubmit={handleSubmit} className="p-4">
        {/* Image upload error */}
        {imageUpload.error && (
          <div className="mb-2 flex items-center gap-2 text-xs text-warning bg-warning/10 px-3 py-1.5 rounded-lg">
            <span>{imageUpload.error.message}</span>
            <button type="button" onClick={imageUpload.clearError} className="ml-auto text-warning/60 hover:text-warning">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        <div
          className={cn(
            'w-full bg-poster-surface border rounded-xl p-1 shadow-inner transition-colors',
            isDragOver ? 'border-poster-primary border-dashed bg-poster-primary/5' : 'border-poster-border/30'
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Image preview thumbnails */}
          {supportsVision && imageUpload.images.length > 0 && (
            <div className="flex flex-wrap gap-2 px-2 pt-2 pb-1">
              {imageUpload.images.map((img, idx) => (
                <div key={idx} className="relative group">
                  <img
                    src={img.previewUrl}
                    alt={img.name}
                    className="w-16 h-16 rounded-lg object-cover border border-poster-border/30"
                  />
                  <button
                    type="button"
                    onClick={() => imageUpload.removeImage(idx)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-error text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Drag overlay */}
          {isDragOver && (
            <div className="px-3 py-2 text-center text-sm text-poster-primary">
              <ImagePlus className="w-5 h-5 inline mr-1" />
              Drop images here
            </div>
          )}

          <div className="flex items-stretch gap-1">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onPaste={supportsVision ? imageUpload.pasteHandler : undefined}
              placeholder={placeholder}
              disabled={isDisabled}
              className="textarea textarea-ghost flex-1 resize-none min-h-10 max-h-40 bg-transparent text-poster-text-main placeholder:text-poster-text-sub/40 focus:bg-transparent focus:outline-none"
              rows={1}
            />

            {/* Image upload button (vision models only) */}
            {supportsVision && !isStreaming && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (files.length > 0) imageUpload.addImages(files);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isDisabled}
                  className="btn btn-ghost btn-sm self-stretch rounded-lg min-h-0 h-auto px-2 text-poster-text-sub/60 hover:text-poster-primary"
                  title="Attach images"
                >
                  <ImagePlus className="w-4 h-4" />
                </button>
              </>
            )}

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
        </div>
        <p className="text-[10px] text-poster-text-sub/40 mt-2 text-center">
          Press Enter to send, Shift+Enter for new line{supportsVision ? ' · Paste or drop images' : ''}
        </p>
      </form>
    </div>
  );
}
