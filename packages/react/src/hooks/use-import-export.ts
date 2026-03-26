/**
 * @file use-import-export.ts
 * @description Hook for vector data import/export operations with React state management
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  importFrom as coreImportFrom,
  parseExternalFormat as coreParseExternalFormat,
  exportToCSV as coreExportToCSV,
  exportToJSONL as coreExportToJSONL,
} from '@localmode/core';
import type {
  ImportRecord,
  ParseResult,
  ImportStats,
  ImportProgress,
  ExternalFormat,
  EmbeddingModel,
} from '@localmode/core';
import { toAppError } from '../core/app-error.js';
import { downloadBlob } from '../helpers/download.js';

const IS_SERVER = typeof window === 'undefined';

/** Options for the useImportExport hook */
export interface UseImportExportOptions {
  /** Target VectorDB instance */
  db: {
    readonly dimensions: number;
    addMany(docs: Array<{ id: string; vector: Float32Array; metadata?: Record<string, unknown> }>): Promise<void>;
    export?(options?: { includeVectors?: boolean }): Promise<Blob>;
  };
  /** Embedding model for re-embedding text-only records */
  model?: EmbeddingModel;
  /** Records per batch (default: 100) */
  batchSize?: number;
  /** Base filename for exports (default: 'vectordb-export') */
  exportFilename?: string;
}

/** Options for importData action */
interface ImportDataOptions {
  /** Raw content string to import */
  content: string;
  /** Source format (auto-detected if omitted) */
  format?: ExternalFormat;
}

/** Options for parsePreview action */
interface ParsePreviewOptions {
  /** Raw content string to parse */
  content: string;
  /** Source format (auto-detected if omitted) */
  format?: ExternalFormat;
}

/**
 * Hook for vector data import/export operations.
 *
 * Wraps `importFrom()`, `parseExternalFormat()`, `exportToCSV()`, and `exportToJSONL()`
 * with React state management including loading states, progress tracking,
 * error handling, and cancellation.
 *
 * @param options - Hook configuration
 * @returns State and action functions for import/export operations
 *
 * @example
 * ```tsx
 * const {
 *   importData, parsePreview, exportCSV, exportJSONL,
 *   isImporting, isParsing, isExporting,
 *   progress, stats, parseResult, error,
 *   cancel, reset,
 * } = useImportExport({ db: myVectorDB, model: embeddingModel });
 *
 * // Preview before import
 * await parsePreview({ content: fileContent });
 *
 * // Import data
 * await importData({ content: fileContent, format: 'pinecone' });
 *
 * // Export data
 * exportCSV();
 * exportJSONL();
 * ```
 */
export function useImportExport(options: UseImportExportOptions) {
  const { db, model, batchSize = 100, exportFilename = 'vectordb-export' } = options;

  const [isImporting, setIsImporting] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [stats, setStats] = useState<ImportStats | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  const importData = useCallback(async (opts: ImportDataOptions) => {
    if (IS_SERVER) return null;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsImporting(true);
    setError(null);
    setStats(null);
    setProgress(null);

    try {
      const result = await coreImportFrom({
        db,
        content: opts.content,
        format: opts.format,
        model,
        batchSize,
        abortSignal: controller.signal,
        onProgress: (p) => {
          if (mountedRef.current && !controller.signal.aborted) {
            setProgress(p);
          }
        },
      });

      if (mountedRef.current && !controller.signal.aborted) {
        setStats(result);
        setIsImporting(false);
        return result;
      }
      return null;
    } catch (err) {
      if (!mountedRef.current) return null;

      if (err instanceof DOMException && err.name === 'AbortError') {
        setIsImporting(false);
        return null;
      }
      if (err instanceof Error && err.name === 'AbortError') {
        setIsImporting(false);
        return null;
      }

      setError(err instanceof Error ? err : new Error(String(err)));
      setIsImporting(false);
      return null;
    }
  }, [db, model, batchSize]);

  const parsePreview = useCallback(async (opts: ParsePreviewOptions) => {
    if (IS_SERVER) return null;

    setIsParsing(true);
    setError(null);
    setParseResult(null);

    try {
      const result = coreParseExternalFormat(opts.content, { format: opts.format });

      if (mountedRef.current) {
        setParseResult(result);
        setIsParsing(false);
        return result;
      }
      return null;
    } catch (err) {
      if (!mountedRef.current) return null;
      setError(err instanceof Error ? err : new Error(String(err)));
      setIsParsing(false);
      return null;
    }
  }, []);

  const exportCSV = useCallback(async () => {
    if (IS_SERVER || !db.export) return;

    setIsExporting(true);
    setError(null);

    try {
      const blob = await db.export({ includeVectors: true });
      const text = await blob.text();
      const data = JSON.parse(text);

      // Convert internal format to ImportRecord[]
      const records: ImportRecord[] = [];
      for (const col of data.collections ?? []) {
        for (const doc of col.documents ?? []) {
          records.push({
            id: doc.id,
            vector: doc.vector ? new Float32Array(doc.vector) : undefined,
            text: doc.metadata?.text,
            metadata: doc.metadata,
          });
        }
      }

      const csv = coreExportToCSV(records);
      downloadBlob(csv, `${exportFilename}.csv`, 'text/csv');

      if (mountedRef.current) {
        setIsExporting(false);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err : new Error(String(err)));
      setIsExporting(false);
    }
  }, [db, exportFilename]);

  const exportJSONL = useCallback(async () => {
    if (IS_SERVER || !db.export) return;

    setIsExporting(true);
    setError(null);

    try {
      const blob = await db.export({ includeVectors: true });
      const text = await blob.text();
      const data = JSON.parse(text);

      // Convert internal format to ImportRecord[]
      const records: ImportRecord[] = [];
      for (const col of data.collections ?? []) {
        for (const doc of col.documents ?? []) {
          records.push({
            id: doc.id,
            vector: doc.vector ? new Float32Array(doc.vector) : undefined,
            text: doc.metadata?.text,
            metadata: doc.metadata,
          });
        }
      }

      const jsonl = coreExportToJSONL(records);
      downloadBlob(jsonl, `${exportFilename}.jsonl`, 'application/jsonl');

      if (mountedRef.current) {
        setIsExporting(false);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err : new Error(String(err)));
      setIsExporting(false);
    }
  }, [db, exportFilename]);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsImporting(false);
    setIsParsing(false);
    setIsExporting(false);
    setProgress(null);
    setStats(null);
    setParseResult(null);
    setError(null);
  }, []);

  if (IS_SERVER) {
    return {
      isImporting: false,
      isParsing: false,
      isExporting: false,
      progress: null as ImportProgress | null,
      stats: null as ImportStats | null,
      parseResult: null as ParseResult | null,
      error: null,
      importData: async (_opts: ImportDataOptions) => null as ImportStats | null,
      parsePreview: async (_opts: ParsePreviewOptions) => null as ParseResult | null,
      exportCSV: async () => {},
      exportJSONL: async () => {},
      cancel: () => {},
      reset: () => {},
    };
  }

  return {
    isImporting,
    isParsing,
    isExporting,
    progress,
    stats,
    parseResult,
    error: toAppError(error),
    importData,
    parsePreview,
    exportCSV,
    exportJSONL,
    cancel,
    reset,
  };
}
