/**
 * @file search-view.tsx
 * @description Main search view with photo upload, text-to-image search, and image-to-image search
 */
'use client';

import { useRef, useState } from 'react';
import {
  Search,
  ImageIcon,
  Trash2,
  X,
  ArrowLeft,
  Upload,
  Sparkles,
  Type,
  Image as ImageLucide,
  XCircle,
} from 'lucide-react';
import { Button, IconBox, Spinner, Progress } from './ui';
import { ErrorBoundary, ErrorAlert } from './error-boundary';
import { PhotoGrid } from './photo-grid';
import { usePhotoSearch } from '../_hooks/use-photo-search';
import { cn } from '../_lib/utils';
import { MODEL_SIZE, ACCEPTED_IMAGE_TYPES } from '../_lib/constants';
import { readFileAsDataUrl } from '@localmode/react';

/** Main search view layout with all sections */
export function SearchView() {
  const {
    photos,
    searchQuery,
    searchResults,
    searchMode,
    isIndexing,
    isSearching,
    indexProgress,
    error,
    uploadPhotos,
    searchByText,
    searchByImage,
    deletePhoto,
    clearAllPhotos,
    cancelIndexing,
    setSearchQuery,
    setSearchMode,
    setSearchResults,
    clearError,
  } = usePhotoSearch();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageSearchInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Derived state
  const hasPhotos = photos.length > 0;
  const hasResults = searchResults.length > 0;
  const showResults = hasResults;

  /** Handle file selection for photo upload */
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
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      ACCEPTED_IMAGE_TYPES.includes(f.type)
    );
    if (files.length > 0) {
      uploadPhotos(files);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  /** Handle search on Enter key */
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      searchByText(searchQuery);
    }
  };

  /** Handle search input change */
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  /** Clear search state */
  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
  };

  /** Handle image search file selection */
  const handleImageSearchFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !ACCEPTED_IMAGE_TYPES.includes(file.type)) return;

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setSearchMode('image');
      await searchByImage(dataUrl);
    } catch (err) {
      console.error('Image search failed:', err);
    }

    // Reset input
    if (imageSearchInputRef.current) imageSearchInputRef.current.value = '';
  };

  return (
    <div className="h-[calc(100vh-4rem)] bg-poster-bg text-poster-text-main font-sans selection:bg-poster-primary/30 relative overflow-hidden">
      {/* Background grid */}
      <div className="bg-grid fixed inset-0 z-0 pointer-events-none opacity-50" />

      <div className="relative z-10 flex flex-col h-full">
        {/* Header */}
        <div className="h-16 min-h-16 border-b border-poster-border/30 flex items-center justify-between px-6 bg-poster-surface/80 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <a
              href="/"
              className="flex items-center justify-center w-8 h-8 rounded-lg text-poster-text-sub hover:text-poster-text-main hover:bg-poster-surface-lighter transition-all duration-200 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </a>
            <IconBox size="sm" variant="primary">
              <Search className="w-4 h-4" />
            </IconBox>
            <div>
              <h1 className="text-base font-semibold text-poster-text-main">Cross-Modal Photo Search</h1>
              <p className="text-xs text-poster-text-sub">Search photos by text or image</p>
            </div>
            <span className="badge badge-sm bg-poster-surface-lighter border-poster-border/30 text-poster-text-sub ml-2 gap-1.5">
              CLIP
              <span className="text-poster-primary">&middot;</span>
              {MODEL_SIZE}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {hasPhotos && (
              <>
                <span className="px-2.5 py-1 rounded-md bg-poster-surface text-[11px] font-medium text-poster-text-sub border border-poster-border/20">
                  <ImageIcon className="w-3 h-3 inline mr-1 -mt-px" />
                  {photos.filter((p) => !p.isProcessing).length} photo{photos.filter((p) => !p.isProcessing).length !== 1 ? 's' : ''}
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
        <div className="h-px bg-gradient-to-r from-transparent via-poster-primary/40 to-transparent" />

        {/* Error alert */}
        {error && (
          <div className="px-6 pt-4">
            <ErrorAlert
              message={error.message}
              onDismiss={clearError}
              onRetry={clearError}
            />
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-6xl mx-auto space-y-6">
            <ErrorBoundary>
              {!hasPhotos && !isIndexing ? (
                /* Upload empty state */
                <div className="flex flex-col items-center justify-center min-h-[calc(100vh-14rem)] animate-fadeIn">
                  {/* Hero icon with concentric rings */}
                  <div className="relative mb-8">
                    <div className="absolute inset-0 bg-poster-primary/10 rounded-full blur-2xl scale-150" />
                    <div className="absolute -inset-6 rounded-full border border-poster-primary/10" />
                    <div className="absolute -inset-12 rounded-full border border-poster-primary/5" />
                    <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-poster-primary/20 to-poster-accent-purple/10 flex items-center justify-center ring-1 ring-poster-primary/20">
                      <Search className="w-10 h-10 text-poster-primary" />
                    </div>
                    <div className="absolute -top-1 -right-1 w-8 h-8 rounded-lg bg-poster-accent-orange/15 flex items-center justify-center ring-1 ring-poster-accent-orange/25">
                      <Sparkles className="w-4 h-4 text-poster-accent-orange" />
                    </div>
                  </div>

                  {/* Title and subtitle */}
                  <h2 className="text-2xl font-bold text-poster-text-main mb-2">Cross-Modal Photo Search</h2>
                  <p className="text-sm text-poster-text-sub mb-8 text-center max-w-md">
                    Upload photos, then search by typing a text description or uploading
                    a reference image. Powered by CLIP multimodal embeddings.
                  </p>

                  {/* Drop zone */}
                  <div
                    className={cn(
                      'group relative w-full max-w-lg border-2 border-dashed rounded-2xl p-12',
                      'flex flex-col items-center justify-center cursor-pointer',
                      'bg-poster-surface/30 hover:bg-poster-surface/50',
                      'transition-all duration-300',
                      isDragOver
                        ? 'border-poster-primary/60 bg-poster-primary/5'
                        : 'border-poster-border/30 hover:border-poster-primary/50'
                    )}
                    onClick={() => fileInputRef.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                  >
                    {/* Subtle inner glow on hover */}
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-poster-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

                    <div className="relative flex flex-col items-center">
                      <div className="w-16 h-16 rounded-2xl bg-poster-surface-lighter border border-poster-border/20 flex items-center justify-center mb-5 group-hover:scale-105 group-hover:border-poster-primary/30 transition-all duration-300">
                        <Upload className="w-7 h-7 text-poster-text-sub group-hover:text-poster-primary transition-colors duration-300" />
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
                /* Main content with search and photos */
                <div className="space-y-5 animate-fadeIn">
                  {/* Indexing progress bar */}
                  {isIndexing && (
                    <div className="card bg-poster-surface border border-poster-border/20 shadow-sm">
                      <div className="card-body p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm font-medium text-poster-text-main">
                            <Spinner size="sm" className="text-poster-primary" />
                            Indexing {indexProgress.current}/{indexProgress.total} photos...
                          </div>
                          <Button variant="ghost" size="xs" onClick={cancelIndexing}>
                            <XCircle className="w-3 h-3 mr-1" />
                            Cancel
                          </Button>
                        </div>
                        <Progress
                          value={indexProgress.total > 0 ? (indexProgress.current / indexProgress.total) * 100 : 0}
                        />
                      </div>
                    </div>
                  )}

                  {/* Search bar */}
                  <div className="space-y-3">
                    {/* Search mode toggle */}
                    <div className="flex items-center gap-2">
                      <div className="join">
                        <button
                          className={cn(
                            'join-item btn btn-xs gap-1.5',
                            searchMode === 'text'
                              ? 'btn-active bg-poster-primary/20 text-poster-primary border-poster-primary/30'
                              : 'bg-poster-surface-lighter border-poster-border/30 text-poster-text-sub'
                          )}
                          onClick={() => setSearchMode('text')}
                        >
                          <Type className="w-3.5 h-3.5" />
                          Text Search
                        </button>
                        <button
                          className={cn(
                            'join-item btn btn-xs gap-1.5',
                            searchMode === 'image'
                              ? 'btn-active bg-poster-primary/20 text-poster-primary border-poster-primary/30'
                              : 'bg-poster-surface-lighter border-poster-border/30 text-poster-text-sub'
                          )}
                          onClick={() => {
                            setSearchMode('image');
                            imageSearchInputRef.current?.click();
                          }}
                        >
                          <ImageLucide className="w-3.5 h-3.5" />
                          Image Search
                        </button>
                      </div>
                    </div>

                    {/* Text search input */}
                    {searchMode === 'text' && (
                      <div className="relative group">
                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                          {isSearching ? (
                            <Spinner size="sm" className="text-poster-primary" />
                          ) : (
                            <Search className="w-5 h-5 text-poster-text-sub/30 group-focus-within:text-poster-primary transition-colors" />
                          )}
                        </div>
                        <input
                          type="text"
                          placeholder="Search photos by description... (e.g. 'sunset over the ocean')"
                          className={cn(
                            'input input-lg w-full pl-12 pr-28 shadow-sm',
                            'bg-poster-surface border-poster-border/20 text-poster-text-main',
                            'focus:border-poster-primary/50 focus:shadow-lg focus:shadow-poster-primary/5',
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
                          <Button
                            variant="primary"
                            size="xs"
                            onClick={() => searchByText(searchQuery)}
                            disabled={!searchQuery.trim() || isSearching}
                            loading={isSearching}
                          >
                            <Search className="w-3 h-3 mr-1" />
                            Search
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Image search input */}
                    {searchMode === 'image' && (
                      <div
                        className={cn(
                          'group relative border-2 border-dashed rounded-xl p-6',
                          'flex flex-col items-center justify-center cursor-pointer',
                          'border-poster-border/30 hover:border-poster-primary/50',
                          'bg-poster-surface/30 hover:bg-poster-surface/50',
                          'transition-all duration-300'
                        )}
                        onClick={() => imageSearchInputRef.current?.click()}
                      >
                        <div className="flex items-center gap-3">
                          {isSearching ? (
                            <Spinner size="md" className="text-poster-primary" />
                          ) : (
                            <ImageLucide className="w-6 h-6 text-poster-text-sub group-hover:text-poster-primary transition-colors" />
                          )}
                          <div>
                            <p className="text-sm font-medium text-poster-text-main">
                              {isSearching ? 'Searching...' : 'Upload a reference image to find similar photos'}
                            </p>
                            <p className="text-xs text-poster-text-sub">
                              Click to select an image file
                            </p>
                          </div>
                        </div>
                        {hasResults && (
                          <button
                            className="absolute top-2 right-2 text-poster-text-sub/30 hover:text-poster-text-main transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSearchResults([]);
                            }}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Search results */}
                  {showResults && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-medium text-poster-text-sub">
                          <Sparkles className="w-4 h-4 text-poster-accent-orange" />
                          {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found
                          {searchMode === 'text' && searchQuery && (
                            <span className="text-poster-text-sub/40">
                              for &ldquo;{searchQuery}&rdquo;
                            </span>
                          )}
                          {searchMode === 'image' && (
                            <span className="text-poster-text-sub/40">
                              by image similarity
                            </span>
                          )}
                        </div>
                        <button
                          className="text-xs text-poster-text-sub/40 hover:text-poster-text-main transition-colors"
                          onClick={handleClearSearch}
                        >
                          Clear results
                        </button>
                      </div>
                      <PhotoGrid results={searchResults} onDelete={deletePhoto} />
                    </div>
                  )}

                  {/* No results message */}
                  {searchMode === 'text' && searchQuery.trim().length > 0 && !hasResults && !isSearching && (
                    <div className="text-center py-10 text-poster-text-sub/40 text-sm">
                      No results found. Press Enter to search.
                    </div>
                  )}

                  {/* All photos section */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium text-poster-text-sub">
                        <ImageIcon className="w-4 h-4" />
                        All Photos ({photos.filter((p) => !p.isProcessing).length})
                      </div>
                      <button
                        className="btn btn-xs btn-ghost gap-1.5 text-poster-text-sub hover:text-poster-primary"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="w-3.5 h-3.5" />
                        Add More
                      </button>
                    </div>
                    <PhotoGrid photos={photos} onDelete={deletePhoto} />
                  </div>
                </div>
              )}
            </ErrorBoundary>
          </div>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        ref={imageSearchInputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        className="hidden"
        onChange={handleImageSearchFile}
      />
    </div>
  );
}
