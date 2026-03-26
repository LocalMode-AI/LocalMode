/**
 * @file catalog-view.tsx
 * @description Main catalog view with product upload, category filtering, and visual search
 */
'use client';

import { useRef, useState } from 'react';
import {
  ArrowLeft,
  Zap,
  Search,
  Upload,
  Trash2,
  Tag,
  Grid3X3,
  List,
  X,
  ImagePlus,
  Sparkles,
  Package,
  Cpu,
  Gauge,
} from 'lucide-react';
import { Button, Spinner, IconBox } from './ui';
import { ErrorBoundary, ErrorAlert } from './error-boundary';
import { useProductSearch } from '../_hooks/use-product-search';
import { cn, formatScore, formatDeviceProfile } from '../_lib/utils';
import { MODEL_SIZE, CATEGORIES, ACCEPTED_IMAGE_TYPES } from '../_lib/constants';
import type { Product } from '../_lib/types';
import type { SearchResult as SearchResultType } from '../_lib/types';

/** Main catalog view layout with sidebar and product grid */
export function CatalogView() {
  const {
    products,
    searchQuery,
    selectedCategory,
    viewMode,
    searchResults,
    isProcessing,
    isSearching,
    error,
    batchInfo,
    threshold,
    uploadProducts,
    searchProducts,
    searchByImage,
    deleteProduct,
    clearAllProducts,
    setSearchQuery,
    setSelectedCategory,
    setViewMode,
    setSearchResults,
    clearError,
    getFilteredProducts,
    getCategoryCounts,
  } = useProductSearch();

  // Local refs for file inputs
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const searchImageInputRef = useRef<HTMLInputElement>(null);

  // Drag state for upload zone
  const [isDragging, setIsDragging] = useState(false);

  // Batch info detail popover state
  const [showDeviceDetail, setShowDeviceDetail] = useState(false);

  // Derived state
  const hasProducts = products.length > 0;
  const hasResults = searchResults.length > 0;
  const showResults = searchQuery.trim().length > 0 && hasResults;
  const categoryCounts = getCategoryCounts();
  const filteredProducts = getFilteredProducts();
  const acceptTypes = ACCEPTED_IMAGE_TYPES.join(',');

  /** Handle file upload from input */
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      uploadProducts(Array.from(files));
    }
    // Reset input so the same files can be re-uploaded
    e.target.value = '';
  };

  /** Handle image search from input */
  const handleImageSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      searchByImage(file);
    }
    e.target.value = '';
  };

  /** Handle drag events for upload zone */
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      ACCEPTED_IMAGE_TYPES.includes(f.type as (typeof ACCEPTED_IMAGE_TYPES)[number])
    );
    if (files.length > 0) {
      uploadProducts(files);
    }
  };

  /** Handle search on Enter key */
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      searchProducts(searchQuery);
    }
  };

  /** Handle category toggle */
  const handleCategoryToggle = (category: string) => {
    if (selectedCategory === category) {
      setSelectedCategory(null);
    } else {
      setSelectedCategory(category);
    }
  };

  return (
    <div className="h-[calc(100vh-4rem)] bg-poster-bg text-poster-text-main font-sans selection:bg-poster-primary/30 relative overflow-hidden">
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
              <IconBox size="sm">
                <Zap className="w-4 h-4 text-poster-primary" />
              </IconBox>
              <div>
                <h1 className="text-sm font-semibold text-poster-text-main leading-tight">
                  Product Search
                </h1>
                <p className="text-[11px] text-poster-text-sub/60 leading-tight">
                  Visual Discovery
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-md bg-poster-primary/10 text-[11px] font-medium text-poster-primary border border-poster-primary/20">
              CLIP {MODEL_SIZE}
            </span>
            {/* Batch size badge with device profile detail */}
            {batchInfo && (
              <div className="relative">
                <button
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors',
                    'bg-poster-accent-teal/10 text-poster-accent-teal border-poster-accent-teal/20',
                    'hover:bg-poster-accent-teal/15'
                  )}
                  onClick={() => setShowDeviceDetail((prev) => !prev)}
                  title="Optimized for your device"
                >
                  <Cpu className="w-3 h-3" />
                  Batch: {batchInfo.batchSize}
                </button>
                {showDeviceDetail && (
                  <div className="absolute right-0 top-full mt-1.5 z-50 w-64 rounded-lg bg-poster-surface border border-poster-border/30 shadow-xl p-3 space-y-2 animate-in fade-in slide-in-from-top-1 duration-150">
                    <div className="text-[11px] font-semibold text-poster-text-main">Device Profile</div>
                    <div className="space-y-1.5 text-[11px] text-poster-text-sub">
                      <div className="flex items-center justify-between">
                        <span>Cores</span>
                        <span className="font-medium text-poster-text-main">{batchInfo.deviceProfile.cores}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Memory</span>
                        <span className="font-medium text-poster-text-main">{batchInfo.deviceProfile.memoryGB}GB RAM</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>GPU</span>
                        <span className="font-medium text-poster-text-main">{batchInfo.deviceProfile.hasGPU ? 'Available' : 'Not available'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Source</span>
                        <span className={cn(
                          'font-medium',
                          batchInfo.deviceProfile.source === 'detected' ? 'text-poster-accent-teal' : 'text-poster-text-sub'
                        )}>
                          {batchInfo.deviceProfile.source === 'detected' ? 'Detected' : batchInfo.deviceProfile.source === 'fallback' ? 'Estimated' : 'Override'}
                        </span>
                      </div>
                    </div>
                    <div className="pt-1.5 border-t border-poster-border/20 text-[10px] text-poster-text-sub/50">
                      {formatDeviceProfile(batchInfo.deviceProfile)}
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* View mode toggle */}
            <div className="join">
              <button
                className={cn(
                  'join-item btn btn-xs',
                  viewMode === 'grid'
                    ? 'btn-primary'
                    : 'btn-ghost border-poster-border/20'
                )}
                onClick={() => setViewMode('grid')}
              >
                <Grid3X3 className="w-3 h-3" />
              </button>
              <button
                className={cn(
                  'join-item btn btn-xs',
                  viewMode === 'list'
                    ? 'btn-primary'
                    : 'btn-ghost border-poster-border/20'
                )}
                onClick={() => setViewMode('list')}
              >
                <List className="w-3 h-3" />
              </button>
            </div>
            {hasProducts && (
              <Button variant="ghost" size="xs" onClick={clearAllProducts}>
                <Trash2 className="w-3 h-3 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Gradient accent line */}
        <div className="h-px bg-gradient-to-r from-transparent via-poster-primary to-transparent opacity-40" />

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left sidebar */}
          <div className="w-64 min-w-64 hidden lg:flex flex-col border-r border-poster-border/20 bg-poster-surface/30 overflow-y-auto">
            {/* Upload card */}
            <div className="p-4 border-b border-poster-border/20">
              <div className="flex items-center gap-2 text-sm font-medium text-poster-text-sub mb-3">
                <Upload className="w-4 h-4" />
                Upload Products
              </div>
              <div
                className={cn(
                  'border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all duration-200',
                  isDragging
                    ? 'border-poster-primary bg-poster-primary/10'
                    : 'border-poster-border/30 hover:border-poster-primary/50 hover:bg-poster-primary/5'
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => uploadInputRef.current?.click()}
              >
                {isProcessing ? (
                  <div className="flex flex-col items-center gap-2 py-2">
                    <Spinner size="md" className="text-poster-primary" />
                    <p className="text-xs text-poster-text-sub">Processing...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-2">
                    <ImagePlus className="w-6 h-6 text-poster-text-sub/40" />
                    <p className="text-xs text-poster-text-sub/60">
                      Drop images or click to upload
                    </p>
                    <p className="text-[10px] text-poster-text-sub/30">PNG, JPEG, WebP</p>
                  </div>
                )}
              </div>
              <input
                ref={uploadInputRef}
                type="file"
                accept={acceptTypes}
                multiple
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>

            {/* Categories card */}
            <div className="p-4 flex-1">
              <div className="flex items-center gap-2 text-sm font-medium text-poster-text-sub mb-3">
                <Tag className="w-4 h-4" />
                Categories
              </div>
              <div className="space-y-1">
                {CATEGORIES.map((category) => {
                  const count = categoryCounts[category] || 0;
                  const isSelected = selectedCategory === category;
                  return (
                    <button
                      key={category}
                      className={cn(
                        'flex items-center justify-between w-full px-3 py-2 rounded-lg text-xs transition-colors',
                        isSelected
                          ? 'bg-poster-primary/15 text-poster-primary'
                          : 'text-poster-text-sub hover:bg-poster-surface-lighter/30 hover:text-poster-text-main'
                      )}
                      onClick={() => handleCategoryToggle(category)}
                    >
                      <span className="truncate">{category}</span>
                      {count > 0 && (
                        <span
                          className={cn(
                            'badge badge-sm',
                            isSelected ? 'badge-primary' : 'badge-ghost'
                          )}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {selectedCategory && (
                <button
                  className="mt-3 text-[11px] text-poster-text-sub/50 hover:text-poster-primary transition-colors"
                  onClick={() => setSelectedCategory(null)}
                >
                  Clear filter
                </button>
              )}
            </div>
          </div>

          {/* Main area */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-6 space-y-6">
              {/* Error Alert */}
              {error && (
                <ErrorAlert message={error.message} onDismiss={clearError} onRetry={clearError} />
              )}

              {/* Search bar */}
              {hasProducts && (
                <ErrorBoundary>
                  <div className="flex gap-2">
                    <div className="relative group flex-1">
                      <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                        {isSearching ? (
                          <Spinner size="sm" className="text-poster-primary" />
                        ) : (
                          <Search className="w-5 h-5 text-poster-text-sub/30 group-focus-within:text-poster-primary transition-colors" />
                        )}
                      </div>
                      <input
                        type="text"
                        placeholder="Search products by description..."
                        className={cn(
                          'input input-lg w-full pl-12 pr-28 shadow-sm',
                          'bg-poster-surface border-poster-border/20 text-poster-text-main',
                          'focus:border-poster-primary/50 focus:shadow-lg focus:shadow-poster-primary/5',
                          'placeholder:text-poster-text-sub/30 transition-all duration-200',
                          'rounded-xl text-[15px]'
                        )}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={handleSearchKeyDown}
                      />
                      <div className="absolute inset-y-0 right-4 flex items-center gap-2">
                        {searchQuery && (
                          <button
                            className="text-poster-text-sub/30 hover:text-poster-text-main transition-colors"
                            onClick={() => {
                              setSearchQuery('');
                              setSearchResults([]);
                            }}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                        <span className="text-[11px] text-poster-text-sub/30 font-medium">
                          Press Enter
                        </span>
                      </div>
                    </div>
                    {/* Image search button */}
                    <button
                      className={cn(
                        'btn btn-ghost btn-lg rounded-xl border border-poster-border/20',
                        'hover:border-poster-primary/50 hover:bg-poster-primary/5 transition-all'
                      )}
                      onClick={() => searchImageInputRef.current?.click()}
                      title="Search by image"
                    >
                      <ImagePlus className="w-5 h-5 text-poster-text-sub/50" />
                    </button>
                    <input
                      ref={searchImageInputRef}
                      type="file"
                      accept={acceptTypes}
                      className="hidden"
                      onChange={handleImageSearch}
                    />
                  </div>
                  {/* Threshold indicator */}
                  <div className="flex items-center gap-1.5 text-[11px] text-poster-text-sub/50">
                    <Gauge className="w-3 h-3" />
                    <span>Min. similarity: {Math.round(threshold * 100)}%</span>
                  </div>
                </ErrorBoundary>
              )}

              {/* Mobile upload button (shown on small screens without sidebar) */}
              {!hasProducts && (
                <div className="lg:hidden">
                  <input
                    ref={uploadInputRef}
                    type="file"
                    accept={acceptTypes}
                    multiple
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </div>
              )}

              {/* Empty state */}
              {!hasProducts && (
                <div className="flex flex-col items-center pt-12 pb-8 animate-in fade-in duration-500">
                  <div className="relative mb-6">
                    <div className="w-20 h-20 rounded-2xl bg-poster-primary/10 flex items-center justify-center ring-1 ring-poster-primary/20">
                      <Zap className="w-10 h-10 text-poster-primary" />
                    </div>
                    <div className="absolute -top-1 -right-1 w-6 h-6 rounded-lg bg-poster-accent-orange/15 flex items-center justify-center ring-1 ring-poster-accent-orange/25">
                      <Sparkles className="w-3.5 h-3.5 text-poster-accent-orange" />
                    </div>
                  </div>
                  <h2 className="text-2xl font-bold text-poster-text-main mb-2">Catalog Empty</h2>
                  <p className="text-sm text-poster-text-sub/70 text-center max-w-md mb-6">
                    Upload product images to build a visual catalog. CLIP will auto-categorize and
                    enable visual similarity search across your products.
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => uploadInputRef.current?.click()}
                    loading={isProcessing}
                    className="gap-1.5"
                  >
                    <Upload className="w-4 h-4" />
                    Upload Products
                  </Button>
                </div>
              )}

              {/* Search Results */}
              {showResults && (
                <ErrorBoundary>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-poster-text-sub">
                      <Sparkles className="w-4 h-4 text-poster-accent-orange" />
                      {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found
                    </div>
                    <div
                      className={cn(
                        viewMode === 'grid'
                          ? 'grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3'
                          : 'space-y-3'
                      )}
                    >
                      {searchResults.map((result, index) =>
                        viewMode === 'grid' ? (
                          <SearchResultGridCard key={result.product.id} result={result} index={index} onDelete={deleteProduct} />
                        ) : (
                          <SearchResultListCard key={result.product.id} result={result} index={index} onDelete={deleteProduct} />
                        )
                      )}
                    </div>
                  </div>
                </ErrorBoundary>
              )}

              {/* No results message */}
              {searchQuery.trim().length > 0 && !hasResults && !isSearching && hasProducts && (
                <div className="text-center py-10 text-poster-text-sub/40 text-sm">
                  No results found. Press Enter to search.
                </div>
              )}

              {/* Product grid */}
              {hasProducts && !showResults && (
                <ErrorBoundary>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-poster-text-sub">
                      <Package className="w-4 h-4" />
                      {selectedCategory ? `${selectedCategory} ` : 'All Products '}
                      ({filteredProducts.length})
                    </div>
                    <div
                      className={cn(
                        viewMode === 'grid'
                          ? 'grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3'
                          : 'space-y-3'
                      )}
                    >
                      {filteredProducts.map((product, index) =>
                        viewMode === 'grid' ? (
                          <ProductGridCard key={product.id} product={product} index={index} onDelete={deleteProduct} />
                        ) : (
                          <ProductListCard key={product.id} product={product} index={index} onDelete={deleteProduct} />
                        )
                      )}
                    </div>
                  </div>
                </ErrorBoundary>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Product Grid Card
// ============================================================================

/** Props for the ProductGridCard component */
interface ProductGridCardProps {
  /** Product to display */
  product: Product;
  /** Index for staggered animation */
  index: number;
  /** Callback to delete the product */
  onDelete: (id: string) => void;
}

/** Product card in grid view */
function ProductGridCard({ product, index, onDelete }: ProductGridCardProps) {
  return (
    <div
      className={cn(
        'card bg-poster-surface border border-poster-border/20 shadow-sm group overflow-hidden',
        'hover:border-poster-primary/25 hover:shadow-md transition-all duration-200',
        'animate-in fade-in slide-in-from-bottom-2'
      )}
      style={{ animationDelay: `${index * 40}ms`, animationFillMode: 'both' }}
    >
      {/* Image */}
      <div className="relative aspect-square overflow-hidden">
        <img
          src={product.dataUrl}
          alt={product.fileName}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {/* Category badge overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
            <span className="badge badge-sm bg-poster-primary/90 text-white border-none">
              {product.category}
            </span>
            <button
              className="p-1.5 rounded-lg bg-black/40 text-white/70 hover:text-error hover:bg-error/20 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(product.id);
              }}
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
      {/* Card body */}
      <div className="card-body p-3">
        <p className="text-xs text-poster-text-main font-medium truncate">{product.fileName}</p>
        <div className="flex items-center gap-1 text-[11px] text-poster-text-sub/50">
          <Tag className="w-3 h-3" />
          <span>Similar to {product.similarCount} item{product.similarCount !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Product List Card
// ============================================================================

/** Props for the ProductListCard component */
interface ProductListCardProps {
  /** Product to display */
  product: Product;
  /** Index for staggered animation */
  index: number;
  /** Callback to delete the product */
  onDelete: (id: string) => void;
}

/** Product card in list view */
function ProductListCard({ product, index, onDelete }: ProductListCardProps) {
  return (
    <div
      className={cn(
        'card bg-poster-surface border border-poster-border/20 shadow-sm group',
        'hover:border-poster-primary/25 hover:shadow-md transition-all duration-200',
        'animate-in fade-in slide-in-from-bottom-2'
      )}
      style={{ animationDelay: `${index * 40}ms`, animationFillMode: 'both' }}
    >
      <div className="card-body p-3 flex-row items-center gap-4">
        {/* Thumbnail */}
        <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0">
          <img
            src={product.dataUrl}
            alt={product.fileName}
            className="w-full h-full object-cover"
          />
        </div>
        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-poster-text-main font-medium truncate">{product.fileName}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="badge badge-sm badge-ghost">{product.category}</span>
            <span className="text-[11px] text-poster-text-sub/50 flex items-center gap-1">
              <Tag className="w-3 h-3" />
              Similar to {product.similarCount} item{product.similarCount !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        {/* Delete */}
        <button
          className="opacity-0 group-hover:opacity-100 transition-opacity text-poster-text-sub/30 hover:text-error shrink-0 p-1.5 rounded-lg hover:bg-error/10"
          onClick={() => onDelete(product.id)}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Search Result Grid Card
// ============================================================================

/** Props for the SearchResultGridCard component */
interface SearchResultGridCardProps {
  /** Search result to display */
  result: SearchResultType;
  /** Index for staggered animation */
  index: number;
  /** Callback to delete the product */
  onDelete: (id: string) => void;
}

/** Search result card in grid view */
function SearchResultGridCard({ result, index, onDelete }: SearchResultGridCardProps) {
  const { product, score } = result;

  return (
    <div
      className={cn(
        'card bg-poster-surface border border-poster-border/20 shadow-sm group overflow-hidden',
        'hover:border-poster-primary/25 hover:shadow-md transition-all duration-200',
        'animate-in fade-in slide-in-from-bottom-2'
      )}
      style={{ animationDelay: `${index * 60}ms`, animationFillMode: 'both' }}
    >
      {/* Image */}
      <div className="relative aspect-square overflow-hidden">
        <img
          src={product.dataUrl}
          alt={product.fileName}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {/* Score badge */}
        <div className="absolute top-2 right-2">
          <span
            className={cn(
              'badge badge-sm font-semibold',
              score >= 0.8
                ? 'badge-success'
                : score >= 0.6
                  ? 'badge-warning'
                  : 'badge-ghost text-poster-accent-orange'
            )}
          >
            {formatScore(score)}
          </span>
        </div>
        {/* Category badge overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
            <span className="badge badge-sm bg-poster-primary/90 text-white border-none">
              {product.category}
            </span>
            <button
              className="p-1.5 rounded-lg bg-black/40 text-white/70 hover:text-error hover:bg-error/20 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(product.id);
              }}
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
      {/* Card body */}
      <div className="card-body p-3">
        <p className="text-xs text-poster-text-main font-medium truncate">{product.fileName}</p>
        <div className="flex items-center gap-1 text-[11px] text-poster-text-sub/50">
          <Tag className="w-3 h-3" />
          <span>Similar to {product.similarCount} item{product.similarCount !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Search Result List Card
// ============================================================================

/** Props for the SearchResultListCard component */
interface SearchResultListCardProps {
  /** Search result to display */
  result: SearchResultType;
  /** Index for staggered animation */
  index: number;
  /** Callback to delete the product */
  onDelete: (id: string) => void;
}

/** Search result card in list view */
function SearchResultListCard({ result, index, onDelete }: SearchResultListCardProps) {
  const { product, score } = result;

  return (
    <div
      className={cn(
        'card bg-poster-surface border border-poster-border/20 shadow-sm group',
        'hover:border-poster-primary/25 hover:shadow-md transition-all duration-200',
        'animate-in fade-in slide-in-from-bottom-2'
      )}
      style={{ animationDelay: `${index * 60}ms`, animationFillMode: 'both' }}
    >
      <div className="card-body p-3 flex-row items-center gap-4">
        {/* Thumbnail */}
        <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0">
          <img
            src={product.dataUrl}
            alt={product.fileName}
            className="w-full h-full object-cover"
          />
        </div>
        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-poster-text-main font-medium truncate">{product.fileName}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="badge badge-sm badge-ghost">{product.category}</span>
            <span className="text-[11px] text-poster-text-sub/50 flex items-center gap-1">
              <Tag className="w-3 h-3" />
              Similar to {product.similarCount} item{product.similarCount !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        {/* Score badge */}
        <div
          className={cn(
            'badge badge-sm shrink-0 font-semibold',
            score >= 0.8
              ? 'badge-success'
              : score >= 0.6
                ? 'badge-warning'
                : 'badge-ghost text-poster-accent-orange'
          )}
        >
          {formatScore(score)}
        </div>
        {/* Delete */}
        <button
          className="opacity-0 group-hover:opacity-100 transition-opacity text-poster-text-sub/30 hover:text-error shrink-0 p-1.5 rounded-lg hover:bg-error/10"
          onClick={() => onDelete(product.id)}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
