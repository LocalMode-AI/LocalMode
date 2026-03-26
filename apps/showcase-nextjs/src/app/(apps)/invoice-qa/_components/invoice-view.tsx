/**
 * @file invoice-view.tsx
 * @description Main view for the invoice QA application with document upload and chat-like Q&A
 */
'use client';

import { useState, useRef } from 'react';
import { Upload, FileQuestion, X, Send, User, Bot, Receipt, ArrowLeft } from 'lucide-react';
import { Button, Spinner } from './ui';
import { ErrorBoundary, ErrorAlert } from './error-boundary';
import { useDocumentQA } from '../_hooks/use-document-qa';
import { cn, formatScore } from '../_lib/utils';
import { MODEL_CONFIG, EXAMPLE_QUESTIONS } from '../_lib/constants';

/** Main invoice QA view with document preview and chat-like Q&A */
export function InvoiceView() {
  const [question, setQuestion] = useState('');
  const { imageDataUrl, answers, isAnswering, error, uploadImage, submitQuestion, cancelQuestion, clearError, reset } = useDocumentQA();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /** Handle file selection from input */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadImage(file);
    }
  };

  /** Handle drag and drop */
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      uploadImage(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  /** Handle question submission */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (question.trim() && !isAnswering) {
      submitQuestion(question);
      setQuestion('');
    }
  };

  /** Handle clicking an example question */
  const handleExampleClick = (exampleQuestion: string) => {
    setQuestion(exampleQuestion);
    inputRef.current?.focus();
  };

  return (
    <div className="h-[calc(100vh-4rem)] bg-poster-bg text-poster-text-main font-sans selection:bg-poster-accent-orange/30 relative overflow-hidden">
      {/* Background grid */}
      <div className="bg-grid fixed inset-0 z-0 pointer-events-none opacity-50" />

      <div className="relative z-10 flex flex-col h-full">
        {/* Header */}
        <div className="h-14 min-h-14 border-b border-poster-border/20 flex items-center justify-between px-5 bg-poster-surface/60 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <a
              href="/"
              className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-poster-surface-lighter/50 text-poster-text-sub hover:text-poster-text-main transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </a>
            <div className="w-px h-5 bg-poster-border/20" />
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-poster-accent-orange/15 flex items-center justify-center ring-1 ring-poster-accent-orange/30">
                <Receipt className="w-4 h-4 text-poster-accent-orange" />
              </div>
              <div>
                <h1 className="text-sm font-semibold text-poster-text-main leading-tight">Invoice Q&A</h1>
                <p className="text-[11px] text-poster-text-sub/60 leading-tight">Ask questions about documents</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-md bg-poster-accent-orange/10 text-[11px] font-medium text-poster-accent-orange border border-poster-accent-orange/20">
              Donut {MODEL_CONFIG.modelSize}
            </span>
            {imageDataUrl && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  reset();
                  setQuestion('');
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
              >
                <X className="w-3 h-3 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Error alert */}
        {error && (
          <div className="px-6 pt-4">
            <ErrorAlert
              message={error.message}
              onDismiss={clearError}
            />
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 overflow-hidden">
          <ErrorBoundary>
            {!imageDataUrl ? (
              /* Upload empty state */
              <div className="h-full flex items-center justify-center p-8">
                <div
                  className="group relative border-2 border-dashed border-poster-border/30 rounded-2xl p-16 flex flex-col items-center justify-center max-w-xl w-full cursor-pointer hover:border-poster-accent-orange/40 transition-all duration-300 hover:bg-poster-accent-orange/[0.02]"
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                >
                  {/* Upload icon */}
                  <div className="w-20 h-20 rounded-2xl bg-poster-accent-orange/10 flex items-center justify-center ring-1 ring-poster-accent-orange/20 mb-6 group-hover:scale-105 transition-transform duration-300">
                    <Receipt className="w-10 h-10 text-poster-accent-orange" />
                  </div>
                  <h2 className="text-2xl font-bold text-poster-text-main mb-2">Invoice Q&A</h2>
                  <p className="text-sm text-poster-text-sub/70 mb-6 text-center max-w-sm">
                    Upload invoices and ask questions about them using AI document understanding
                  </p>

                  {/* Upload button area */}
                  <div className="flex flex-col items-center gap-3">
                    <div className="btn btn-md gap-2 bg-poster-accent-orange/15 border border-poster-accent-orange/25 text-poster-accent-orange hover:bg-poster-accent-orange/25 transition-colors">
                      <Upload className="w-4 h-4" />
                      Choose File
                    </div>
                    <p className="text-[11px] text-poster-text-sub/40">
                      or drag and drop -- PNG, JPEG, WebP
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              /* Split layout: Document + Q&A */
              <div className="flex h-full">
                {/* Left: Document preview */}
                <div className="w-1/2 border-r border-poster-border/20 overflow-auto p-5 bg-poster-bg">
                  <div className="card bg-poster-surface border border-poster-border/20 shadow-xl overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imageDataUrl}
                      alt="Uploaded document"
                      className="w-full h-auto"
                    />
                  </div>
                </div>

                {/* Right: Q&A panel */}
                <div className="w-1/2 flex flex-col bg-poster-bg/50">
                  {/* Chat area */}
                  <div className="flex-1 overflow-auto p-5 space-y-4">
                    {/* Empty Q&A state */}
                    {answers.length === 0 && !isAnswering && (
                      <div className="flex flex-col items-center py-10 animate-in fade-in duration-500">
                        <div className="w-14 h-14 rounded-2xl bg-poster-accent-orange/10 flex items-center justify-center ring-1 ring-poster-accent-orange/20 mb-4">
                          <FileQuestion className="w-7 h-7 text-poster-accent-orange" />
                        </div>
                        <p className="text-sm font-semibold text-poster-text-main mb-1">
                          Ask about your document
                        </p>
                        <p className="text-xs text-poster-text-sub/50 mb-5 text-center">
                          The AI will analyze the document to find answers
                        </p>

                        {/* Example question pills */}
                        <div className="flex flex-wrap gap-2 justify-center max-w-sm">
                          {EXAMPLE_QUESTIONS.map((eq) => (
                            <button
                              key={eq}
                              onClick={() => handleExampleClick(eq)}
                              className={cn(
                                'px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200',
                                'bg-poster-accent-orange/8 text-poster-accent-orange/80 border border-poster-accent-orange/15',
                                'hover:bg-poster-accent-orange/15 hover:text-poster-accent-orange hover:border-poster-accent-orange/30',
                                'active:scale-95'
                              )}
                            >
                              {eq}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Q&A entries using daisyUI chat bubbles */}
                    {answers.map((entry, index) => (
                      <div
                        key={entry.id}
                        className="animate-in fade-in slide-in-from-bottom-2 duration-300"
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        {/* User question */}
                        <div className="chat chat-end">
                          <div className="chat-image avatar">
                            <div className="w-8 rounded-full bg-poster-accent-orange/15 flex items-center justify-center ring-1 ring-poster-accent-orange/25">
                              <User className="w-3.5 h-3.5 text-poster-accent-orange" />
                            </div>
                          </div>
                          <div className="chat-bubble bg-poster-accent-orange/15 text-poster-text-main text-sm">
                            {entry.question}
                          </div>
                        </div>

                        {/* AI answer */}
                        <div className="chat chat-start">
                          <div className="chat-image avatar">
                            <div className="w-8 rounded-full bg-poster-accent-teal/15 flex items-center justify-center ring-1 ring-poster-accent-teal/25">
                              <Bot className="w-3.5 h-3.5 text-poster-accent-teal" />
                            </div>
                          </div>
                          <div className="chat-bubble bg-poster-surface border border-poster-border/20 text-poster-text-main text-sm">
                            <p className="font-medium">{entry.answer}</p>
                            <div className={cn(
                              'badge badge-sm mt-2',
                              entry.score >= 0.8
                                ? 'badge-success'
                                : entry.score >= 0.5
                                  ? 'badge-warning'
                                  : 'badge-ghost'
                            )}>
                              {formatScore(entry.score)} confidence
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Answering indicator */}
                    {isAnswering && (
                      <div className="chat chat-start animate-in fade-in duration-200">
                        <div className="chat-image avatar">
                          <div className="w-8 rounded-full bg-poster-accent-teal/15 flex items-center justify-center ring-1 ring-poster-accent-teal/25">
                            <Bot className="w-3.5 h-3.5 text-poster-accent-teal" />
                          </div>
                        </div>
                        <div className="chat-bubble bg-poster-surface border border-poster-border/20">
                          <div className="flex items-center gap-2">
                            <Spinner size="sm" className="text-poster-accent-orange" />
                            <span className="text-sm text-poster-text-sub">Analyzing document...</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Question input */}
                  <form
                    onSubmit={handleSubmit}
                    className="p-4 border-t border-poster-border/20 bg-poster-surface/40 backdrop-blur-sm"
                  >
                    <div className="flex gap-2">
                      <input
                        ref={inputRef}
                        type="text"
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        placeholder="Ask a question about the document..."
                        className={cn(
                          'input input-bordered flex-1 bg-black/20 text-poster-text-main',
                          'placeholder:text-poster-text-sub/40 focus:border-poster-accent-orange/50',
                          'border-poster-border/20'
                        )}
                        disabled={isAnswering}
                      />
                      {isAnswering ? (
                        <Button variant="ghost" size="md" onClick={cancelQuestion}>
                          <X className="w-4 h-4" />
                        </Button>
                      ) : (
                        <button
                          type="submit"
                          disabled={!question.trim()}
                          className={cn(
                            'btn btn-md text-white',
                            'bg-poster-accent-orange hover:bg-poster-accent-orange/90',
                            'disabled:opacity-30 disabled:cursor-not-allowed'
                          )}
                        >
                          <Send className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </form>
                </div>
              </div>
            )}
          </ErrorBoundary>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    </div>
  );
}
