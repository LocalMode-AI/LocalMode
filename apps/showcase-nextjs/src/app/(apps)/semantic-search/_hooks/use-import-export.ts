/**
 * @file use-import-export.ts
 * @description Hook for importing/exporting vector data in the semantic-search app.
 * Wraps useImportExport() from @localmode/react with file reading, size validation,
 * and a two-step preview -> confirm flow.
 */
'use client';

import { useState } from 'react';
import { useImportExport, validateFile, toAppError } from '@localmode/react';
import type { VectorDB, EmbeddingModel, ParseResult, ImportStats, ImportProgress } from '@localmode/core';
import type { AppError } from '../_lib/types';
import {
  ACCEPTED_IMPORT_MIMES,
  MAX_IMPORT_FILE_SIZE,
  EXPORT_FILENAME,
} from '../_lib/constants';

/** Options for useImportExportNotes hook */
interface UseImportExportNotesOptions {
  /** VectorDB instance (may be null during init) */
  db: VectorDB | null;
  /** Embedding model for re-embedding text-only records */
  model: EmbeddingModel;
}

/**
 * Hook for importing and exporting vector data in the semantic-search app.
 *
 * Wraps `useImportExport()` from `@localmode/react` with:
 * - File validation (size, type)
 * - Two-step flow: importFile() for preview, confirmImport() to execute
 * - Stored file content between preview and confirm
 *
 * @param options - VectorDB instance and embedding model
 */
export function useImportExportNotes({ db, model }: UseImportExportNotesOptions) {
  // Local file content state for the two-step preview -> confirm flow
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [localError, setLocalError] = useState<AppError | null>(null);

  // Build the db proxy that satisfies UseImportExportOptions.db
  // The useImportExport hook needs { dimensions, addMany, export? }
  const dbProxy = db
    ? {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        dimensions: (db as any).dimensions as number,
        addMany: db.addMany.bind(db),
        export: db.export.bind(db),
      }
    : { dimensions: 0, addMany: async () => {}, export: async () => new Blob() };

  const {
    isImporting,
    isParsing,
    isExporting,
    progress,
    stats,
    parseResult,
    error: hookError,
    importData,
    parsePreview,
    exportCSV,
    exportJSONL,
    cancel,
    reset: hookReset,
  } = useImportExport({
    db: dbProxy,
    model,
    exportFilename: EXPORT_FILENAME,
  });

  /**
   * Read a file and run parsePreview to show the import preview panel.
   * Validates file size before reading.
   */
  const importFile = async (file: File) => {
    setLocalError(null);

    // Validate file size and type
    const validationError = validateFile({
      file,
      accept: ACCEPTED_IMPORT_MIMES,
      maxSize: MAX_IMPORT_FILE_SIZE,
    });
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    try {
      const content = await file.text();
      setFileContent(content);
      await parsePreview({ content });
    } catch (err) {
      console.error('Failed to read import file:', err);
      setLocalError({
        message: err instanceof Error ? err.message : 'Failed to read file',
        recoverable: true,
      });
    }
  };

  /**
   * Confirm the import after preview, using stored file content and detected format.
   * Returns the ImportStats on success, or null on failure/cancel.
   */
  const confirmImport = async (): Promise<ImportStats | null> => {
    if (!fileContent || !parseResult) return null;
    setLocalError(null);

    const result = await importData({
      content: fileContent,
      format: parseResult.format,
    });

    // Clear stored file content after import (success or fail)
    setFileContent(null);
    return result;
  };

  /** Dismiss the preview panel and reset all import/export state */
  const dismissPreview = () => {
    setFileContent(null);
    setLocalError(null);
    hookReset();
  };

  // Merge errors: local validation errors take priority
  const error: AppError | null = localError ?? hookError ?? null;

  /** Reset local error and hook error */
  const reset = () => {
    setLocalError(null);
    hookReset();
  };

  return {
    // Actions
    importFile,
    confirmImport,
    dismissPreview,
    exportCSV,
    exportJSONL,
    cancel,
    reset,
    // State
    isImporting,
    isParsing,
    isExporting,
    progress: progress as ImportProgress | null,
    stats: stats as ImportStats | null,
    parseResult: parseResult as ParseResult | null,
    error,
    // Derived
    hasPreview: parseResult !== null,
    hasStats: stats !== null,
  };
}
