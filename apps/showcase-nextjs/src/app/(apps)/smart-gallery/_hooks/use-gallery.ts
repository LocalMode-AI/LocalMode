/**
 * @file use-gallery.ts
 * @description Hook for managing smart gallery interactions.
 *
 * Uses useBatchOperation from @localmode/react to process uploaded photos
 * concurrently. Pure data helpers are delegated to _lib/utils.ts.
 */
'use client';

import { useState, useRef } from 'react';
import { useBatchOperation, readFileAsDataUrl } from '@localmode/react';
import {
  classifyPhoto,
  indexPhoto,
  searchByText,
  removePhoto as removePhotoService,
  clearAll as clearAllService,
} from '../_services/gallery.service';
import { generatePhotoId, getCategories } from '../_lib/utils';
import { ACCEPTED_IMAGE_TYPES } from '../_lib/constants';
import type { GalleryPhoto, SearchResult, AppError } from '../_lib/types';

/** Input item for the batch processor */
interface PhotoUploadItem {
  /** The image file to process */
  file: File;
}

/** Output result from processing a single photo */
interface PhotoProcessResult {
  /** The final photo with category assigned */
  photo: GalleryPhoto;
}

/** Hook for smart gallery operations */
export function useGallery() {
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [error, setError] = useState<AppError | null>(null);

  // Ref for setPhotos inside batch fn
  const setPhotosRef = useRef(setPhotos);
  setPhotosRef.current = setPhotos;

  /** Clear error state */
  const clearError = () => setError(null);

  /**
   * Batch operation: process each uploaded photo (read, classify, index).
   * Per-item state updates happen inside the fn so thumbnails appear
   * immediately and categories update as each photo completes.
   */
  const batch = useBatchOperation<PhotoUploadItem, PhotoProcessResult>({
    fn: async (item, signal) => {
      const dataUrl = await readFileAsDataUrl(item.file);

      const photo: GalleryPhoto = {
        id: generatePhotoId(),
        dataUrl,
        fileName: item.file.name,
        category: '',
        categoryScore: 0,
        isProcessing: true,
      };

      // Add to state immediately so user sees the thumbnail
      setPhotosRef.current((prev) => [...prev, photo]);

      try {
        const { label, score } = await classifyPhoto(photo.dataUrl, signal);

        const updatedPhoto: GalleryPhoto = {
          ...photo,
          category: label,
          categoryScore: score,
          isProcessing: false,
        };

        setPhotosRef.current((prev) =>
          prev.map((p) =>
            p.id === photo.id
              ? { ...p, category: label, categoryScore: score, isProcessing: false }
              : p
          )
        );

        await indexPhoto(updatedPhoto, signal);
        return { photo: updatedPhoto };
      } catch (err) {
        setPhotosRef.current((prev) =>
          prev.map((p) =>
            p.id === photo.id
              ? { ...p, category: 'other', categoryScore: 0, isProcessing: false }
              : p
          )
        );
        throw err;
      }
    },
    concurrency: 3,
  });

  /**
   * Upload and process multiple photo files
   * @param files - Image files to upload
   */
  const uploadPhotos = async (files: File[]) => {
    const validFiles = files.filter((f) => ACCEPTED_IMAGE_TYPES.includes(f.type));

    if (validFiles.length === 0) {
      setError({
        message: 'Please upload valid image files (PNG, JPEG, or WebP)',
        code: 'INVALID_FILE_TYPE',
        recoverable: true,
      });
      return;
    }

    clearError();
    setIsProcessing(true);

    try {
      await batch.execute(validFiles.map((file) => ({ file })));
    } catch (err) {
      if (err instanceof Error && err.message === 'Aborted') return;
      console.error('Upload failed:', err);
      setError({ message: 'Failed to upload photos. Please try again.', code: 'UPLOAD_FAILED', recoverable: true });
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Search photos by text query
   * @param query - The search query
   */
  const searchPhotos = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    clearError();
    setIsSearching(true);

    try {
      setSearchResults(await searchByText(query));
    } catch (err) {
      console.error('Search failed:', err);
      setError({ message: 'Search failed. Please try again.', code: 'SEARCH_FAILED', recoverable: true });
    } finally {
      setIsSearching(false);
    }
  };

  /**
   * Delete a photo by ID
   * @param id - The photo ID to delete
   */
  const deletePhoto = async (id: string) => {
    clearError();
    try {
      await removePhotoService(id);
      setPhotos((prev) => prev.filter((p) => p.id !== id));
      setSearchResults((prev) => prev.filter((r) => r.photo.id !== id));
    } catch (err) {
      console.error('Failed to delete photo:', err);
      setError({ message: 'Failed to delete photo. Please try again.', code: 'DELETE_FAILED', recoverable: true });
    }
  };

  /** Clear all photos and reset gallery */
  const clearAllPhotos = async () => {
    clearError();
    try {
      await clearAllService();
      setPhotos([]);
      setSearchQuery('');
      setSearchResults([]);
      setActiveCategory(null);
      setError(null);
      batch.reset();
    } catch (err) {
      console.error('Failed to clear gallery:', err);
      setError({ message: 'Failed to clear gallery. Please try again.', code: 'CLEAR_FAILED', recoverable: true });
    }
  };

  /** Cancel any active processing */
  const cancelProcessing = () => {
    batch.cancel();
    setIsProcessing(false);
  };

  return {
    // State
    photos,
    searchQuery,
    viewMode,
    searchResults,
    isProcessing,
    isSearching,
    activeCategory,
    error,
    // Actions
    uploadPhotos,
    searchPhotos,
    deletePhoto,
    clearAllPhotos,
    cancelProcessing,
    setSearchQuery,
    setViewMode,
    setActiveCategory,
    setSearchResults,
    clearError,
    // Derived state
    getCategories: () => getCategories(photos),
  };
}
