/**
 * @file qa-view.tsx
 * @description Main view component for the QA bot application.
 * Conversational chat UI with collapsible context, sample question pills, and confidence visualization.
 */
'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { Bot, Sparkles, Send, Trash2, ArrowLeft, User, FileText } from 'lucide-react';
import { Button, IconBox, Spinner } from './ui';
import { ErrorBoundary, ErrorAlert } from './error-boundary';
import { cn, formatScore } from '../_lib/utils';
import { MODEL_SIZE, SAMPLE_CONTEXT, SAMPLE_QUESTIONS } from '../_lib/constants';
import { useQA } from '../_hooks/use-qa';

/** Confidence color based on score threshold */
function getConfidenceColor(score: number) {
  if (score >= 0.8) return 'text-success';
  if (score >= 0.5) return 'text-warning';
  return 'text-error';
}

/** Confidence badge label */
function getConfidenceLabel(score: number) {
  if (score >= 0.8) return 'High';
  if (score >= 0.5) return 'Medium';
  return 'Low';
}

/** Rich empty state shown when no context is provided */
function EmptyState({ onLoadSample }: { onLoadSample: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 animate-fadeIn">
      {/* Gradient icon with glow */}
      <div className="relative mb-8">
        <div className="absolute inset-0 rounded-3xl bg-poster-primary/20 blur-2xl animate-pulse-glow" />
        <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-poster-primary to-poster-primary/60 flex items-center justify-center shadow-lg shadow-poster-primary/20">
          <Bot className="w-10 h-10 text-white" />
        </div>
        <div className="absolute -top-1 -right-1">
          <Sparkles className="w-5 h-5 text-poster-primary animate-float" />
        </div>
      </div>

      {/* Title and description */}
      <h2 className="text-2xl font-bold text-poster-text-main mb-2">Document Q&A</h2>
      <p className="text-sm text-poster-text-sub text-center max-w-md mb-8 leading-relaxed">
        Paste a document and ask questions — get precise answers with confidence scores,
        powered by a DistilBERT model running entirely in your browser.
      </p>

      {/* Feature pills */}
      <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-poster-surface border border-poster-border/30 text-xs text-poster-text-sub">
          <FileText className="w-3.5 h-3.5 text-poster-primary" />
          Context-based Answers
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-poster-surface border border-poster-border/30 text-xs text-poster-text-sub">
          <Sparkles className="w-3.5 h-3.5 text-poster-primary" />
          Confidence Scores
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-poster-surface border border-poster-border/30 text-xs text-poster-text-sub">
          <Bot className="w-3.5 h-3.5 text-poster-primary" />
          Offline Inference
        </span>
      </div>

      {/* Load sample CTA */}
      <button
        onClick={onLoadSample}
        className="btn btn-primary btn-md gap-2 shadow-lg shadow-poster-primary/10 bg-poster-primary hover:bg-poster-primary-dark border-poster-primary hover:border-poster-primary-dark transition-all duration-300 hover:scale-105 cursor-pointer"
      >
        <Sparkles className="w-4 h-4" />
        Load Sample Document
      </button>
    </div>
  );
}

/** Main view for the Document Q&A Bot */
export function QAView() {
  const [context, setContext] = useState('');
  const [question, setQuestion] = useState('');
  const { entries, isAnswering, error, askQuestion, clearError, clearEntries } = useQA();
  const chatEndRef = useRef<HTMLDivElement>(null);

  const handleLoadSample = () => {
    setContext(SAMPLE_CONTEXT);
  };

  const ask = () => {
    askQuestion(question, context);
    setQuestion('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      ask();
    }
  };

  const handleSampleQuestion = (q: string) => {
    setQuestion(q);
  };

  // Auto-scroll to latest chat entry
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  const wordCount = context.trim() ? context.trim().split(/\s+/).length : 0;
  const hasContext = context.trim().length > 0;

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
              <Bot className="w-4 h-4" />
            </IconBox>
            <div>
              <h1 className="text-base font-semibold text-poster-text-main">Document Q&A Bot</h1>
              <p className="text-xs text-poster-text-sub">Ask questions about documents</p>
            </div>
            <span className="badge badge-sm bg-poster-surface-lighter border-poster-border/30 text-poster-text-sub ml-2 gap-1.5">
              DistilBERT-SQuAD
              <span className="text-poster-primary">&middot;</span>
              {MODEL_SIZE}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {entries.length > 0 && (
              <span className="badge badge-sm badge-ghost text-poster-text-sub">
                {entries.length} {entries.length === 1 ? 'answer' : 'answers'}
              </span>
            )}
            {entries.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearEntries} className="hover:text-error transition-colors duration-200">
                <Trash2 className="w-4 h-4 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Gradient accent line under header */}
        <div className="h-px bg-gradient-to-r from-transparent via-poster-primary/40 to-transparent" />

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 flex flex-col">
          <div className="max-w-3xl mx-auto flex flex-col gap-4 flex-1 w-full">
            {error && <ErrorAlert message={error.message} onDismiss={clearError} onRetry={ask} />}

            {/* Empty state when no context */}
            {!hasContext && entries.length === 0 && !isAnswering && (
              <EmptyState onLoadSample={handleLoadSample} />
            )}

            {/* Context collapsible card */}
            {hasContext && (
              <div className="animate-fadeIn">
                <div className="collapse collapse-arrow bg-poster-surface/50 border border-poster-border/30 rounded-xl">
                  <input type="checkbox" defaultChecked />
                  <div className="collapse-title flex items-center gap-3 text-sm font-medium text-poster-text-main pr-12">
                    <FileText className="w-4 h-4 text-poster-primary shrink-0" />
                    <span>Document Context</span>
                    <span className="badge badge-sm bg-poster-primary/10 text-poster-primary border-poster-primary/20 ml-auto mr-4">
                      {wordCount.toLocaleString()} words
                    </span>
                  </div>
                  <div className="collapse-content">
                    <div className="relative">
                      <textarea
                        value={context}
                        onChange={(e) => setContext(e.target.value)}
                        placeholder="Paste a paragraph of text to ask questions about..."
                        className={cn(
                          'textarea textarea-bordered w-full min-h-[120px] bg-poster-bg/50 border-poster-border/20 text-poster-text-main placeholder:text-poster-text-sub/40 resize-none text-sm leading-relaxed',
                          'focus:border-poster-primary/50 focus:shadow-[inset_0_0_20px_rgba(59,130,246,0.05)] focus:outline-none',
                          'transition-all duration-300'
                        )}
                      />
                      <div className="flex items-center justify-end mt-2">
                        <Button variant="ghost" size="xs" onClick={handleLoadSample} className="hover:text-poster-primary transition-colors duration-200">
                          <Sparkles className="w-3 h-3 mr-1" />
                          Load Sample
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sample question pills */}
                {SAMPLE_QUESTIONS.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    <span className="text-xs text-poster-text-sub/60 self-center mr-1">Try:</span>
                    {SAMPLE_QUESTIONS.map((q, i) => (
                      <button
                        key={q}
                        onClick={() => handleSampleQuestion(q)}
                        className={cn(
                          'text-xs px-3 py-1.5 rounded-full bg-poster-surface border border-poster-border/30 text-poster-text-sub',
                          'hover:text-poster-primary hover:border-poster-primary/40 hover:shadow-[0_0_12px_rgba(59,130,246,0.15)]',
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

            {/* Chat history */}
            <ErrorBoundary>
              {entries.length > 0 && (
                <div className="flex flex-col gap-1 mt-2">
                  {[...entries].reverse().map((entry, index) => (
                    <div
                      key={entry.id}
                      className="animate-fadeIn opacity-0 [animation-fill-mode:forwards]"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      {/* User question — right-aligned */}
                      <div className="chat chat-end">
                        <div className="chat-image avatar">
                          <div className="w-8 rounded-full flex items-center justify-center bg-poster-primary/20 text-poster-primary border border-white/5">
                            <User className="w-4 h-4" />
                          </div>
                        </div>
                        <div className="chat-header mb-0.5 text-poster-text-sub/60 text-xs">You</div>
                        <div className="chat-bubble bg-poster-primary text-white shadow-md">
                          {entry.question}
                        </div>
                      </div>

                      {/* Bot answer — left-aligned */}
                      <div className="chat chat-start">
                        <div className="chat-image avatar">
                          <div className="w-8 rounded-full flex items-center justify-center bg-poster-surface text-poster-primary border border-poster-border/30">
                            <Bot className="w-4 h-4" />
                          </div>
                        </div>
                        <div className="chat-header mb-0.5 text-poster-text-sub/60 text-xs">Assistant</div>
                        <div className="chat-bubble bg-poster-surface text-poster-text-main border border-poster-border/30 shadow-md">
                          <p className="font-medium leading-relaxed">{entry.result.answer}</p>
                          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-poster-border/20">
                            {/* Confidence radial */}
                            <div
                              className={cn(
                                'radial-progress text-[10px] font-bold',
                                getConfidenceColor(entry.result.score)
                              )}
                              style={
                                {
                                  '--value': Math.round(entry.result.score * 100),
                                  '--size': '2rem',
                                  '--thickness': '2px',
                                } as React.CSSProperties
                              }
                              role="progressbar"
                            >
                              {Math.round(entry.result.score * 100)}
                            </div>
                            <span
                              className={cn(
                                'badge badge-xs font-medium',
                                entry.result.score >= 0.8
                                  ? 'badge-success badge-outline'
                                  : entry.result.score >= 0.5
                                    ? 'badge-warning badge-outline'
                                    : 'badge-error badge-outline'
                              )}
                            >
                              {getConfidenceLabel(entry.result.score)} confidence
                            </span>
                            <span className="text-[10px] text-poster-text-sub/50 ml-auto">
                              {formatScore(entry.result.score)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Answering indicator */}
                  {isAnswering && (
                    <div className="chat chat-start animate-fadeIn">
                      <div className="chat-image avatar">
                        <div className="w-8 rounded-full flex items-center justify-center bg-poster-surface text-poster-primary border border-poster-border/30">
                          <Bot className="w-4 h-4" />
                        </div>
                      </div>
                      <div className="chat-bubble bg-poster-surface text-poster-text-main border border-poster-border/30 shadow-md">
                        <span className="loading loading-dots loading-sm text-poster-primary" />
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

        {/* Chat input bar — pinned to bottom */}
        {hasContext && (
          <div className="border-t border-poster-border/30 bg-poster-surface/80 backdrop-blur-md px-6 py-4">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center gap-3">
                <div className="flex-1 flex items-center bg-poster-bg/80 border border-poster-border/30 rounded-full px-4 py-1 transition-all duration-300 focus-within:border-poster-primary/50 focus-within:shadow-[0_0_20px_rgba(59,130,246,0.08)]">
                  <input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask a question about the document..."
                    className="flex-1 bg-transparent text-sm text-poster-text-main placeholder:text-poster-text-sub/40 focus:outline-none py-2"
                    disabled={isAnswering || !hasContext}
                  />
                </div>
                <button
                  onClick={ask}
                  disabled={!question.trim() || !hasContext || isAnswering}
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all duration-300',
                    question.trim() && hasContext && !isAnswering
                      ? 'bg-poster-primary text-white shadow-lg shadow-poster-primary/25 hover:bg-poster-primary-dark hover:scale-105 cursor-pointer'
                      : 'bg-poster-surface text-poster-text-sub/30 cursor-not-allowed'
                  )}
                >
                  {isAnswering ? (
                    <Spinner size="sm" className="text-white" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
              <p className="text-[10px] text-poster-text-sub/40 mt-2 text-center">
                Press Enter to ask
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
