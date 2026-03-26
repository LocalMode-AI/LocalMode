/**
 * @file gallery-view.tsx
 * @description Main gallery view with photo upload, auto-categorization, and text-based search
 */
'use client';

import { useRef } from 'react';
import Link from 'next/link';
import {
  Search,
  Camera,
  Trash2,
  X,
  ArrowLeft,
  Grid3X3,
  List,
  Upload,
  Tag,
  ImageIcon,
} from 'lucide-react';
import { Button, IconBox, Spinner } from './ui';
import { ErrorBoundary, ErrorAlert } from './error-boundary';
import { useGallery } from '../_hooks/use-gallery';
import { cn, formatScore, getCategoryColor, getScoreColor } from '../_lib/utils';
import { MODEL_SIZE, ACCEPTED_IMAGE_TYPES } from '../_lib/constants';
import type { GalleryPhoto } from '../_lib/types';

/** Main gallery view with upload, categorization, and search */
export function GalleryView() {
  const {
    photos,
    searchQuery,
    searchResults,
    viewMode,
    isProcessing,
    isSearching,
    activeCategory,
    error,
    uploadPhotos,
    searchPhotos,
    deletePhoto,
    clearAllPhotos,
    setSearchQuery,
    setViewMode,
    setActiveCategory,
    setSearchResults,
    clearError,
    getCategories,
  } = useGallery();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derived state
  const hasPhotos = photos.length > 0;
  const hasResults = searchResults.length > 0;
  const showResults = searchQuery.trim().length > 0 && hasResults;
  const categories = getCategories();

  // Filter photos by active category
  const filteredPhotos = activeCategory
    ? photos.filter((p) => p.category === activeCategory)
    : photos;

  /** Handle file selection */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      uploadPhotos(Array.from(files));
    }
    // Reset input so re-uploading same file works
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /** Handle drag and drop */
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      ACCEPTED_IMAGE_TYPES.includes(f.type)
    );
    if (files.length > 0) {
      uploadPhotos(files);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  /** Handle search on Enter key */
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      searchPhotos(searchQuery);
    }
  };

  /** Handle search input change */
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  /** Clear search */
  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
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
              <Camera className="w-4 h-4" />
            </IconBox>
            <div>
              <h1 className="text-base font-semibold text-poster-text-main">Smart Gallery</h1>
              <p className="text-xs text-poster-text-sub">Auto-Categorization</p>
            </div>
            <span className="badge badge-sm bg-poster-surface-lighter border-poster-border/30 text-poster-text-sub ml-2 gap-1.5">
              CLIP
              <span className="text-poster-accent-teal">&middot;</span>
              {MODEL_SIZE}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* View mode toggle */}
            {hasPhotos && (
              <div className="join">
                <button
                  className={cn(
                    'join-item btn btn-xs',
                    viewMode === 'grid'
                      ? 'btn-active bg-poster-accent-teal/20 text-poster-accent-teal border-poster-accent-teal/30'
                      : 'bg-poster-surface-lighter border-poster-border/30 text-poster-text-sub'
                  )}
                  onClick={() => setViewMode('grid')}
                >
                  <Grid3X3 className="w-3.5 h-3.5" />
                </button>
                <button
                  className={cn(
                    'join-item btn btn-xs',
                    viewMode === 'list'
                      ? 'btn-active bg-poster-accent-teal/20 text-poster-accent-teal border-poster-accent-teal/30'
                      : 'bg-poster-surface-lighter border-poster-border/30 text-poster-text-sub'
                  )}
                  onClick={() => setViewMode('list')}
                >
                  <List className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {hasPhotos && (
              <>
                <span className="px-2.5 py-1 rounded-md bg-poster-surface text-[11px] font-medium text-poster-text-sub border border-poster-border/20">
                  <ImageIcon className="w-3 h-3 inline mr-1 -mt-px" />
                  {photos.length} photo{photos.length !== 1 ? 's' : ''}
                </span>
                <Button variant="ghost" size="xs" onClick={clearAllPhotos}>
                  <Trash2 className="w-3 h-3 mr-1" />
                  Clear
                </Button>
              </>
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
              onDismiss={clearError}
              onRetry={() => fileInputRef.current?.click()}
            />
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-6xl mx-auto space-y-6">
            <ErrorBoundary>
              {!hasPhotos ? (
                /* Upload empty state */
                <div className="flex flex-col items-center justify-center min-h-[calc(100vh-14rem)] animate-fadeIn">
                  {/* Hero icon with concentric rings */}
                  <div className="relative mb-8">
                    <div className="absolute inset-0 bg-poster-accent-teal/10 rounded-full blur-2xl scale-150" />
                    <div className="absolute -inset-6 rounded-full border border-poster-accent-teal/10" />
                    <div className="absolute -inset-12 rounded-full border border-poster-accent-teal/5" />
                    <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-poster-accent-teal/20 to-poster-primary/10 flex items-center justify-center ring-1 ring-poster-accent-teal/20">
                      <Camera className="w-10 h-10 text-poster-accent-teal" />
                    </div>
                  </div>

                  {/* Title and subtitle */}
                  <h2 className="text-2xl font-bold text-poster-text-main mb-2">Smart Gallery</h2>
                  <p className="text-sm text-poster-text-sub mb-8 text-center max-w-sm">
                    Upload photos to auto-categorize them using AI.
                    Search by description, not file names.
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
                        <Upload className="w-7 h-7 text-poster-text-sub group-hover:text-poster-accent-teal transition-colors duration-300" />
                      </div>
                      <p className="text-sm font-medium text-poster-text-main mb-1">
                        Drop images here or click to upload
                      </p>
                      <p className="text-xs text-poster-text-sub">
                        Supports PNG, JPEG, and WebP
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                /* Gallery content */
                <div className="space-y-5 animate-fadeIn">
                  {/* Search bar */}
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                      {isSearching ? (
                        <Spinner size="sm" className="text-poster-accent-teal" />
                      ) : (
                        <Search className="w-5 h-5 text-poster-text-sub/30 group-focus-within:text-poster-accent-teal transition-colors" />
                      )}
                    </div>
                    <input
                      type="text"
                      placeholder="Search photos by description... (e.g. 'sunset on the beach')"
                      className={cn(
                        'input input-lg w-full pl-12 pr-28 shadow-sm',
                        'bg-poster-surface border-poster-border/20 text-poster-text-main',
                        'focus:border-poster-accent-teal/50 focus:shadow-lg focus:shadow-poster-accent-teal/5',
                        'placeholder:text-poster-text-sub/30 transition-all duration-200',
                        'rounded-xl text-[15px]'
                      )}
                      value={searchQuery}
                      onChange={handleSearchChange}
                      onKeyDown={handleSearchKeyDown}
                    />
                    <div className="absolute inset-y-0 right-4 flex items-center gap-2">
                      {searchQuery && (
                        <button
                          className="text-poster-text-sub/30 hover:text-poster-text-main transition-colors"
                          onClick={handleClearSearch}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                      <span className="text-[11px] text-poster-text-sub/30 font-medium">
                        Press Enter
                      </span>
                    </div>
                  </div>

                  {/* Category filter pills */}
                  {categories.length > 0 && !showResults && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <Tag className="w-3.5 h-3.5 text-poster-text-sub/40" />
                      <button
                        className={cn(
                          'px-3 py-1 rounded-full text-xs font-medium transition-all duration-200',
                          activeCategory === null
                            ? 'bg-poster-accent-teal/20 text-poster-accent-teal border border-poster-accent-teal/30'
                            : 'bg-poster-surface border border-poster-border/20 text-poster-text-sub hover:border-poster-border/40'
                        )}
                        onClick={() => setActiveCategory(null)}
                      >
                        All
                      </button>
                      {categories.map((category) => (
                        <button
                          key={category}
                          className={cn(
                            'px-3 py-1 rounded-full text-xs font-medium capitalize transition-all duration-200',
                            activeCategory === category
                              ? 'bg-poster-accent-teal/20 text-poster-accent-teal border border-poster-accent-teal/30'
                              : 'bg-poster-surface border border-poster-border/20 text-poster-text-sub hover:border-poster-border/40'
                          )}
                          onClick={() => setActiveCategory(activeCategory === category ? null : category)}
                        >
                          {category}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Search results */}
                  {showResults && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-poster-text-sub">
                        <Search className="w-4 h-4 text-poster-accent-teal" />
                        {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for &ldquo;{searchQuery}&rdquo;
                      </div>

                      {viewMode === 'grid' ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                          {searchResults.map((result, index) => (
                            <PhotoCard
                              key={result.photo.id}
                              photo={result.photo}
                              score={result.score}
                              index={index}
                              onDelete={deletePhoto}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {searchResults.map((result, index) => (
                            <PhotoListItem
                              key={result.photo.id}
                              photo={result.photo}
                              score={result.score}
                              index={index}
                              onDelete={deletePhoto}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* No results message */}
                  {searchQuery.trim().length > 0 && !hasResults && !isSearching && (
                    <div className="text-center py-10 text-poster-text-sub/40 text-sm">
                      No results found. Press Enter to search.
                    </div>
                  )}

                  {/* Photo gallery (when not searching) */}
                  {!showResults && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-medium text-poster-text-sub">
                          <ImageIcon className="w-4 h-4" />
                          {activeCategory ? (
                            <>
                              {filteredPhotos.length} {activeCategory} photo{filteredPhotos.length !== 1 ? 's' : ''}
                            </>
                          ) : (
                            <>
                              All Photos ({photos.length})
                            </>
                          )}
                        </div>
                        <button
                          className="btn btn-xs btn-ghost gap-1.5 text-poster-text-sub hover:text-poster-accent-teal"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <Upload className="w-3.5 h-3.5" />
                          Add More
                        </button>
                      </div>

                      {viewMode === 'grid' ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                          {filteredPhotos.map((photo, index) => (
                            <PhotoCard
                              key={photo.id}
                              photo={photo}
                              index={index}
                              onDelete={deletePhoto}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {filteredPhotos.map((photo, index) => (
                            <PhotoListItem
                              key={photo.id}
                              photo={photo}
                              index={index}
                              onDelete={deletePhoto}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </ErrorBoundary>
          </div>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}

// ============================================================================
// PhotoCard - Grid view photo card
// ============================================================================

/** Props for the PhotoCard component */
interface PhotoCardProps {
  /** The gallery photo */
  photo: GalleryPhoto;
  /** Optional similarity score */
  score?: number;
  /** Animation index */
  index: number;
  /** Delete callback */
  onDelete: (id: string) => void;
}

/** Photo card for grid view with category overlay */
function PhotoCard({ photo, score, index, onDelete }: PhotoCardProps) {
  return (
    <div
      className={cn(
        'group relative aspect-square rounded-xl overflow-hidden border border-poster-border/20',
        'hover:border-poster-accent-teal/30 hover:shadow-lg hover:shadow-poster-accent-teal/5',
        'transition-all duration-300 animate-in fade-in'
      )}
      style={{ animationDelay: `${index * 40}ms`, animationFillMode: 'both' }}
    >
      {/* Photo image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.dataUrl}
        alt={photo.fileName}
        className={cn(
          'w-full h-full object-cover transition-all duration-300',
          photo.isProcessing && 'brightness-50 blur-sm'
        )}
      />

      {/* Processing overlay */}
      {photo.isProcessing && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-4 border-poster-accent-teal/20" />
            <div className="absolute inset-0 w-12 h-12 rounded-full border-4 border-transparent border-t-poster-accent-teal animate-spin" />
            <Camera className="absolute inset-0 m-auto w-5 h-5 text-white" />
          </div>
          <p className="text-white text-xs font-medium mt-3 drop-shadow-lg">
            Analyzing...
          </p>
        </div>
      )}

      {/* Hover overlay with category and actions */}
      {!photo.isProcessing && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          {/* Delete button */}
          <button
            className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/50 flex items-center justify-center text-white/70 hover:text-error hover:bg-error/20 transition-all duration-200"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(photo.id);
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {/* Bottom info */}
          <div className="absolute bottom-0 left-0 right-0 p-3 flex items-end justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-white text-xs font-medium truncate">{photo.fileName}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 ml-2">
              {score !== undefined && (
                <span
                  className={cn(
                    'badge badge-xs font-semibold',
                    getScoreColor(score)
                  )}
                >
                  {formatScore(score)}
                </span>
              )}
              {photo.category && (
                <span
                  className={cn(
                    'badge badge-xs capitalize',
                    getCategoryColor(photo.category)
                  )}
                >
                  {photo.category}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Category badge (always visible, bottom-left) */}
      {!photo.isProcessing && photo.category && (
        <div className="absolute bottom-2 left-2 group-hover:opacity-0 transition-opacity duration-200">
          <span
            className={cn(
              'badge badge-xs capitalize shadow-md',
              getCategoryColor(photo.category)
            )}
          >
            {photo.category}
          </span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// PhotoListItem - List view photo row
// ============================================================================

/** Props for the PhotoListItem component */
interface PhotoListItemProps {
  /** The gallery photo */
  photo: GalleryPhoto;
  /** Optional similarity score */
  score?: number;
  /** Animation index */
  index: number;
  /** Delete callback */
  onDelete: (id: string) => void;
}

/** Photo list item for list view */
function PhotoListItem({ photo, score, index, onDelete }: PhotoListItemProps) {
  return (
    <div
      className={cn(
        'card bg-poster-surface border border-poster-border/20 shadow-sm group',
        'hover:border-poster-accent-teal/25 hover:shadow-md transition-all duration-200',
        'animate-in fade-in slide-in-from-bottom-2'
      )}
      style={{ animationDelay: `${index * 40}ms`, animationFillMode: 'both' }}
    >
      <div className="card-body p-3 flex-row items-center gap-4">
        {/* Thumbnail */}
        <div className="relative w-14 h-14 rounded-lg overflow-hidden shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.dataUrl}
            alt={photo.fileName}
            className={cn(
              'w-full h-full object-cover',
              photo.isProcessing && 'brightness-50 blur-sm'
            )}
          />
          {photo.isProcessing && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Spinner size="xs" className="text-poster-accent-teal" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-poster-text-main font-medium truncate">
            {photo.fileName}
          </p>
          <div className="flex items-center gap-2 mt-1">
            {photo.isProcessing ? (
              <span className="text-[11px] text-poster-accent-teal">Analyzing...</span>
            ) : (
              photo.category && (
                <span
                  className={cn(
                    'badge badge-xs capitalize',
                    getCategoryColor(photo.category)
                  )}
                >
                  {photo.category}
                </span>
              )
            )}
            {!photo.isProcessing && photo.categoryScore > 0 && (
              <span className="text-[11px] text-poster-text-sub/40">
                {formatScore(photo.categoryScore)} confidence
              </span>
            )}
          </div>
        </div>

        {/* Score badge (search results) */}
        {score !== undefined && (
          <div
            className={cn(
              'badge badge-sm shrink-0 font-semibold',
              getScoreColor(score)
            )}
          >
            {formatScore(score)}
          </div>
        )}

        {/* Delete button */}
        <button
          className="opacity-0 group-hover:opacity-100 transition-opacity text-poster-text-sub/30 hover:text-error shrink-0 p-1 rounded-lg hover:bg-error/10"
          onClick={() => onDelete(photo.id)}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
