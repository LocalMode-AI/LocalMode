/**
 * @file finder-view.tsx
 * @description Main view for the duplicate finder with upload, scanning, and results display
 */
'use client';

import { useRef } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Copy,
  Upload,
  Trash2,
  AlertTriangle,
  CheckCircle,
  Image,
  X,
} from 'lucide-react';
import { Button, IconBox, Spinner, Progress } from './ui';
import { ErrorBoundary, ErrorAlert } from './error-boundary';
import { useFinder } from '../_hooks/use-finder';
import { cn } from '../_lib/utils';
import { MODEL_SIZE, SIMILARITY_THRESHOLD } from '../_lib/constants';

/** Main finder view with upload zone, progress, and results grid */
export function FinderView() {
  const {
    photos,
    duplicateGroups,
    scanProgress,
    isScanning,
    selectedIds,
    error,
    uploadAndScan,
    deleteSelected,
    cancelScan,
    toggleSelected,
    selectAllDuplicates,
    clearSelection,
    clearError,
    reset,
    getDuplicateCount,
    getUniqueCount,
  } = useFinder();
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Handle file selection from input */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      uploadAndScan(Array.from(files));
    }
    // Reset input so the same files can be re-uploaded
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /** Handle drag and drop */
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      uploadAndScan(files);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  // Derived state
  const hasPhotos = photos.length > 0;
  const duplicateCount = getDuplicateCount();
  const uniqueCount = getUniqueCount();
  const hasDuplicates = duplicateGroups.length > 0;
  const hasSelection = selectedIds.size > 0;

  // Build a set of IDs that are in duplicate groups for quick lookup
  const duplicateIds = new Set<string>();
  const photoSimilarityMap = new Map<string, number>();
  for (const group of duplicateGroups) {
    for (const photo of group.photos) {
      duplicateIds.add(photo.id);
      photoSimilarityMap.set(photo.id, group.similarity);
    }
  }

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
            <IconBox
              size="sm"
              variant="primary"
              className="bg-poster-accent-orange/10 text-poster-accent-orange ring-1 ring-poster-accent-orange/30"
            >
              <Copy className="w-4 h-4" />
            </IconBox>
            <div>
              <h1 className="text-base font-semibold text-poster-text-main">Duplicate Finder</h1>
              <p className="text-xs text-poster-text-sub">Storage Optimization</p>
            </div>
            <span className="badge badge-sm bg-poster-surface-lighter border-poster-border/30 text-poster-text-sub ml-2 gap-1.5">
              CLIP
              <span className="text-poster-accent-orange">&middot;</span>
              {MODEL_SIZE}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {hasPhotos && !isScanning && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="btn btn-sm gap-2 bg-gradient-to-r from-poster-accent-orange to-amber-500 border-0 text-white shadow-lg shadow-poster-accent-orange/20 hover:shadow-poster-accent-orange/40 hover:brightness-110 transition-all duration-200"
              >
                <Upload className="w-4 h-4" />
                Add More
              </button>
            )}
            {hasPhotos && (
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
        <div className="h-px bg-gradient-to-r from-transparent via-poster-accent-orange/40 to-transparent" />

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
        <div className="flex-1 overflow-auto">
          <ErrorBoundary>
            {/* Scanning state */}
            {isScanning && scanProgress && (
              <div className="px-6 py-4">
                <div className="max-w-2xl mx-auto">
                  <div className="card bg-poster-surface border border-poster-border/20 shadow-sm">
                    <div className="card-body p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <Spinner size="md" className="text-poster-accent-orange" />
                        <div>
                          <p className="text-sm font-medium text-poster-text-main">
                            {scanProgress.phase === 'embedding'
                              ? `Processing ${scanProgress.current}/${scanProgress.total} images...`
                              : 'Comparing images for duplicates...'}
                          </p>
                          <p className="text-xs text-poster-text-sub mt-0.5">
                            {scanProgress.phase === 'embedding'
                              ? 'Extracting visual features with CLIP'
                              : 'Running pairwise similarity analysis'}
                          </p>
                        </div>
                      </div>
                      {scanProgress.phase === 'embedding' && scanProgress.total > 0 && (
                        <Progress
                          value={(scanProgress.current / scanProgress.total) * 100}
                          className="progress-warning"
                        />
                      )}
                      <div className="flex justify-end mt-2">
                        <button
                          onClick={cancelScan}
                          className="text-xs text-poster-text-sub hover:text-poster-text-main underline underline-offset-2 transition-colors duration-200"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Stats bar (when we have results) */}
            {hasPhotos && !isScanning && (
              <div className="sticky top-0 z-20 px-6 py-3 bg-poster-surface/60 backdrop-blur-xl border-b border-poster-border/10">
                <div className="max-w-6xl mx-auto flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1.5 text-sm text-poster-text-sub">
                      <Image className="w-4 h-4" />
                      {photos.length} photo{photos.length !== 1 ? 's' : ''}
                    </span>
                    {hasDuplicates ? (
                      <span className="flex items-center gap-1.5 text-sm text-warning">
                        <AlertTriangle className="w-4 h-4" />
                        {duplicateCount} duplicate{duplicateCount !== 1 ? 's' : ''} found
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-sm text-success">
                        <CheckCircle className="w-4 h-4" />
                        No duplicates found
                      </span>
                    )}
                    <span className="text-xs text-poster-text-sub/50">
                      Threshold: {Math.round(SIMILARITY_THRESHOLD * 100)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {hasDuplicates && (
                      <>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={hasSelection ? clearSelection : selectAllDuplicates}
                        >
                          {hasSelection ? 'Deselect All' : 'Select Duplicates'}
                        </Button>
                        {hasSelection && (
                          <button
                            onClick={deleteSelected}
                            className="btn btn-sm btn-error gap-1.5"
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete {selectedIds.size} Selected
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Upload empty state */}
            {!hasPhotos && !isScanning && (
              <div className="flex flex-col items-center justify-center min-h-[calc(100vh-14rem)] p-6 animate-fadeIn">
                {/* Hero icon */}
                <div className="relative mb-8">
                  <div className="absolute inset-0 bg-poster-accent-orange/10 rounded-full blur-2xl scale-150" />
                  <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-poster-accent-orange/20 to-amber-500/10 flex items-center justify-center ring-1 ring-poster-accent-orange/20">
                    <Copy className="w-10 h-10 text-poster-accent-orange" />
                  </div>
                </div>

                {/* Title and subtitle */}
                <h2 className="text-2xl font-bold text-poster-text-main mb-2">Duplicate Finder</h2>
                <p className="text-sm text-poster-text-sub mb-8 text-center max-w-sm">
                  Find visually similar and duplicate images using AI-powered feature comparison. Works entirely in your browser.
                </p>

                {/* Drop zone */}
                <div
                  className={cn(
                    'group relative w-full max-w-lg border-2 border-dashed rounded-2xl p-12',
                    'flex flex-col items-center justify-center cursor-pointer',
                    'border-poster-border/30 hover:border-poster-accent-orange/50',
                    'bg-poster-surface/30 hover:bg-poster-surface/50',
                    'transition-all duration-300'
                  )}
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                >
                  {/* Subtle inner glow on hover */}
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-poster-accent-orange/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

                  <div className="relative flex flex-col items-center">
                    <div className="w-16 h-16 rounded-2xl bg-poster-surface-lighter border border-poster-border/20 flex items-center justify-center mb-5 group-hover:scale-105 group-hover:border-poster-accent-orange/30 transition-all duration-300">
                      <Upload className="w-7 h-7 text-poster-text-sub group-hover:text-poster-accent-orange transition-colors duration-300" />
                    </div>
                    <p className="text-sm font-medium text-poster-text-main mb-1">
                      Drop images here or click to upload
                    </p>
                    <p className="text-xs text-poster-text-sub">
                      Supports PNG, JPEG, and WebP &middot; Select multiple files
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Photo grid results */}
            {hasPhotos && !isScanning && (
              <div className="p-6">
                <div className="max-w-6xl mx-auto">
                  {/* Duplicate groups section */}
                  {hasDuplicates && (
                    <div className="mb-8">
                      <h3 className="text-sm font-medium text-poster-text-sub mb-3 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-warning" />
                        Duplicate Groups ({duplicateGroups.length})
                      </h3>
                      <div className="space-y-4">
                        {duplicateGroups.map((group, groupIdx) => (
                          <div
                            key={groupIdx}
                            className="card bg-poster-surface/50 border border-warning/20 shadow-sm"
                          >
                            <div className="card-body p-4">
                              <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-medium text-warning">
                                  Group {groupIdx + 1} &middot; {group.photos.length} photos &middot;{' '}
                                  {Math.round(group.similarity * 100)}% similar
                                </span>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                                {group.photos.map((photo) => (
                                  <PhotoCard
                                    key={photo.id}
                                    photo={photo}
                                    isDuplicate
                                    similarity={group.similarity}
                                    isSelected={selectedIds.has(photo.id)}
                                    onToggleSelect={() => toggleSelected(photo.id)}
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Unique photos section */}
                  {uniqueCount > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-poster-text-sub mb-3 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-success" />
                        Unique Photos ({uniqueCount})
                      </h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                        {photos
                          .filter((p) => !duplicateIds.has(p.id))
                          .map((photo) => (
                            <PhotoCard
                              key={photo.id}
                              photo={photo}
                              isDuplicate={false}
                              isSelected={false}
                              onToggleSelect={() => {}}
                            />
                          ))}
                      </div>
                    </div>
                  )}
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
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    </div>
  );
}

// ============================================================================
// PhotoCard - Individual photo thumbnail with selection
// ============================================================================

/** Props for the PhotoCard component */
interface PhotoCardProps {
  /** Photo data */
  photo: {
    id: string;
    dataUrl: string;
    fileName: string;
  };
  /** Whether this photo is in a duplicate group */
  isDuplicate: boolean;
  /** Similarity score (only shown for duplicates) */
  similarity?: number;
  /** Whether this photo is selected for deletion */
  isSelected: boolean;
  /** Toggle selection callback */
  onToggleSelect: () => void;
}

/** Photo thumbnail card with duplicate indicator and selection checkbox */
function PhotoCard({ photo, isDuplicate, similarity, isSelected, onToggleSelect }: PhotoCardProps) {
  return (
    <div
      className={cn(
        'group relative aspect-square rounded-xl overflow-hidden border-2 cursor-pointer transition-all duration-200',
        isSelected
          ? 'border-primary ring-2 ring-primary/30'
          : isDuplicate
            ? 'border-warning/40 hover:border-warning/70'
            : 'border-poster-border/20 hover:border-poster-border/40'
      )}
      onClick={onToggleSelect}
    >
      {/* Image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.dataUrl}
        alt={photo.fileName}
        className="w-full h-full object-cover"
      />

      {/* Duplicate overlay badge */}
      {isDuplicate && (
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-2 pt-6">
          <div className="flex items-center justify-between">
            <span className="badge badge-warning badge-xs font-semibold">Duplicate</span>
            {similarity !== undefined && (
              <span className="text-[10px] text-white/80 font-medium">
                {Math.round(similarity * 100)}%
              </span>
            )}
          </div>
        </div>
      )}

      {/* Selection checkbox (visible on hover or when selected) */}
      {isDuplicate && (
        <div
          className={cn(
            'absolute top-2 right-2 transition-opacity duration-150',
            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          )}
        >
          <div
            className={cn(
              'w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all duration-150',
              isSelected
                ? 'bg-primary border-primary text-white'
                : 'bg-black/40 border-white/60 hover:border-white'
            )}
          >
            {isSelected && (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
        </div>
      )}

      {/* File name tooltip on hover */}
      <div className="absolute top-0 inset-x-0 bg-gradient-to-b from-black/50 to-transparent p-2 pb-6 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <p className="text-[10px] text-white/90 truncate font-medium">{photo.fileName}</p>
      </div>
    </div>
  );
}
