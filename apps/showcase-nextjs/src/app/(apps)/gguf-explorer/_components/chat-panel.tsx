/**
 * @file chat-panel.tsx
 * @description Chat tab: download model and chat with it via wllama
 */
'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Download,
  Send,
  ImagePlus,
  Square,
  Bot,
  User,
  AlertTriangle,
  MessageSquare,
  Braces,
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
  /** Send a chat message with optional image and JSON mode */
  onSendMessage: (text: string, images?: Array<{ data: string; mimeType: string }>, jsonMode?: boolean) => void;
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

/** Extract displayable text from message content (handles both string and ContentPart[]) */
function getDisplayContent(content: ChatMessage['content']): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((p) => p.type === 'text')
      .map((p) => (p as { type: 'text'; text: string }).text)
      .join('\n');
  }
  return '';
}

/** Check if content includes an image part */
function hasImageContent(content: ChatMessage['content']): boolean {
  return Array.isArray(content) && content.some((p) => p.type === 'image');
}

/** Single chat message bubble */
function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const text = getDisplayContent(message.content);
  const hasImage = hasImageContent(message.content);

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
        {hasImage && (
          <span className="badge badge-sm badge-info gap-1 mb-1">
            <ImagePlus className="w-3 h-3" />
            Image
          </span>
        )}
        {text || (
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
  onSendMessage: (text: string, images?: Array<{ data: string; mimeType: string }>, jsonMode?: boolean) => void;
  onCancelStreaming: () => void;
}) {
  const [input, setInput] = useState('');
  const [pendingImage, setPendingImage] = useState<{ data: string; mimeType: string } | null>(null);
  const [jsonMode, setJsonMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    const images = pendingImage ? [pendingImage] : undefined;
    onSendMessage(trimmed, images, jsonMode);
    setInput('');
    setPendingImage(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      setPendingImage({ data: base64, mimeType: file.type });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
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

      {/* Status badges */}
      {(pendingImage || jsonMode) && (
        <div className="px-4 pb-2 flex items-center gap-2">
          {pendingImage && (
            <>
              <div className="badge badge-info gap-1 text-xs">
                <ImagePlus className="w-3 h-3" />
                Image attached
              </div>
              <button onClick={() => setPendingImage(null)} className="text-xs text-poster-text-sub hover:text-error cursor-pointer">Remove</button>
            </>
          )}
          {jsonMode && (
            <div className="badge badge-warning gap-1 text-xs">
              <Braces className="w-3 h-3" />
              JSON mode
            </div>
          )}
        </div>
      )}

      {/* Input */}
      <div className="border-t border-poster-border/20 p-4 bg-poster-surface/50">
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
          <Button
            variant="ghost"
            size="md"
            onClick={() => fileInputRef.current?.click()}
            disabled={isStreaming}
            className="cursor-pointer"
            title="Attach image"
          >
            <ImagePlus className="w-4 h-4" />
          </Button>
          <Button
            variant={jsonMode ? 'primary' : 'ghost'}
            size="md"
            onClick={() => setJsonMode(!jsonMode)}
            disabled={isStreaming}
            className="cursor-pointer"
            title={jsonMode ? 'JSON mode ON — responses constrained to valid JSON' : 'Enable JSON mode'}
          >
            <Braces className="w-4 h-4" />
          </Button>
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
