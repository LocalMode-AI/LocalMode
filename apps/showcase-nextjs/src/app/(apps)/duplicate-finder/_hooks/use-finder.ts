/**
 * @file use-finder.ts
 * @description Hook for managing duplicate finder workflow.
 *
 * Uses useSequentialBatch from @localmode/react for batch image feature
 * extraction with built-in progress tracking. Pure data helpers are
 * delegated to _lib/utils.ts.
 */
'use client';

import { useState, useRef } from 'react';
import { useSequentialBatch, readFileAsDataUrl } from '@localmode/react';
import { extractImageFeatures } from '@localmode/core';
import { getModel, FinderAbortError } from '../_services/finder.service';
import {
  groupDuplicates,
  toggleInSet,
  selectAllDuplicateIds,
  getDuplicateCount,
  getUniqueCount,
  removePhotosById,
} from '../_lib/utils';
import { ACCEPTED_IMAGE_TYPES, SIMILARITY_THRESHOLD } from '../_lib/constants';
import type { PhotoEntry, DuplicateGroup, ScanProgress, AppError } from '../_lib/types';

/** Hook for duplicate finder operations */
export function useFinder() {
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [scanPhase, setScanPhase] = useState<'idle' | 'embedding' | 'comparing'>('idle');
  const [isScanning, setIsScanning] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<AppError | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const featureModel = getModel();

  const featureBatch = useSequentialBatch({
    fn: async (dataUrl: string, signal: AbortSignal) => {
      const result = await extractImageFeatures({ model: featureModel, image: dataUrl, abortSignal: signal });
      return result.features;
    },
  });

  /** Clear error state */
  const clearError = () => setError(null);

  /** Reset the entire state */
  const reset = () => {
    setPhotos([]);
    setDuplicateGroups([]);
    setScanPhase('idle');
    setIsScanning(false);
    setSelectedIds(new Set());
    setError(null);
    featureBatch.reset();
  };

  /**
   * Upload files, extract features, and scan for duplicates
   * @param files - Image files to process
   */
  const uploadAndScan = async (files: File[]) => {
    const validFiles = files.filter((f) => ACCEPTED_IMAGE_TYPES.includes(f.type));

    if (validFiles.length === 0) {
      setError({
        message: 'Please upload valid image files (PNG, JPEG, or WebP)',
        recoverable: true,
      });
      return;
    }

    // Cancel any existing scan
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsScanning(true);
    clearError();

    try {
      // Phase 1: Read files and add to state
      const newPhotos: PhotoEntry[] = [];

      for (const file of validFiles) {
        if (abortController.signal.aborted) throw new FinderAbortError();

        const dataUrl = await readFileAsDataUrl(file);
        newPhotos.push({
          id: crypto.randomUUID(),
          dataUrl,
          fileName: file.name,
          embedding: null,
          isProcessing: true,
        });
      }

      let allPhotos: PhotoEntry[] = [];
      setPhotos((prev) => {
        allPhotos = [...prev, ...newPhotos];
        return allPhotos;
      });

      // Phase 2: Extract embeddings using useSequentialBatch
      setScanPhase('embedding');
      const photosNeedingEmbedding = allPhotos.filter((p) => p.embedding === null);

      const batchResults = await featureBatch.execute(
        photosNeedingEmbedding.map((p) => p.dataUrl)
      );

      if (abortController.signal.aborted) throw new FinderAbortError();

      // Apply results to photo state
      for (let i = 0; i < photosNeedingEmbedding.length; i++) {
        const photo = photosNeedingEmbedding[i];
        const embedding = batchResults[i] ?? new Float32Array(0);

        setPhotos((prev) =>
          prev.map((p) =>
            p.id === photo.id ? { ...p, embedding, isProcessing: false } : p
          )
        );
        const idx = allPhotos.findIndex((p) => p.id === photo.id);
        if (idx >= 0) allPhotos[idx] = { ...allPhotos[idx], embedding, isProcessing: false };
      }

      // Phase 3: Compare and group duplicates
      setScanPhase('comparing');
      setDuplicateGroups(groupDuplicates(allPhotos, SIMILARITY_THRESHOLD));
    } catch (err) {
      if (err instanceof FinderAbortError) return;
      console.error('Scan error:', err);
      setError({
        message: err instanceof Error ? err.message : 'Failed to scan for duplicates',
        recoverable: true,
      });
    } finally {
      setIsScanning(false);
      setScanPhase('idle');
    }
  };

  /** Delete all selected photos */
  const deleteSelected = () => {
    if (selectedIds.size === 0) return;
    const result = removePhotosById(photos, duplicateGroups, selectedIds);
    setPhotos(result.photos);
    setDuplicateGroups(result.groups);
    setSelectedIds(new Set());
  };

  /** Cancel the current scan */
  const cancelScan = () => {
    abortControllerRef.current?.abort();
    featureBatch.cancel();
    setIsScanning(false);
    setScanPhase('idle');
  };

  // Derive scanProgress from phase + featureBatch.progress for component compatibility
  const scanProgress: ScanProgress | null =
    scanPhase === 'embedding'
      ? { current: featureBatch.progress.current, total: featureBatch.progress.total, phase: 'embedding' }
      : scanPhase === 'comparing'
        ? { current: 0, total: 0, phase: 'comparing' }
        : null;

  return {
    // State
    photos,
    duplicateGroups,
    scanProgress,
    isScanning,
    selectedIds,
    error,
    // Actions
    uploadAndScan,
    deleteSelected,
    cancelScan,
    toggleSelected: (id: string) => setSelectedIds((prev) => toggleInSet(prev, id)),
    selectAllDuplicates: () => setSelectedIds(selectAllDuplicateIds(duplicateGroups)),
    clearSelection: () => setSelectedIds(new Set()),
    clearError,
    reset,
    // Derived state
    getDuplicateCount: () => getDuplicateCount(duplicateGroups),
    getUniqueCount: () => getUniqueCount(photos.length, duplicateGroups),
  };
}
