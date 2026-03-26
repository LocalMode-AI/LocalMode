/**
 * @file detector-view.tsx
 * @description Main view for the object detector application — computer vision dashboard
 * with color-coded bounding boxes, confidence bars, and scanning grid overlay
 */
'use client';

import { useRef } from 'react';
import { Upload, ScanSearch, X, Eye, ArrowLeft, Layers } from 'lucide-react';
import { Button, IconBox, Spinner, Badge } from './ui';
import { ErrorBoundary, ErrorAlert } from './error-boundary';
import { useDetector } from '../_hooks/use-detector';
import { cn, formatScore, getDetectionColor } from '../_lib/utils';
import { MODEL_CONFIG } from '../_lib/constants';

/** Main detector view with upload area, image preview, and detection results */
export function DetectorView() {
  const {
    imageDataUrl, imageWidth, imageHeight, detections, isProcessing, error,
    processImage, cancelDetection, clearError, reset,
  } = useDetector();
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  /** Unique detected object labels for the legend */
  const uniqueLabels = [...new Map(detections.map((d, i) => [d.label, { label: d.label, color: getDetectionColor(i) }])).values()];

  return (
    <div className="h-[calc(100vh-4rem)] bg-poster-bg text-poster-text-main font-sans selection:bg-poster-primary/30 relative overflow-hidden">
      {/* Background grid */}
      <div className="bg-grid fixed inset-0 z-0 pointer-events-none opacity-50" />

      <div className="relative z-10 flex flex-col h-full">
        {/* Header */}
        <header className="h-16 min-h-16 flex items-center justify-between px-6 border-b border-poster-border/20 bg-poster-surface/80 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <button
              onClick={() => window.history.back()}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-poster-text-sub hover:text-poster-text-main hover:bg-poster-surface-lighter/60 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="w-px h-6 bg-poster-border/30" />
            <IconBox size="sm" variant="primary">
              <ScanSearch className="w-4 h-4" />
            </IconBox>
            <div>
              <h1 className="text-base font-semibold text-poster-text-main">Object Detector</h1>
              <p className="text-xs text-poster-text-sub">Detect and identify objects</p>
            </div>
            <Badge variant="ghost" size="sm" className="ml-2 text-poster-primary border-poster-primary/30 bg-poster-primary/5">
              DETR &middot; {MODEL_CONFIG.modelSize}
            </Badge>
          </div>
          {imageDataUrl && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                reset();
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
            >
              <X className="w-4 h-4 mr-1.5" />
              Clear
            </Button>
          )}
        </header>

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
              {!imageDataUrl ? (
                /* Upload empty state with pulsing rings */
                <div className="flex flex-col items-center justify-center min-h-[60vh]">
                  <div
                    className={cn(
                      'group relative flex flex-col items-center justify-center gap-6 w-full max-w-lg p-16',
                      'rounded-2xl border-2 border-dashed border-poster-border/30',
                      'hover:border-poster-primary/50 hover:bg-poster-primary/[0.02]',
                      'cursor-pointer transition-all duration-300'
                    )}
                    onClick={() => fileInputRef.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                  >
                    {/* Icon with pulsing rings */}
                    <div className="relative flex items-center justify-center">
                      {/* Outer pulsing ring */}
                      <div className="absolute w-28 h-28 rounded-full border border-poster-primary/10 animate-ping" style={{ animationDuration: '3s' }} />
                      {/* Middle ring */}
                      <div className="absolute w-24 h-24 rounded-full border border-poster-primary/15 animate-ping" style={{ animationDuration: '2.5s', animationDelay: '0.5s' }} />
                      {/* Icon container */}
                      <div className="relative w-20 h-20 rounded-2xl bg-poster-primary/10 flex items-center justify-center ring-1 ring-poster-primary/20 group-hover:ring-poster-primary/40 transition-all duration-300 group-hover:scale-105">
                        <Eye className="w-10 h-10 text-poster-primary" />
                      </div>
                    </div>

                    <div className="text-center space-y-2 mt-2">
                      <h2 className="text-xl font-semibold text-poster-text-main">Object Detector</h2>
                      <p className="text-sm text-poster-text-sub leading-relaxed max-w-xs">
                        Upload an image to detect and identify objects with bounding boxes
                      </p>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-poster-text-sub/50">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Drop an image or click to upload</span>
                    </div>

                    <p className="text-[11px] text-poster-text-sub/30">
                      Supports PNG, JPEG, WebP, and GIF
                    </p>
                  </div>
                </div>
              ) : (
                /* Detection view — image + results panel */
                <div className="flex flex-col gap-5 animate-fadeIn">
                  {/* Color-coded legend of unique labels */}
                  {uniqueLabels.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <Layers className="w-3.5 h-3.5 text-poster-text-sub/50 mr-1" />
                      {uniqueLabels.map((item) => (
                        <span
                          key={item.label}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium capitalize"
                          style={{
                            backgroundColor: `${item.color}15`,
                            color: item.color,
                            border: `1px solid ${item.color}30`,
                          }}
                        >
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: item.color }}
                          />
                          {item.label}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-col lg:flex-row gap-6">
                    {/* Image container with bounding box overlays */}
                    <div className="flex-1 min-w-0">
                      <div className="relative inline-block w-full rounded-xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.3)] border border-poster-border/15">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imageDataUrl}
                          alt="Uploaded image"
                          className="w-full h-auto block"
                        />

                        {/* Bounding box overlays — rounded, semi-transparent fills, styled labels */}
                        {detections.map((detection, index) => {
                          const color = getDetectionColor(index);
                          const leftPct = (detection.box.x / imageWidth) * 100;
                          const topPct = (detection.box.y / imageHeight) * 100;
                          const widthPct = (detection.box.width / imageWidth) * 100;
                          const heightPct = (detection.box.height / imageHeight) * 100;

                          return (
                            <div
                              key={`${detection.label}-${index}`}
                              className="absolute pointer-events-none rounded-md transition-all duration-300"
                              style={{
                                left: `${leftPct}%`,
                                top: `${topPct}%`,
                                width: `${widthPct}%`,
                                height: `${heightPct}%`,
                                borderWidth: '2px',
                                borderStyle: 'solid',
                                borderColor: color,
                                backgroundColor: `${color}12`,
                                animation: `boxFadeIn 0.4s ease-out ${index * 0.08}s both`,
                              }}
                            >
                              {/* Label positioned above the box */}
                              <span
                                className="absolute left-0 flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-white whitespace-nowrap rounded-md shadow-md"
                                style={{
                                  backgroundColor: color,
                                  bottom: '100%',
                                  marginBottom: '2px',
                                }}
                              >
                                {detection.label}
                                <span className="opacity-70 font-normal">
                                  {formatScore(detection.score)}
                                </span>
                              </span>
                            </div>
                          );
                        })}

                        {/* Processing overlay — scanning grid */}
                        {isProcessing && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            {/* Darkened backdrop */}
                            <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" />
                            {/* Animated scanning grid lines */}
                            <div className="absolute inset-0 overflow-hidden">
                              <div
                                className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-poster-primary to-transparent shadow-[0_0_12px_rgba(59,130,246,0.6)]"
                                style={{ animation: 'scanGridH 2s ease-in-out infinite' }}
                              />
                              <div
                                className="absolute top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-poster-primary to-transparent shadow-[0_0_12px_rgba(59,130,246,0.6)]"
                                style={{ animation: 'scanGridV 2.5s ease-in-out infinite' }}
                              />
                            </div>
                            {/* Central indicator */}
                            <div className="relative z-10 flex flex-col items-center gap-3">
                              <Spinner size="xl" className="text-white" />
                              <p className="text-white text-sm font-medium">Detecting objects...</p>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="mt-1 text-white/80 hover:text-white border border-white/20 hover:border-white/40"
                                onClick={cancelDetection}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Results side panel */}
                    <div className="lg:w-80 shrink-0">
                      <div
                        className={cn(
                          'rounded-xl border border-poster-border/20 bg-poster-surface/60 backdrop-blur-sm',
                          'shadow-[0_4px_16px_rgba(0,0,0,0.15)] overflow-hidden'
                        )}
                      >
                        {/* Panel header with stat */}
                        <div className="px-5 py-4 border-b border-poster-border/15 bg-poster-surface-lighter/20">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Eye className="w-4 h-4 text-poster-primary" />
                              <h3 className="text-sm font-semibold text-poster-text-main">Detections</h3>
                            </div>
                            {detections.length > 0 && (
                              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-poster-primary/10 ring-1 ring-poster-primary/20">
                                <span className="text-lg font-bold text-poster-primary leading-none">
                                  {detections.length}
                                </span>
                                <span className="text-[10px] text-poster-primary/70 uppercase font-medium">
                                  found
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Detection cards */}
                        <div className="p-3 max-h-[60vh] overflow-auto">
                          {detections.length === 0 && !isProcessing ? (
                            <div className="flex flex-col items-center justify-center py-10 gap-2 text-poster-text-sub/40">
                              <ScanSearch className="w-6 h-6" />
                              <p className="text-sm">No objects detected</p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {detections.map((detection, index) => {
                                const color = getDetectionColor(index);
                                const confidencePct = Math.round(detection.score * 100);
                                return (
                                  <div
                                    key={`result-${detection.label}-${index}`}
                                    className={cn(
                                      'flex items-center gap-3 p-3 rounded-lg',
                                      'bg-poster-surface border border-poster-border/15',
                                      'hover:border-poster-border/30 transition-all duration-200'
                                    )}
                                    style={{
                                      animation: `cardSlideIn 0.35s ease-out ${index * 0.06}s both`,
                                    }}
                                  >
                                    {/* Color dot */}
                                    <div
                                      className="w-3.5 h-3.5 rounded-full shrink-0"
                                      style={{
                                        backgroundColor: color,
                                        boxShadow: `0 0 0 2px var(--color-poster-surface), 0 0 0 4px ${color}40`,
                                      }}
                                    />
                                    {/* Label + confidence bar */}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center justify-between mb-1.5">
                                        <p className="text-sm font-medium truncate capitalize text-poster-text-main">
                                          {detection.label}
                                        </p>
                                        <span
                                          className="text-xs font-semibold ml-2 shrink-0"
                                          style={{ color }}
                                        >
                                          {formatScore(detection.score)}
                                        </span>
                                      </div>
                                      {/* Confidence bar */}
                                      <div className="w-full h-1.5 rounded-full bg-poster-surface-lighter/50 overflow-hidden">
                                        <div
                                          className="h-full rounded-full transition-all duration-700 ease-out"
                                          style={{
                                            width: `${confidencePct}%`,
                                            backgroundColor: color,
                                            animation: `barGrow 0.6s ease-out ${index * 0.06 + 0.2}s both`,
                                          }}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Loading state in panel */}
                          {isProcessing && detections.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-10 gap-3">
                              <Spinner size="md" className="text-poster-primary" />
                              <p className="text-xs text-poster-text-sub">Analyzing image...</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
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
