/**
 * @file captioner-view.tsx
 * @description Main view component for the image captioner application.
 * Photo gallery/portfolio design with elegant image cards, gradient caption overlays, and hover interactions.
 */
'use client';

import { useRef } from 'react';
import Link from 'next/link';
import {
  Upload,
  Trash2,
  Copy,
  Check,
  X,
  ArrowLeft,
  Camera,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import { Button, IconBox, Spinner } from './ui';
import { ErrorBoundary, ErrorAlert } from './error-boundary';
import { cn } from '../_lib/utils';
import { MODEL_SIZE } from '../_lib/constants';
import { useCaptioner } from '../_hooks/use-captioner';

/** Main captioner view */
export function CaptionerView() {
  const { images, isProcessing, error, captionFile, removeImage, clearAll, clearError } = useCaptioner();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) captionFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) captionFile(file);
  };

  const handleCopy = async (id: string, caption: string) => {
    await navigator.clipboard.writeText(caption);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

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
            <IconBox size="sm" variant="primary" className="bg-poster-accent-purple/10 text-poster-accent-purple ring-1 ring-poster-accent-purple/30">
              <Camera className="w-4 h-4" />
            </IconBox>
            <div>
              <h1 className="text-base font-semibold text-poster-text-main">Image Captioner</h1>
              <p className="text-xs text-poster-text-sub">Generate alt-text and captions for images</p>
            </div>
            <span className="badge badge-sm bg-poster-surface-lighter border-poster-border/30 text-poster-text-sub ml-2 gap-1.5">
              ViT-GPT2
              <span className="text-poster-accent-purple">&middot;</span>
              {MODEL_SIZE}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {images.length > 0 && (
              <span className="badge badge-sm badge-ghost text-poster-text-sub">
                {images.length} {images.length === 1 ? 'image' : 'images'} captioned
              </span>
            )}
            {images.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearAll} className="hover:text-error transition-colors duration-200">
                <Trash2 className="w-4 h-4 mr-1" />
                Clear All
              </Button>
            )}
          </div>
        </div>

        {/* Gradient accent line under header */}
        <div className="h-px bg-gradient-to-r from-transparent via-poster-accent-purple/40 to-transparent" />

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-5xl mx-auto flex flex-col gap-6">
            {error && <ErrorAlert message={error.message} onDismiss={clearError} />}

            {/* Upload area — elegant drop zone */}
            {!isProcessing && (
              <div
                onDrop={handleDrop}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'group relative flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-500 overflow-hidden',
                  images.length === 0 ? 'py-20' : 'py-8',
                  isDragOver
                    ? 'border-poster-accent-purple/60 bg-poster-accent-purple/10 scale-[1.01]'
                    : 'border-poster-border/30 hover:border-poster-accent-purple/40 hover:bg-poster-surface/30'
                )}
              >
                {/* Gradient hover glow */}
                <div className={cn(
                  'absolute inset-0 bg-gradient-to-br from-poster-accent-purple/5 via-transparent to-poster-accent-pink/5 opacity-0 transition-opacity duration-500',
                  isDragOver ? 'opacity-100' : 'group-hover:opacity-100'
                )} />

                <div className="relative">
                  {images.length === 0 ? (
                    <>
                      {/* Large empty state */}
                      <div className="relative mb-4 mx-auto w-fit">
                        <div className="absolute inset-0 rounded-3xl bg-poster-accent-purple/20 blur-2xl animate-pulse-glow" />
                        <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-poster-accent-purple to-poster-accent-purple/60 flex items-center justify-center shadow-lg shadow-poster-accent-purple/20">
                          <Camera className="w-10 h-10 text-white" />
                        </div>
                        <div className="absolute -top-1 -right-1">
                          <Sparkles className="w-5 h-5 text-poster-accent-purple animate-float" />
                        </div>
                      </div>
                      <p className="text-lg font-semibold text-poster-text-main text-center mb-1">
                        Drop images here or click to browse
                      </p>
                      <p className="text-sm text-poster-text-sub text-center mb-4">
                        Generate beautiful, descriptive captions for your images
                      </p>
                      <div className="flex items-center justify-center gap-2">
                        <span className="badge badge-sm bg-poster-surface border-poster-border/30 text-poster-text-sub/70">JPEG</span>
                        <span className="badge badge-sm bg-poster-surface border-poster-border/30 text-poster-text-sub/70">PNG</span>
                        <span className="badge badge-sm bg-poster-surface border-poster-border/30 text-poster-text-sub/70">WebP</span>
                        <span className="badge badge-sm bg-poster-surface border-poster-border/30 text-poster-text-sub/70">GIF</span>
                        <span className="text-xs text-poster-text-sub/40 ml-1">up to 10MB</span>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Compact upload trigger when images exist */}
                      <Upload className={cn(
                        'w-6 h-6 transition-colors duration-300',
                        isDragOver ? 'text-poster-accent-purple' : 'text-poster-text-sub/40 group-hover:text-poster-accent-purple/70'
                      )} />
                      <p className="text-sm text-poster-text-sub group-hover:text-poster-text-main transition-colors duration-300">
                        Add another image
                      </p>
                    </>
                  )}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            )}

            {/* Processing state — shows currently processing image */}
            {isProcessing && (
              <div className="animate-fadeIn">
                <div className="relative rounded-2xl overflow-hidden border border-poster-border/30 shadow-lg">
                  {/* Shimmer overlay */}
                  <div className="aspect-video bg-poster-surface flex items-center justify-center relative overflow-hidden">
                    {/* Animated shimmer */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer" />
                    <div className="flex flex-col items-center gap-3 z-10">
                      <div className="relative">
                        <Spinner size="xl" className="text-poster-accent-purple" />
                      </div>
                      <p className="text-sm font-medium text-poster-text-main">Generating caption...</p>
                      <p className="text-xs text-poster-text-sub/60">AI is analyzing your image</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Results gallery */}
            <ErrorBoundary>
              {images.length > 0 && (
                <div className={cn(
                  'grid gap-6',
                  images.length === 1 ? 'grid-cols-1 max-w-2xl mx-auto w-full' : 'grid-cols-1 lg:grid-cols-2'
                )}>
                  {images.map((img, index) => (
                    <div
                      key={img.id}
                      className={cn(
                        'group relative rounded-2xl overflow-hidden border border-poster-border/30 bg-poster-surface/50',
                        'transition-all duration-500 hover:shadow-xl hover:shadow-black/20 hover:scale-[1.01]',
                        'animate-fadeIn opacity-0 [animation-fill-mode:forwards]'
                      )}
                      style={{ animationDelay: `${index * 100}ms` }}
                    >
                      {/* Image */}
                      <div className="relative aspect-video overflow-hidden">
                        <img
                          src={img.dataUrl}
                          alt={img.caption}
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                        />

                        {/* Gradient overlay at bottom */}
                        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

                        {/* Caption overlaid on image */}
                        <div className="absolute inset-x-0 bottom-0 p-5">
                          <p className="text-sm text-white/90 leading-relaxed font-medium drop-shadow-lg">
                            {img.caption}
                          </p>
                        </div>

                        {/* Hover action buttons */}
                        <div className="absolute top-3 right-3 flex items-center gap-1.5 opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopy(img.id, img.caption);
                            }}
                            className={cn(
                              'w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md transition-all duration-200 cursor-pointer',
                              copiedId === img.id
                                ? 'bg-success/80 text-white'
                                : 'bg-black/50 text-white/80 hover:bg-black/70 hover:text-white'
                            )}
                            title={copiedId === img.id ? 'Copied!' : 'Copy caption'}
                          >
                            {copiedId === img.id ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeImage(img.id);
                            }}
                            className="w-8 h-8 rounded-full flex items-center justify-center bg-black/50 text-white/80 hover:bg-error/80 hover:text-white backdrop-blur-md transition-all duration-200 cursor-pointer"
                            title="Remove image"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* File name label */}
                      <div className="px-4 py-2.5 border-t border-poster-border/20">
                        <p className="text-[11px] text-poster-text-sub/50 truncate">{img.fileName}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  );
}
