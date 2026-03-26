/**
 * @file enhancer-view.tsx
 * @description Main view for the photo enhancer with before/after comparison
 */
'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Upload, Wand2, X, Download, ArrowLeft, Image, Sparkles } from 'lucide-react';
import { Button, IconBox, Spinner } from './ui';
import { ErrorBoundary, ErrorAlert } from './error-boundary';
import { useEnhancer } from '../_hooks/use-enhancer';
import { cn } from '../_lib/utils';
import { MODEL_CONFIG } from '../_lib/constants';

/** Main enhancer view with upload area and before/after comparison */
export function EnhancerView() {
  const { originalImage, enhancedImage, isProcessing, error, processImage, cancelProcessing, downloadEnhanced, clearError, reset } = useEnhancer();
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
            <IconBox size="sm" variant="primary" className="bg-poster-accent-pink/10 text-poster-accent-pink ring-1 ring-poster-accent-pink/30">
              <Wand2 className="w-4 h-4" />
            </IconBox>
            <div>
              <h1 className="text-base font-semibold text-poster-text-main">Photo Enhancer</h1>
              <p className="text-xs text-poster-text-sub">Super Resolution</p>
            </div>
            <span className="badge badge-sm bg-poster-surface-lighter border-poster-border/30 text-poster-text-sub ml-2 gap-1.5">
              Swin2SR
              <span className="text-poster-accent-pink">&middot;</span>
              {MODEL_CONFIG.modelSize}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {enhancedImage && !isProcessing && (
              <span className="badge badge-sm bg-poster-accent-pink/10 border-poster-accent-pink/30 text-poster-accent-pink gap-1">
                <Sparkles className="w-3 h-3" />
                Enhanced 2x
              </span>
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
        <div className="h-px bg-gradient-to-r from-transparent via-poster-accent-pink/40 to-transparent" />

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
          <div className="max-w-6xl mx-auto">
            <ErrorBoundary>
              {!originalImage ? (
                /* Upload empty state */
                <div className="flex flex-col items-center justify-center min-h-[calc(100vh-14rem)] animate-fadeIn">
                  {/* Hero icon */}
                  <div className="relative mb-8">
                    <div className="absolute inset-0 bg-poster-accent-pink/10 rounded-full blur-2xl scale-150" />
                    <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-poster-accent-pink/20 to-poster-primary/10 flex items-center justify-center ring-1 ring-poster-accent-pink/20">
                      <Wand2 className="w-10 h-10 text-poster-accent-pink" />
                    </div>
                  </div>

                  {/* Title and subtitle */}
                  <h2 className="text-2xl font-bold text-poster-text-main mb-2">Photo Enhancer</h2>
                  <p className="text-sm text-poster-text-sub mb-8 text-center max-w-sm">
                    Upscale and enhance images using AI super resolution. Works entirely in your browser.
                  </p>

                  {/* Drop zone */}
                  <div
                    className={cn(
                      'group relative w-full max-w-lg border-2 border-dashed rounded-2xl p-12',
                      'flex flex-col items-center justify-center cursor-pointer',
                      'border-poster-border/30 hover:border-poster-accent-pink/50',
                      'bg-poster-surface/30 hover:bg-poster-surface/50',
                      'transition-all duration-300'
                    )}
                    onClick={() => fileInputRef.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                  >
                    {/* Subtle inner glow on hover */}
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-poster-accent-pink/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

                    <div className="relative flex flex-col items-center">
                      <div className="w-16 h-16 rounded-2xl bg-poster-surface-lighter border border-poster-border/20 flex items-center justify-center mb-5 group-hover:scale-105 group-hover:border-poster-accent-pink/30 transition-all duration-300">
                        <Image className="w-7 h-7 text-poster-text-sub group-hover:text-poster-accent-pink transition-colors duration-300" />
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
                /* Image loaded — show comparison or processing */
                <div className="animate-fadeIn">
                  {enhancedImage && !isProcessing ? (
                    /* Side-by-side comparison layout */
                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
                      {/* Left panel — Image preview */}
                      <div
                        className={cn(
                          'rounded-2xl overflow-hidden border transition-all duration-300',
                          'border-poster-border/20'
                        )}
                      >
                        <div className="px-4 py-3 bg-poster-surface/80 border-b border-poster-border/20 flex items-center justify-between">
                          <span className="text-xs font-medium text-poster-text-sub uppercase tracking-wider">
                            {showOriginal ? 'Original' : 'Enhanced'}
                          </span>
                          {!showOriginal && (
                            <span className="flex items-center gap-1 text-xs text-poster-accent-pink">
                              <Sparkles className="w-3 h-3" />
                              2x Super Resolution
                            </span>
                          )}
                        </div>
                        <div className="bg-poster-surface/40 p-4 flex items-center justify-center min-h-[400px]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={showOriginal ? originalImage : enhancedImage}
                            alt={showOriginal ? 'Original image' : 'Enhanced image'}
                            className="max-w-full max-h-[60vh] rounded-lg object-contain"
                          />
                        </div>
                      </div>

                      {/* Right panel — Controls */}
                      <div className="flex flex-col gap-4">
                        {/* Toggle buttons */}
                        <div className="rounded-2xl border border-poster-border/20 overflow-hidden bg-poster-surface/80">
                          <div className="px-4 py-3 border-b border-poster-border/20">
                            <span className="text-xs font-medium text-poster-text-sub uppercase tracking-wider">View</span>
                          </div>
                          <div className="p-4">
                            <div className="join w-full">
                              <button
                                className={cn(
                                  'join-item btn btn-sm flex-1',
                                  showOriginal
                                    ? 'btn-active bg-poster-surface-lighter border-poster-border/30'
                                    : 'btn-ghost'
                                )}
                                onClick={() => setShowOriginal(true)}
                              >
                                Original
                              </button>
                              <button
                                className={cn(
                                  'join-item btn btn-sm flex-1',
                                  !showOriginal
                                    ? 'btn-active bg-poster-accent-pink/10 border-poster-accent-pink/30 text-poster-accent-pink'
                                    : 'btn-ghost'
                                )}
                                onClick={() => setShowOriginal(false)}
                              >
                                <Sparkles className="w-3 h-3 mr-1" />
                                Enhanced
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Image info card */}
                        <div className="rounded-2xl border border-poster-border/20 overflow-hidden bg-poster-surface/80">
                          <div className="px-4 py-3 border-b border-poster-border/20">
                            <span className="text-xs font-medium text-poster-text-sub uppercase tracking-wider">Info</span>
                          </div>
                          <div className="p-4 space-y-3">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-poster-text-sub">Model</span>
                              <span className="text-poster-text-main font-mono text-xs">Swin2SR</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-poster-text-sub">Scale</span>
                              <span className="text-poster-text-main">2x</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-poster-text-sub">Status</span>
                              <span className="flex items-center gap-1.5 text-poster-accent-pink">
                                <span className="w-1.5 h-1.5 rounded-full bg-poster-accent-pink" />
                                Complete
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="space-y-2">
                          <button
                            onClick={downloadEnhanced}
                            className="btn btn-sm w-full gap-2 bg-gradient-to-r from-poster-accent-pink to-poster-primary border-0 text-white shadow-lg shadow-poster-accent-pink/20 hover:shadow-poster-accent-pink/40 hover:brightness-110 transition-all duration-200"
                          >
                            <Download className="w-4 h-4" />
                            Download Enhanced PNG
                          </button>
                          <button
                            onClick={() => {
                              reset();
                              if (fileInputRef.current) fileInputRef.current.value = '';
                            }}
                            className="btn btn-ghost btn-sm w-full gap-2 text-poster-text-sub hover:text-poster-text-main"
                          >
                            <Upload className="w-4 h-4" />
                            Upload New Image
                          </button>
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
                                <div className="w-16 h-16 rounded-full border-4 border-poster-accent-pink/20" />
                                <div className="absolute inset-0 w-16 h-16 rounded-full border-4 border-transparent border-t-poster-accent-pink animate-spin" />
                                <Wand2 className="absolute inset-0 m-auto w-6 h-6 text-white" />
                              </div>
                              <p className="text-white text-sm font-medium mt-4 drop-shadow-lg">
                                Enhancing image...
                              </p>
                              <p className="text-white/50 text-xs mt-1 drop-shadow-lg">
                                This may take a moment on first run
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
