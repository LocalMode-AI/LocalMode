/**
 * @file rag-view.tsx
 * @description Main view component for the LangChain RAG application.
 * Two-section layout: document ingestion panel and Q&A chat interface.
 */
'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  Database,
  Sparkles,
  Send,
  Trash2,
  ArrowLeft,
  FileText,
  Upload,
  User,
  Bot,
  BookOpen,
  Zap,
  Search,
  Square,
  HardDrive,
} from 'lucide-react';
import { Button, TextArea, IconBox, Spinner, Card } from './ui';
import { ErrorBoundary, ErrorAlert } from './error-boundary';
import { cn, formatScore } from '../_lib/utils';
import {
  EMBEDDING_MODEL_SIZE,
  LLM_MODEL_SIZE,
  SAMPLE_DOCUMENT,
  SAMPLE_QUESTIONS,
} from '../_lib/constants';
import { useRAG } from '../_hooks/use-rag';
import type { QAEntry, Source } from '../_lib/types';

/** Feature pill shown in empty state */
function FeaturePill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-poster-surface border border-poster-border/30 text-xs text-poster-text-sub">
      {icon}
      {label}
    </span>
  );
}

/** Rich empty state shown when no documents are ingested */
function EmptyState({ onLoadSample }: { onLoadSample: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 animate-fadeIn">
      {/* Gradient icon with glow */}
      <div className="relative mb-8">
        <div className="absolute inset-0 rounded-3xl bg-poster-accent-teal/20 blur-2xl animate-pulse-glow" />
        <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-poster-accent-teal to-poster-accent-teal/60 flex items-center justify-center shadow-lg shadow-poster-accent-teal/20">
          <Database className="w-10 h-10 text-white" />
        </div>
        <div className="absolute -top-1 -right-1">
          <Sparkles className="w-5 h-5 text-poster-accent-teal animate-float" />
        </div>
      </div>

      {/* Title and description */}
      <h2 className="text-2xl font-bold text-poster-text-main mb-2">LangChain RAG Pipeline</h2>
      <p className="text-sm text-poster-text-sub text-center max-w-md mb-6 leading-relaxed">
        Ingest documents, search by meaning, and get AI-generated answers with source citations
        — all running locally in your browser.
      </p>

      {/* Feature pills */}
      <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
        <FeaturePill icon={<Upload className="w-3.5 h-3.5 text-poster-accent-teal" />} label="Document Ingestion" />
        <FeaturePill icon={<Search className="w-3.5 h-3.5 text-poster-accent-teal" />} label="Semantic Search" />
        <FeaturePill icon={<Zap className="w-3.5 h-3.5 text-poster-accent-teal" />} label="LLM Generation" />
      </div>

      {/* Load sample CTA */}
      <button
        onClick={onLoadSample}
        className="btn btn-primary btn-md gap-2 shadow-lg shadow-poster-accent-teal/10 bg-poster-accent-teal hover:bg-poster-accent-teal/80 border-poster-accent-teal hover:border-poster-accent-teal/80 transition-all duration-300 hover:scale-105 cursor-pointer"
      >
        <Sparkles className="w-4 h-4" />
        Load Sample Document
      </button>
    </div>
  );
}

/** Source citation card */
function SourceCard({ source, index }: { source: Source; index: number }) {
  const confidencePercent = Math.round(source.score * 100);

  return (
    <div
      className={cn(
        'animate-fadeIn opacity-0 [animation-fill-mode:forwards]',
        'p-3 rounded-lg bg-poster-bg/50 border border-poster-border/20 text-xs'
      )}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="badge badge-xs bg-poster-accent-teal/10 text-poster-accent-teal border-poster-accent-teal/20 font-medium">
          Source {index + 1}
        </span>
        <span className="text-poster-text-sub/60">{formatScore(source.score)}</span>
        <div className="flex-1" />
        <div
          className="radial-progress text-[8px] font-bold text-poster-accent-teal"
          style={
            {
              '--value': confidencePercent,
              '--size': '1.5rem',
              '--thickness': '2px',
            } as React.CSSProperties
          }
          role="progressbar"
        >
          {confidencePercent}
        </div>
      </div>
      <p className="text-poster-text-sub leading-relaxed line-clamp-3">{source.text}</p>
    </div>
  );
}

/** Single Q&A entry in the chat history */
function QAEntryCard({ entry, index }: { entry: QAEntry; index: number }) {
  const [showSources, setShowSources] = useState(false);

  return (
    <div
      className="animate-fadeIn opacity-0 [animation-fill-mode:forwards]"
      style={{ animationDelay: `${index * 75}ms` }}
    >
      {/* User question — right-aligned */}
      <div className="chat chat-end">
        <div className="chat-image avatar">
          <div className="w-8 rounded-full flex items-center justify-center bg-poster-accent-teal/20 text-poster-accent-teal border border-white/5">
            <User className="w-4 h-4" />
          </div>
        </div>
        <div className="chat-header mb-0.5 text-poster-text-sub/60 text-xs">You</div>
        <div className="chat-bubble bg-poster-accent-teal text-white shadow-md">
          {entry.question}
        </div>
      </div>

      {/* Bot answer — left-aligned */}
      <div className="chat chat-start">
        <div className="chat-image avatar">
          <div className="w-8 rounded-full flex items-center justify-center bg-poster-surface text-poster-accent-teal border border-poster-border/30">
            <Bot className="w-4 h-4" />
          </div>
        </div>
        <div className="chat-header mb-0.5 text-poster-text-sub/60 text-xs">Assistant</div>
        <div className="chat-bubble bg-poster-surface text-poster-text-main border border-poster-border/30 shadow-md max-w-[85%]">
          <p className="leading-relaxed text-sm whitespace-pre-wrap">{entry.answer}</p>

          {/* Sources toggle */}
          {entry.sources.length > 0 && (
            <div className="mt-3 pt-2 border-t border-poster-border/20">
              <button
                onClick={() => setShowSources(!showSources)}
                className="flex items-center gap-1.5 text-xs text-poster-accent-teal hover:text-poster-accent-teal/80 transition-colors duration-200 cursor-pointer"
              >
                <BookOpen className="w-3 h-3" />
                {showSources ? 'Hide' : 'Show'} {entry.sources.length} {entry.sources.length === 1 ? 'source' : 'sources'}
              </button>

              {showSources && (
                <div className="flex flex-col gap-2 mt-2">
                  {entry.sources.map((source, i) => (
                    <SourceCard key={i} source={source} index={i} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Main RAG view component */
export function RAGView() {
  const {
    documentCount,
    entries,
    isIngesting,
    isAnswering,
    error,
    compressionStats,
    ingestText,
    askQuestion,
    cancel,
    clearError,
    clearAll,
  } = useRAG();

  const [docInput, setDocInput] = useState('');
  const [question, setQuestion] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const hasDocuments = documentCount > 0;
  const hasEntries = entries.length > 0;
  const isWorking = isIngesting || isAnswering;

  // Auto-scroll to latest entry
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  const handleLoadSample = () => {
    setDocInput(SAMPLE_DOCUMENT);
  };

  const handleIngest = () => {
    if (!docInput.trim()) return;
    ingestText(docInput);
    setDocInput('');
  };

  const handleAsk = () => {
    if (!question.trim() || !hasDocuments) return;
    askQuestion(question);
    setQuestion('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAsk();
    }
  };

  const handleSampleQuestion = (q: string) => {
    setQuestion(q);
  };

  const wordCount = docInput.trim() ? docInput.trim().split(/\s+/).length : 0;

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
            <IconBox size="sm" variant="primary" className="bg-poster-accent-teal/10 text-poster-accent-teal ring-1 ring-poster-accent-teal/30">
              <Database className="w-4 h-4" />
            </IconBox>
            <div>
              <h1 className="text-base font-semibold text-poster-text-main">LangChain RAG</h1>
              <p className="text-xs text-poster-text-sub">Retrieval-Augmented Generation</p>
            </div>
            <span className="badge badge-sm bg-poster-surface-lighter border-poster-border/30 text-poster-text-sub ml-2 gap-1.5">
              bge-small + Qwen3
              <span className="text-poster-accent-teal">&middot;</span>
              {EMBEDDING_MODEL_SIZE} + {LLM_MODEL_SIZE}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {hasDocuments && (
              <span className="badge badge-sm bg-poster-accent-teal/10 text-poster-accent-teal border-poster-accent-teal/20">
                {documentCount} {documentCount === 1 ? 'chunk' : 'chunks'}
              </span>
            )}
            {compressionStats && compressionStats.vectorCount > 0 && (
              <span className="badge badge-sm bg-poster-accent-purple/10 text-poster-accent-purple border-poster-accent-purple/20 gap-1">
                <HardDrive className="w-3 h-3" />
                {compressionStats.ratio.toFixed(1)}x &mdash; {compressionStats.originalSize} → {compressionStats.compressedSize}
              </span>
            )}
            {(hasDocuments || hasEntries) && (
              <Button variant="ghost" size="sm" onClick={clearAll} className="hover:text-error transition-colors duration-200">
                <Trash2 className="w-4 h-4 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Gradient accent line under header */}
        <div className="h-px bg-gradient-to-r from-transparent via-poster-accent-teal/40 to-transparent" />

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 flex flex-col">
          <div className="max-w-3xl mx-auto flex flex-col gap-4 flex-1 w-full">
            {/* Error */}
            {error && <ErrorAlert message={error.message} onDismiss={clearError} />}

            {/* Empty state */}
            {!hasDocuments && !hasEntries && !isIngesting && !docInput.trim() && (
              <EmptyState onLoadSample={handleLoadSample} />
            )}

            {/* Document ingestion section */}
            {(docInput.trim() || hasDocuments || isIngesting) && (
              <div className="animate-fadeIn">
                <div className="collapse collapse-arrow bg-poster-surface/50 border border-poster-border/30 rounded-xl">
                  <input type="checkbox" defaultChecked={!hasDocuments} />
                  <div className="collapse-title flex items-center gap-3 text-sm font-medium text-poster-text-main pr-12">
                    <FileText className="w-4 h-4 text-poster-accent-teal shrink-0" />
                    <span>Document Ingestion</span>
                    {hasDocuments && (
                      <span className="badge badge-sm bg-poster-accent-teal/10 text-poster-accent-teal border-poster-accent-teal/20 ml-auto mr-4">
                        {documentCount} chunks indexed
                      </span>
                    )}
                  </div>
                  <div className="collapse-content">
                    <TextArea
                      value={docInput}
                      onChange={(e) => setDocInput(e.target.value)}
                      placeholder="Paste a document to add to the knowledge base..."
                      rows={6}
                      disabled={isIngesting}
                    />
                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center gap-3">
                        {wordCount > 0 && (
                          <span className="text-xs text-poster-text-sub">
                            {wordCount.toLocaleString()} words
                          </span>
                        )}
                        <Button variant="ghost" size="xs" onClick={handleLoadSample} className="hover:text-poster-accent-teal transition-colors duration-200">
                          <Sparkles className="w-3 h-3 mr-1" />
                          Load Sample
                        </Button>
                      </div>
                      {isIngesting ? (
                        <Button variant="ghost" size="sm" onClick={cancel} className="hover:text-error transition-colors duration-200">
                          <Square className="w-4 h-4 mr-1" />
                          Stop
                        </Button>
                      ) : (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={handleIngest}
                          disabled={!docInput.trim()}
                          className="bg-poster-accent-teal hover:bg-poster-accent-teal/80 border-poster-accent-teal hover:border-poster-accent-teal/80 transition-all duration-300 hover:shadow-lg hover:shadow-poster-accent-teal/20 cursor-pointer disabled:opacity-40"
                        >
                          <Upload className="w-4 h-4 mr-1" />
                          Ingest
                        </Button>
                      )}
                    </div>

                    {/* Ingestion progress */}
                    {isIngesting && (
                      <div className="relative h-2 rounded-full overflow-hidden bg-poster-surface mt-3 animate-fadeIn">
                        <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-poster-accent-teal via-poster-primary to-poster-accent-teal bg-[length:200%_100%] animate-[shimmer_2s_linear_infinite] w-full" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Sample question pills (shown after ingestion) */}
                {hasDocuments && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    <span className="text-xs text-poster-text-sub/60 self-center mr-1">Try:</span>
                    {SAMPLE_QUESTIONS.map((q, i) => (
                      <button
                        key={q}
                        onClick={() => handleSampleQuestion(q)}
                        className={cn(
                          'text-xs px-3 py-1.5 rounded-full bg-poster-surface border border-poster-border/30 text-poster-text-sub',
                          'hover:text-poster-accent-teal hover:border-poster-accent-teal/40 hover:shadow-[0_0_12px_rgba(20,184,166,0.15)]',
                          'transition-all duration-300 cursor-pointer',
                          'animate-fadeIn opacity-0 [animation-fill-mode:forwards]'
                        )}
                        style={{ animationDelay: `${i * 100}ms` }}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Q&A chat history */}
            <ErrorBoundary>
              {hasEntries && (
                <div className="flex flex-col gap-1 mt-2">
                  {entries.map((entry, index) => (
                    <QAEntryCard key={entry.id} entry={entry} index={index} />
                  ))}

                  {/* Answering indicator */}
                  {isAnswering && (
                    <div className="chat chat-start animate-fadeIn">
                      <div className="chat-image avatar">
                        <div className="w-8 rounded-full flex items-center justify-center bg-poster-surface text-poster-accent-teal border border-poster-border/30">
                          <Bot className="w-4 h-4" />
                        </div>
                      </div>
                      <div className="chat-bubble bg-poster-surface text-poster-text-main border border-poster-border/30 shadow-md">
                        <span className="loading loading-dots loading-sm text-poster-accent-teal" />
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              )}
            </ErrorBoundary>

            {/* Spacer to push input to bottom when chat is short */}
            <div className="flex-1" />
          </div>
        </div>

        {/* Question input bar — pinned to bottom */}
        {hasDocuments && (
          <div className="border-t border-poster-border/30 bg-poster-surface/80 backdrop-blur-md px-6 py-4">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center gap-3">
                <div className="flex-1 flex items-center bg-poster-bg/80 border border-poster-border/30 rounded-full px-4 py-1 transition-all duration-300 focus-within:border-poster-accent-teal/50 focus-within:shadow-[0_0_20px_rgba(20,184,166,0.08)]">
                  <input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask a question about your documents..."
                    className="flex-1 bg-transparent text-sm text-poster-text-main placeholder:text-poster-text-sub/40 focus:outline-none py-2"
                    disabled={isAnswering}
                  />
                </div>
                {isAnswering ? (
                  <button
                    onClick={cancel}
                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-error/20 text-error hover:bg-error/30 transition-all duration-300 cursor-pointer"
                  >
                    <Square className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={handleAsk}
                    disabled={!question.trim() || isAnswering}
                    className={cn(
                      'w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all duration-300',
                      question.trim() && !isAnswering
                        ? 'bg-poster-accent-teal text-white shadow-lg shadow-poster-accent-teal/25 hover:bg-poster-accent-teal/80 hover:scale-105 cursor-pointer'
                        : 'bg-poster-surface text-poster-text-sub/30 cursor-not-allowed'
                    )}
                  >
                    <Send className="w-4 h-4" />
                  </button>
                )}
              </div>
              <p className="text-[10px] text-poster-text-sub/40 mt-2 text-center">
                Press Enter to ask &middot; Answers are generated from ingested documents only
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
