/**
 * @file use-photo-search.ts
 * @description Hook for managing cross-modal photo search interactions.
 *
 * Uses useBatchOperation from @localmode/react to batch-embed uploaded photos
 * with concurrency=1 (CLIP is not parallelizable). Owns all ML/async state via
 * useState and returns it to components.
 */
'use client';

import { useState, useRef } from 'react';
import { useBatchOperation, readFileAsDataUrl } from '@localmode/react';
import {
  indexPhoto,
  searchByText as searchByTextService,
  searchByImage as searchByImageService,
  removePhoto as removePhotoService,
  clearAll as clearAllService,
} from '../_services/search.service';
import { generatePhotoId } from '../_lib/utils';
import { ACCEPTED_IMAGE_TYPES } from '../_lib/constants';
import type { Photo, SearchResult, SearchMode, AppError } from '../_lib/types';

/** Input item for the batch processor */
interface PhotoUploadItem {
  /** The image file to process */
  file: File;
}

/** Output result from processing a single photo */
interface PhotoProcessResult {
  /** The indexed photo */
  photo: Photo;
}

/** Hook for cross-modal photo search operations */
export function usePhotoSearch() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchMode, setSearchMode] = useState<SearchMode>('text');
  const [isIndexing, setIsIndexing] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [indexProgress, setIndexProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<AppError | null>(null);

  // Ref for setPhotos inside batch fn
  const setPhotosRef = useRef(setPhotos);
  setPhotosRef.current = setPhotos;

  // Ref for progress tracking inside batch fn
  const progressRef = useRef({ current: 0, total: 0 });

  /** Clear error state */
  const clearError = () => setError(null);

  /**
   * Batch operation: read each photo as data URL, embed with CLIP, and index.
   * Per-item state updates happen inside the fn so thumbnails appear
   * immediately as each photo is processed.
   */
  const batch = useBatchOperation<PhotoUploadItem, PhotoProcessResult>({
    fn: async (item, signal) => {
      const dataUrl = await readFileAsDataUrl(item.file);

      const photo: Photo = {
        id: generatePhotoId(),
        dataUrl,
        fileName: item.file.name,
        isProcessing: true,
      };

      // Add to state immediately so user sees the thumbnail
      setPhotosRef.current((prev) => [...prev, photo]);

      try {
        await indexPhoto(photo, signal);

        // Mark as done
        setPhotosRef.current((prev) =>
          prev.map((p) => (p.id === photo.id ? { ...p, isProcessing: false } : p))
        );

        // Update progress counter
        progressRef.current.current += 1;
        setIndexProgress({ ...progressRef.current });

        return { photo: { ...photo, isProcessing: false } };
      } catch (err) {
        // Remove failed photo from state
        setPhotosRef.current((prev) => prev.filter((p) => p.id !== photo.id));
        throw err;
      }
    },
    concurrency: 1,
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
    setIsIndexing(true);
    progressRef.current = { current: 0, total: validFiles.length };
    setIndexProgress({ current: 0, total: validFiles.length });

    try {
      await batch.execute(validFiles.map((file) => ({ file })));
    } catch (err) {
      if (err instanceof Error && err.message === 'Aborted') return;
      console.error('Upload failed:', err);
      setError({
        message: 'Failed to process photos. Please try again.',
        code: 'UPLOAD_FAILED',
        recoverable: true,
      });
    } finally {
      setIsIndexing(false);
    }
  };

  /**
   * Search photos by text query
   * @param query - The text search query
   */
  const searchByText = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    clearError();
    setIsSearching(true);

    try {
      const results = await searchByTextService(query);
      setSearchResults(results);
    } catch (err) {
      console.error('Text search failed:', err);
      setError({
        message: 'Search failed. Please try again.',
        code: 'SEARCH_FAILED',
        recoverable: true,
      });
    } finally {
      setIsSearching(false);
    }
  };

  /**
   * Search photos by reference image
   * @param imageDataUrl - Reference image as data URL
   */
  const searchByImage = async (imageDataUrl: string) => {
    clearError();
    setIsSearching(true);

    try {
      const results = await searchByImageService(imageDataUrl);
      setSearchResults(results);
    } catch (err) {
      console.error('Image search failed:', err);
      setError({
        message: 'Image search failed. Please try again.',
        code: 'IMAGE_SEARCH_FAILED',
        recoverable: true,
      });
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
      setError({
        message: 'Failed to delete photo. Please try again.',
        code: 'DELETE_FAILED',
        recoverable: true,
      });
    }
  };

  /** Clear all photos and reset state */
  const clearAllPhotos = async () => {
    clearError();
    try {
      await clearAllService();
      setPhotos([]);
      setSearchQuery('');
      setSearchResults([]);
      setError(null);
      batch.reset();
    } catch (err) {
      console.error('Failed to clear photos:', err);
      setError({
        message: 'Failed to clear photos. Please try again.',
        code: 'CLEAR_FAILED',
        recoverable: true,
      });
    }
  };

  /** Cancel any active indexing operation */
  const cancelIndexing = () => {
    batch.cancel();
    setIsIndexing(false);
  };

  return {
    // State
    photos,
    searchQuery,
    searchResults,
    searchMode,
    isIndexing,
    isSearching,
    indexProgress,
    error,
    // Actions
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
  };
}
