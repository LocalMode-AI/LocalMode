/**
 * @file chat-panel.tsx
 * @description Chat tab: download model and chat with it via wllama
 */
'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Download,
  Send,
  Square,
  Bot,
  User,
  AlertTriangle,
  MessageSquare,
} from 'lucide-react';
import { Button, Spinner, Progress } from './ui';
import { ErrorAlert } from './error-boundary';
import { cn, formatBytes } from '../_lib/utils';
import type {
  InspectionResult,
  DownloadProgress,
  AppError,
  ChatMessage,
} from '../_lib/types';

/** Props for the ChatPanel component */
interface ChatPanelProps {
  /** Inspection result for file size / compat info */
  inspectionResult: InspectionResult | null;
  /** Model download progress */
  downloadProgress: DownloadProgress;
  /** Whether the model is fully loaded */
  isModelLoaded: boolean;
  /** Whether model is downloading/loading */
  isDownloading: boolean;
  /** Chat error */
  chatError: AppError | null;
  /** Clear chat error */
  onClearChatError: () => void;
  /** Start downloading the model */
  onDownload: () => void;
  /** Send a chat message */
  onSendMessage: (text: string) => void;
  /** Cancel streaming */
  onCancelStreaming: () => void;
  /** Chat messages */
  messages: ChatMessage[];
  /** Whether the model is streaming a response */
  isStreaming: boolean;
}

/** Warning banner when canRun is false */
function CompatWarningBanner({ onDownloadAnyway }: { onDownloadAnyway: () => void }) {
  return (
    <div className="alert alert-warning shadow-lg">
      <AlertTriangle className="w-5 h-5" />
      <div className="flex-1">
        <p className="text-sm font-medium">This model may not run well on your device</p>
        <p className="text-xs opacity-80 mt-0.5">
          The compatibility check indicates this model may exceed your device&apos;s available RAM.
        </p>
      </div>
      <Button variant="ghost" size="sm" onClick={onDownloadAnyway}>
        Try Anyway
      </Button>
    </div>
  );
}

/** Download / load button before model is ready */
function DownloadSection({
  inspectionResult,
  downloadProgress,
  isDownloading,
  canRun,
  onDownload,
}: {
  inspectionResult: InspectionResult | null;
  downloadProgress: DownloadProgress;
  isDownloading: boolean;
  canRun: boolean;
  onDownload: () => void;
}) {
  const [triedAnyway, setTriedAnyway] = useState(false);
  const fileSize = inspectionResult?.metadata.fileSize;
  const showWarning = !canRun && !triedAnyway;

  const handleTryAnyway = () => {
    setTriedAnyway(true);
    onDownload();
  };

  if (isDownloading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12 animate-fadeIn">
        <Spinner size="lg" className="text-poster-primary" />
        <div className="text-center">
          <p className="text-sm font-medium text-poster-text-main">
            {downloadProgress.status === 'loading' ? 'Initializing model...' : 'Downloading model...'}
          </p>
          {downloadProgress.progress > 0 && (
            <p className="text-xs text-poster-text-sub mt-1">
              {downloadProgress.progress.toFixed(1)}%
              {downloadProgress.loaded > 0 && downloadProgress.total > 0 && (
                <> &middot; {formatBytes(downloadProgress.loaded)} / {formatBytes(downloadProgress.total)}</>
              )}
            </p>
          )}
        </div>
        <div className="w-full max-w-sm">
          <Progress value={downloadProgress.progress} max={100} className="w-full" />
        </div>
        {downloadProgress.text && (
          <p className="text-xs text-poster-text-sub/60">{downloadProgress.text}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-6 py-12 animate-fadeIn">
      {/* Icon */}
      <div className="relative">
        <div className="absolute inset-0 rounded-3xl bg-poster-primary/20 blur-2xl animate-pulse-glow" />
        <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-poster-primary to-poster-primary/60 flex items-center justify-center shadow-lg shadow-poster-primary/20">
          <Download className="w-10 h-10 text-white" />
        </div>
      </div>

      <div className="text-center">
        <h3 className="text-lg font-bold text-poster-text-main mb-1">Ready to Chat</h3>
        <p className="text-sm text-poster-text-sub">
          Download the model to start a conversation
        </p>
        {fileSize !== undefined && fileSize > 0 && (
          <p className="text-xs text-poster-text-sub/60 mt-1">
            Model size: {formatBytes(fileSize)}
          </p>
        )}
      </div>

      {showWarning ? (
        <CompatWarningBanner onDownloadAnyway={handleTryAnyway} />
      ) : (
        <Button
          variant="primary"
          size="lg"
          onClick={onDownload}
          className="shadow-lg shadow-poster-primary/20 cursor-pointer transition-all duration-300 hover:scale-105"
        >
          <Download className="w-5 h-5 mr-2" />
          Download & Chat
          {fileSize !== undefined && fileSize > 0 && (
            <span className="ml-1 opacity-70">({formatBytes(fileSize)})</span>
          )}
        </Button>
      )}
    </div>
  );
}

/** Single chat message bubble */
function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('chat', isUser ? 'chat-end' : 'chat-start')}>
      <div className="chat-image avatar">
        <div
          className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center',
            isUser
              ? 'bg-poster-primary/10 text-poster-primary'
              : 'bg-poster-accent-teal/10 text-poster-accent-teal'
          )}
        >
          {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
        </div>
      </div>
      <div
        className={cn(
          'chat-bubble text-sm leading-relaxed whitespace-pre-wrap',
          isUser
            ? 'chat-bubble-primary'
            : 'bg-poster-surface border border-poster-border/20 text-poster-text-main'
        )}
      >
        {message.content || (
          <span className="inline-flex items-center gap-1">
            <Spinner size="xs" />
            <span className="text-poster-text-sub/50">Thinking...</span>
          </span>
        )}
      </div>
    </div>
  );
}

/** Chat interface with message list and input */
function ChatInterface({
  messages,
  isStreaming,
  onSendMessage,
  onCancelStreaming,
}: {
  messages: ChatMessage[];
  isStreaming: boolean;
  onSendMessage: (text: string) => void;
  onCancelStreaming: () => void;
}) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    onSendMessage(trimmed);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-poster-text-sub/30">
            <MessageSquare className="w-10 h-10" />
            <p className="text-sm">Send a message to start chatting</p>
          </div>
        )}
        {messages.map((msg) => (
          <ChatBubble key={msg.id} message={msg} />
        ))}
      </div>

      {/* Input */}
      <div className="border-t border-poster-border/20 p-4 bg-poster-surface/50">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            disabled={isStreaming}
            className={cn(
              'input input-bordered flex-1 bg-poster-surface/50 border-poster-border/30 text-poster-text-main placeholder:text-poster-text-sub/40 text-sm',
              'focus:border-poster-primary/50 focus:outline-none transition-all duration-200'
            )}
          />
          {isStreaming ? (
            <Button variant="ghost" size="md" onClick={onCancelStreaming} className="cursor-pointer">
              <Square className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              variant="primary"
              size="md"
              onClick={handleSend}
              disabled={!input.trim()}
              className="cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Chat tab: download + chat panel */
export function ChatPanel({
  inspectionResult,
  downloadProgress,
  isModelLoaded,
  isDownloading,
  chatError,
  onClearChatError,
  onDownload,
  onSendMessage,
  onCancelStreaming,
  messages,
  isStreaming,
}: ChatPanelProps) {
  const canRun = inspectionResult?.compat.canRun ?? true;

  if (!inspectionResult) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 animate-fadeIn">
        <Bot className="w-10 h-10 text-poster-text-sub/20" />
        <p className="text-sm text-poster-text-sub">Inspect a model first to enable chat</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Error */}
      {chatError && (
        <div className="p-4">
          <ErrorAlert
            message={chatError.message}
            onDismiss={onClearChatError}
            onRetry={onDownload}
          />
        </div>
      )}

      {/* Download or Chat */}
      {!isModelLoaded && !isDownloading ? (
        <DownloadSection
          inspectionResult={inspectionResult}
          downloadProgress={downloadProgress}
          isDownloading={isDownloading}
          canRun={canRun}
          onDownload={onDownload}
        />
      ) : isModelLoaded ? (
        <ChatInterface
          messages={messages}
          isStreaming={isStreaming}
          onSendMessage={onSendMessage}
          onCancelStreaming={onCancelStreaming}
        />
      ) : (
        <DownloadSection
          inspectionResult={inspectionResult}
          downloadProgress={downloadProgress}
          isDownloading={isDownloading}
          canRun={canRun}
          onDownload={onDownload}
        />
      )}
    </div>
  );
}
