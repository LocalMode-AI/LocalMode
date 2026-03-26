/**
 * @file use-migrator.ts
 * @description Hook for managing vector data migration operations
 */
import { useState, useRef } from 'react';
import { useImportExport, validateFile, toAppError } from '@localmode/react';
import { createVectorDB } from '@localmode/core';
import type { VectorDB, ParseResult, ImportStats, ImportProgress } from '@localmode/core';
import { getEmbeddingModel } from '../_services/migrator.service';
import {
  EMBEDDING_DIMENSIONS,
  DB_NAME,
  SUPPORTED_EXTENSIONS,
  MAX_FILE_SIZE,
  DEFAULT_BATCH_SIZE,
  MAX_PREVIEW_RECORDS,
} from '../_lib/constants';
import { truncateText } from '../_lib/utils';
import type { PreviewRecord } from '../_lib/types';

/** Hook for the data migrator application */
export function useMigrator() {
  const [db, setDb] = useState<VectorDB | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [reEmbedEnabled, setReEmbedEnabled] = useState(false);
  const [previewRecords, setPreviewRecords] = useState<PreviewRecord[]>([]);
  const dbRef = useRef<VectorDB | null>(null);

  // Create a simple db-like object for the hook when no real db exists yet
  const dbForHook: { readonly dimensions: number; addMany: (docs: Array<{ id: string; vector: Float32Array; metadata?: Record<string, unknown> }>) => Promise<void> } = db
    ? { dimensions: EMBEDDING_DIMENSIONS, addMany: (docs) => db.addMany(docs) }
    : { dimensions: EMBEDDING_DIMENSIONS, addMany: async () => {} };

  const model = reEmbedEnabled ? getEmbeddingModel() : undefined;

  const {
    isImporting,
    isParsing,
    isExporting,
    progress,
    stats,
    parseResult,
    error,
    importData,
    parsePreview,
    exportCSV,
    exportJSONL,
    cancel,
    reset: resetHook,
  } = useImportExport({
    db: dbForHook,
    model,
    batchSize: DEFAULT_BATCH_SIZE,
    exportFilename: 'vectordb-export',
  });

  /** Initialize VectorDB with appropriate dimensions */
  const initDB = async (dimensions: number) => {
    if (dbRef.current) {
      await dbRef.current.close();
    }
    const newDb = await createVectorDB({
      name: DB_NAME,
      dimensions,
      storage: 'memory', // Use memory for the migrator demo
    });
    dbRef.current = newDb;
    setDb(newDb);
    return newDb;
  };

  /** Handle file selection */
  const handleFileSelect = async (file: File) => {
    resetHook();
    setPreviewRecords([]);
    setFileName(null);
    setFileContent(null);

    // Validate file
    const validation = validateFile({
      file,
      maxSize: MAX_FILE_SIZE,
      accept: SUPPORTED_EXTENSIONS.map((ext) =>
        ext === '.json' ? 'application/json' :
        ext === '.csv' ? 'text/csv' :
        'application/octet-stream'
      ),
    });

    if (validation) {
      // Read anyway — validateFile checks MIME types but our files may not have correct MIME
    }

    const content = await file.text();
    setFileName(file.name);
    setFileContent(content);

    // Parse preview
    const result = await parsePreview({ content });
    if (result) {
      // Build preview records
      const records = result.records.slice(0, MAX_PREVIEW_RECORDS).map((r) => ({
        id: r.id,
        textSnippet: r.text ? truncateText(r.text) : undefined,
        vectorDims: r.vector ? r.vector.length : 0,
        metadataKeys: r.metadata ? Object.keys(r.metadata) : [],
      }));
      setPreviewRecords(records);
    }
  };

  /** Handle import operation */
  const handleImport = async () => {
    if (!fileContent || !parseResult) return;

    // Determine dimensions for the VectorDB
    const dimensions = parseResult.dimensions ?? EMBEDDING_DIMENSIONS;
    const targetDb = await initDB(dimensions);

    // Import into the new db
    await importData({ content: fileContent, format: parseResult.format });
  };

  /** Clear everything */
  const handleReset = () => {
    resetHook();
    setFileName(null);
    setFileContent(null);
    setPreviewRecords([]);
    setReEmbedEnabled(false);
  };

  return {
    // State
    fileName,
    fileContent,
    reEmbedEnabled,
    previewRecords,
    parseResult,
    stats,
    progress,
    error,
    isImporting,
    isParsing,
    isExporting,
    hasDb: db !== null,

    // Actions
    handleFileSelect,
    handleImport,
    handleReset,
    setReEmbedEnabled,
    exportCSV,
    exportJSONL,
    cancel,
  };
}
