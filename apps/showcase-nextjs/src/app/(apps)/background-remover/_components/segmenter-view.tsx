/**
 * @file segmenter-view.tsx
 * @description Main view for the background remover with before/after comparison
 */
'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Upload, Scissors, X, Download, ArrowLeft, Image } from 'lucide-react';
import { Button, IconBox, Spinner } from './ui';
import { ErrorBoundary, ErrorAlert } from './error-boundary';
import { useSegmenter } from '../_hooks/use-segmenter';
import { cn } from '../_lib/utils';
import { MODEL_CONFIG } from '../_lib/constants';

/** Main segmenter view with upload area and before/after comparison */
export function SegmenterView() {
  const {
    originalImage, processedImage, isProcessing, error,
    processImage, cancelProcessing, downloadProcessed, clearError, reset,
  } = useSegmenter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showOriginal, setShowOriginal] = useState(false);

  /** Handle file selection from input */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImage(file);
    }
  };

  /** Handle drag and drop */
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      processImage(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  return (
    <div className="h-[calc(100vh-4rem)] bg-poster-bg text-poster-text-main font-sans selection:bg-poster-primary/30 relative overflow-hidden">
      {/* Background grid */}
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
              <Scissors className="w-4 h-4" />
            </IconBox>
            <div>
              <h1 className="text-base font-semibold text-poster-text-main">Background Remover</h1>
              <p className="text-xs text-poster-text-sub">AI-powered background removal</p>
            </div>
            <span className="badge badge-sm bg-poster-surface-lighter border-poster-border/30 text-poster-text-sub ml-2 gap-1.5">
              SegFormer
              <span className="text-poster-accent-teal">&middot;</span>
              {MODEL_CONFIG.modelSize}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {processedImage && (
              <button
                onClick={downloadProcessed}
                className="btn btn-sm gap-2 bg-gradient-to-r from-poster-accent-teal to-poster-primary border-0 text-white shadow-lg shadow-poster-accent-teal/20 hover:shadow-poster-accent-teal/40 hover:brightness-110 transition-all duration-200"
              >
                <Download className="w-4 h-4" />
                Download PNG
              </button>
            )}
            {originalImage && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  reset();
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="hover:text-error transition-colors duration-200"
              >
                <X className="w-4 h-4 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Gradient accent line under header */}
        <div className="h-px bg-gradient-to-r from-transparent via-poster-accent-teal/40 to-transparent" />

        {/* Error alert */}
        {error && (
          <div className="px-6 pt-4">
            <ErrorAlert
              message={error.message}
              onDismiss={() => clearError()}
              onRetry={() => fileInputRef.current?.click()}
            />
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-5xl mx-auto">
            <ErrorBoundary>
              {!originalImage ? (
                /* Upload empty state */
                <div className="flex flex-col items-center justify-center min-h-[calc(100vh-14rem)] animate-fadeIn">
                  {/* Hero icon */}
                  <div className="relative mb-8">
                    <div className="absolute inset-0 bg-poster-accent-teal/10 rounded-full blur-2xl scale-150" />
                    <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-poster-accent-teal/20 to-poster-primary/10 flex items-center justify-center ring-1 ring-poster-accent-teal/20">
                      <Scissors className="w-10 h-10 text-poster-accent-teal" />
                    </div>
                  </div>

                  {/* Title and subtitle */}
                  <h2 className="text-2xl font-bold text-poster-text-main mb-2">Background Remover</h2>
                  <p className="text-sm text-poster-text-sub mb-8 text-center max-w-sm">
                    Remove backgrounds from any image using AI segmentation. Works entirely in your browser.
                  </p>

                  {/* Drop zone */}
                  <div
                    className={cn(
                      'group relative w-full max-w-lg border-2 border-dashed rounded-2xl p-12',
                      'flex flex-col items-center justify-center cursor-pointer',
                      'border-poster-border/30 hover:border-poster-accent-teal/50',
                      'bg-poster-surface/30 hover:bg-poster-surface/50',
                      'transition-all duration-300'
                    )}
                    onClick={() => fileInputRef.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                  >
                    {/* Subtle inner glow on hover */}
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-poster-accent-teal/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

                    <div className="relative flex flex-col items-center">
                      <div className="w-16 h-16 rounded-2xl bg-poster-surface-lighter border border-poster-border/20 flex items-center justify-center mb-5 group-hover:scale-105 group-hover:border-poster-accent-teal/30 transition-all duration-300">
                        <Image className="w-7 h-7 text-poster-text-sub group-hover:text-poster-accent-teal transition-colors duration-300" />
                      </div>
                      <p className="text-sm font-medium text-poster-text-main mb-1">
                        Drop an image here or click to upload
                      </p>
                      <p className="text-xs text-poster-text-sub">
                        Supports PNG, JPEG, and WebP
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                /* Before/After comparison */
                <div className="animate-fadeIn">
                  {processedImage && !isProcessing ? (
                    /* Side-by-side comparison cards */
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Original card */}
                      <div
                        className={cn(
                          'rounded-2xl overflow-hidden border transition-all duration-300',
                          showOriginal
                            ? 'border-poster-accent-teal/50 ring-2 ring-poster-accent-teal/20'
                            : 'border-poster-border/20 hover:border-poster-border/40'
                        )}
                        onClick={() => setShowOriginal(true)}
                      >
                        <div className="px-4 py-3 bg-poster-surface/80 border-b border-poster-border/20 flex items-center justify-between">
                          <span className="text-xs font-medium text-poster-text-sub uppercase tracking-wider">Original</span>
                          <div className={cn(
                            'w-2 h-2 rounded-full transition-colors duration-200',
                            showOriginal ? 'bg-poster-accent-teal' : 'bg-poster-border/40'
                          )} />
                        </div>
                        <div className="bg-poster-surface/40 p-4 flex items-center justify-center min-h-[300px]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={originalImage}
                            alt="Original image"
                            className="max-w-full max-h-[50vh] rounded-lg object-contain"
                          />
                        </div>
                      </div>

                      {/* Result card with checkerboard */}
                      <div
                        className={cn(
                          'rounded-2xl overflow-hidden border transition-all duration-300',
                          !showOriginal
                            ? 'border-poster-accent-teal/50 ring-2 ring-poster-accent-teal/20'
                            : 'border-poster-border/20 hover:border-poster-border/40'
                        )}
                        onClick={() => setShowOriginal(false)}
                      >
                        <div className="px-4 py-3 bg-poster-surface/80 border-b border-poster-border/20 flex items-center justify-between">
                          <span className="text-xs font-medium text-poster-text-sub uppercase tracking-wider">Result</span>
                          <div className={cn(
                            'w-2 h-2 rounded-full transition-colors duration-200',
                            !showOriginal ? 'bg-poster-accent-teal' : 'bg-poster-border/40'
                          )} />
                        </div>
                        <div
                          className="p-4 flex items-center justify-center min-h-[300px]"
                          style={{
                            backgroundImage: 'repeating-conic-gradient(#808080 0% 25%, transparent 0% 50%)',
                            backgroundSize: '16px 16px',
                          }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={processedImage}
                            alt="Background removed"
                            className="max-w-full max-h-[50vh] rounded-lg object-contain"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Single image view (processing or before result) */
                    <div className="flex justify-center">
                      <div className="relative rounded-2xl overflow-hidden border border-poster-border/20 inline-block max-w-3xl w-full">
                        <div className="px-4 py-3 bg-poster-surface/80 border-b border-poster-border/20">
                          <span className="text-xs font-medium text-poster-text-sub uppercase tracking-wider">
                            {isProcessing ? 'Processing...' : 'Original'}
                          </span>
                        </div>
                        <div className="bg-poster-surface/40 p-4 flex items-center justify-center min-h-[300px] relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={originalImage}
                            alt="Original image"
                            className={cn(
                              'max-w-full max-h-[55vh] rounded-lg object-contain transition-all duration-300',
                              isProcessing && 'brightness-50'
                            )}
                          />

                          {/* Processing overlay */}
                          {isProcessing && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              {/* Spinner ring */}
                              <div className="relative">
                                <div className="w-16 h-16 rounded-full border-4 border-poster-accent-teal/20" />
                                <div className="absolute inset-0 w-16 h-16 rounded-full border-4 border-transparent border-t-poster-accent-teal animate-spin" />
                                <Scissors className="absolute inset-0 m-auto w-6 h-6 text-white" />
                              </div>
                              <p className="text-white text-sm font-medium mt-4 drop-shadow-lg">
                                Removing background...
                              </p>
                              <button
                                onClick={cancelProcessing}
                                className="mt-3 text-xs text-white/70 hover:text-white underline underline-offset-2 transition-colors duration-200"
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </ErrorBoundary>
          </div>
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
