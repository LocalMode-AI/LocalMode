/**
 * @file ocr-view.tsx
 * @description Main view component for the OCR scanner application with
 * document-scanner aesthetic — paper card, scan-line animation, and code-editor text output
 */
'use client';

import { useRef, useState } from 'react';
import { ScanText, Upload, Trash2, Copy, Check, ArrowLeft, FileText } from 'lucide-react';
import { Button, IconBox, Spinner, Badge } from './ui';
import { ErrorBoundary, ErrorAlert } from './error-boundary';
import { cn } from '../_lib/utils';
import { MODEL_SIZE } from '../_lib/constants';
import { useOCR } from '../_hooks/use-ocr';

export function OCRView() {
  const { imageDataUrl, extractedText, isProcessing, error, processFile, clearError, reset } = useOCR();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(extractedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /** Split extracted text into lines for line-numbered display */
  const textLines = extractedText ? extractedText.split('\n') : [];
  const wordCount = extractedText ? extractedText.trim().split(/\s+/).filter(Boolean).length : 0;

  return (
    <div className="h-[calc(100vh-4rem)] bg-poster-bg flex flex-col relative overflow-hidden">
      <div className="bg-grid fixed inset-0 z-0 pointer-events-none opacity-50" />

      <div className="relative z-10 flex flex-col h-full">
        {/* Header */}
        <header className="h-16 min-h-16 border-b border-poster-border/20 flex items-center justify-between px-6 bg-poster-surface/80 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <button
              onClick={() => window.history.back()}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-poster-text-sub hover:text-poster-text-main hover:bg-poster-surface-lighter/60 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="w-px h-6 bg-poster-border/30" />
            <IconBox size="sm" variant="primary" className="!bg-poster-accent-orange/10 !text-poster-accent-orange !ring-poster-accent-orange/30">
              <ScanText className="w-4 h-4" />
            </IconBox>
            <div>
              <h1 className="text-base font-semibold text-poster-text-main">OCR Scanner</h1>
              <p className="text-xs text-poster-text-sub">Extract text from images</p>
            </div>
            <Badge variant="ghost" size="sm" className="ml-2 text-poster-accent-orange border-poster-accent-orange/30 bg-poster-accent-orange/5">
              TrOCR &middot; {MODEL_SIZE}
            </Badge>
          </div>
          {imageDataUrl && (
            <Button variant="ghost" size="sm" onClick={reset}>
              <Trash2 className="w-4 h-4 mr-1.5" />
              Reset
            </Button>
          )}
        </header>

        {/* Main content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-6xl mx-auto flex flex-col gap-6">
            {error && <ErrorAlert message={error.message} onDismiss={clearError} />}

            {/* Empty state — upload zone */}
            {!imageDataUrl && (
              <div className="flex flex-col items-center justify-center min-h-[60vh]">
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    'group relative flex flex-col items-center justify-center gap-6 w-full max-w-lg p-16',
                    'rounded-2xl border-2 border-dashed border-poster-border/30',
                    'hover:border-poster-accent-orange/50 hover:bg-poster-accent-orange/[0.02]',
                    'cursor-pointer transition-all duration-300'
                  )}
                >
                  {/* Scan icon with animated scan-line */}
                  <div className="relative">
                    <div className="w-20 h-20 rounded-2xl bg-poster-accent-orange/10 flex items-center justify-center ring-1 ring-poster-accent-orange/20 group-hover:ring-poster-accent-orange/40 transition-all duration-300 group-hover:scale-105">
                      <ScanText className="w-10 h-10 text-poster-accent-orange" />
                    </div>
                    {/* Animated scan line across the icon */}
                    <div
                      className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-poster-accent-orange to-transparent opacity-60"
                      style={{ animation: 'scanLine 2.5s ease-in-out infinite' }}
                    />
                  </div>

                  <div className="text-center space-y-2">
                    <h2 className="text-xl font-semibold text-poster-text-main">OCR Scanner</h2>
                    <p className="text-sm text-poster-text-sub leading-relaxed max-w-xs">
                      Extract text from images and scanned documents
                    </p>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-poster-text-sub/50">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Drop an image or click to upload</span>
                  </div>

                  <p className="text-[11px] text-poster-text-sub/30">
                    JPEG, PNG, WebP up to 10MB
                  </p>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
              </div>
            )}

            {/* Side-by-side: Source image + Extracted text */}
            <ErrorBoundary>
              {imageDataUrl && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fadeIn">
                  {/* Left panel — Source image as "paper" document */}
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2 px-1">
                      <FileText className="w-4 h-4 text-poster-text-sub" />
                      <span className="text-sm font-medium text-poster-text-main">Source Document</span>
                    </div>
                    <div className="relative group">
                      {/* Paper card with subtle rotation for document feel */}
                      <div
                        className={cn(
                          'relative rounded-xl overflow-hidden',
                          'bg-white/[0.03] border border-poster-border/20',
                          'shadow-[0_8px_32px_rgba(0,0,0,0.3),0_2px_8px_rgba(0,0,0,0.2)]',
                          'transform rotate-[0.3deg] hover:rotate-0 transition-transform duration-500'
                        )}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imageDataUrl}
                          alt="Source document"
                          className="w-full h-auto"
                        />

                        {/* Scanning overlay while processing */}
                        {isProcessing && (
                          <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px]">
                            {/* Animated scan line */}
                            <div
                              className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-poster-accent-orange to-transparent shadow-[0_0_12px_rgba(249,115,22,0.6)]"
                              style={{ animation: 'scanLineVertical 2s ease-in-out infinite' }}
                            />
                          </div>
                        )}
                      </div>

                      {/* Processing indicator below image */}
                      {isProcessing && (
                        <div className="flex items-center justify-center gap-2.5 mt-4 text-poster-accent-orange">
                          <Spinner size="sm" className="text-poster-accent-orange" />
                          <span className="text-sm font-medium">Extracting text...</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right panel — Extracted text with line numbers */}
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between px-1">
                      <div className="flex items-center gap-2">
                        <ScanText className="w-4 h-4 text-poster-text-sub" />
                        <span className="text-sm font-medium text-poster-text-main">Extracted Text</span>
                        {extractedText && (
                          <span className="text-xs text-poster-text-sub/60 ml-1">
                            {wordCount} word{wordCount !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      {extractedText && (
                        <button
                          onClick={handleCopy}
                          className={cn(
                            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
                            copied
                              ? 'bg-green-500/10 text-green-400 ring-1 ring-green-500/30'
                              : 'bg-poster-surface-lighter/50 text-poster-text-sub hover:text-poster-text-main hover:bg-poster-surface-lighter/80 ring-1 ring-poster-border/20'
                          )}
                        >
                          {copied ? (
                            <Check className="w-3.5 h-3.5" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          {copied ? 'Copied!' : 'Copy'}
                        </button>
                      )}
                    </div>

                    {/* Text output area styled like a code editor */}
                    <div
                      className={cn(
                        'flex-1 min-h-[300px] rounded-xl overflow-hidden',
                        'bg-poster-surface/80 border border-poster-border/20',
                        'shadow-[0_4px_16px_rgba(0,0,0,0.15)]'
                      )}
                    >
                      {/* Editor-like title bar */}
                      <div className="flex items-center gap-1.5 px-4 py-2.5 bg-poster-surface-lighter/30 border-b border-poster-border/15">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500/40" />
                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/40" />
                        <div className="w-2.5 h-2.5 rounded-full bg-green-500/40" />
                        <span className="ml-3 text-[11px] text-poster-text-sub/40 font-mono">
                          output.txt
                        </span>
                      </div>

                      {/* Text content with line numbers */}
                      <div className="overflow-auto max-h-[60vh]">
                        {isProcessing ? (
                          <div className="flex flex-col items-center justify-center py-20 gap-3">
                            <Spinner size="lg" className="text-poster-accent-orange" />
                            <span className="text-sm text-poster-text-sub">Processing document...</span>
                          </div>
                        ) : textLines.length > 0 ? (
                          <div className="flex font-mono text-sm leading-7">
                            {/* Line numbers gutter */}
                            <div className="select-none shrink-0 py-3 pr-4 text-right border-r border-poster-border/10 bg-poster-surface-lighter/10">
                              {textLines.map((_, i) => (
                                <div
                                  key={i}
                                  className="px-3 text-xs text-poster-text-sub/25 leading-7"
                                >
                                  {i + 1}
                                </div>
                              ))}
                            </div>
                            {/* Text content */}
                            <pre className="flex-1 py-3 px-4 whitespace-pre-wrap text-poster-text-main/90 leading-7 text-sm">
                              {extractedText}
                            </pre>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-20 gap-2 text-poster-text-sub/30">
                            <ScanText className="w-8 h-8" />
                            <p className="text-sm italic">Extracted text will appear here...</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </ErrorBoundary>
          </div>
        </div>
      </div>

    </div>
  );
}
