/**
 * @file use-semantic-search.ts
 * @description Hook for managing semantic search with vector quantization and drift detection.
 *
 * Search is delegated to `useSemanticSearch` from `@localmode/react`.
 * Add, delete, load-samples, and clear operations remain app-specific.
 * New: model selection, VQ toggle, drift detection, and re-embed with progress.
 */
'use client';

import { useState, useRef, useEffect } from 'react';
import { useSemanticSearch as useReactSemanticSearch } from '@localmode/react';
import { checkModelCompatibility } from '@localmode/core';
import type { SemanticSearchDB, VectorDB, ReindexProgress } from '@localmode/core';
import {
  getEmbeddingModel,
  getVectorDB,
  createNewVectorDB,
  resetState,
  getNoteById,
  addNote as addNoteService,
  deleteNote as deleteNoteService,
  clearAll as clearAllService,
  exportDB,
  importDB,
  addNoteToStore,
  getChunksForNote as getChunksForNoteService,
  getChunkMap,
} from '../_services/search.service';
import { downloadBlob } from '@localmode/react';
import { createNote, buildCSVFromNotes, buildJSONLFromNotes, computeChunkStats } from '../_lib/utils';
import { SAMPLE_NOTES, DEFAULT_TOP_K, MODEL_OPTIONS } from '../_lib/constants';
import type { Note, SearchResult, AppError, DriftWarning, QuantizationType, ExportFormat, SearchLatency, ChunkingMode, ChunkStats } from '../_lib/types';

/**
 * Lazy proxy that satisfies SemanticSearchDB.
 * Delegates to the real VectorDB once it is initialised.
 */
function createLazyDBProxy(dbRef: { current: VectorDB | null }): SemanticSearchDB {
  return {
    async search(vector, options) {
      if (!dbRef.current) throw new Error('VectorDB is not initialised yet');
      return dbRef.current.search(vector, { k: options?.k });
    },
  };
}

/** Hook for semantic search operations with VQ and drift detection */
export function useSemanticSearch() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [isLoadingSamples, setIsLoadingSamples] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  // State for quantization, GPU, drift detection, and chunking
  const [quantizationType, setQuantizationTypeState] = useState<QuantizationType>('none');
  const [gpuEnabled, setGpuEnabled] = useState(false);
  const [chunkingMode, setChunkingModeState] = useState<ChunkingMode>('off');
  const [searchLatency, setSearchLatency] = useState<SearchLatency | null>(null);
  const [selectedModelId, setSelectedModelIdState] = useState(MODEL_OPTIONS[0].id);
  const [driftWarning, setDriftWarning] = useState<DriftWarning | null>(null);
  const [isReindexing, setIsReindexing] = useState(false);
  const [reindexProgress, setReindexProgress] = useState<ReindexProgress | null>(null);

  // Ref for cancellation of reindex
  const reindexAbortRef = useRef<AbortController | null>(null);

  /** Clear error state */
  const clearError = () => setError(null);

  /** Clear drift warning */
  const clearDriftWarning = () => setDriftWarning(null);

  // -- Initialise model & db singletons once --------------------------------
  const dbRef = useRef<VectorDB | null>(null);
  const [proxyDB] = useState(() => createLazyDBProxy(dbRef));

  useEffect(() => {
    let cancelled = false;
    getVectorDB().then((db) => { if (!cancelled) dbRef.current = db; });
    return () => { cancelled = true; };
  }, []);

  // -- Delegate search to @localmode/react -----------------------------------
  const model = getEmbeddingModel(selectedModelId);

  const {
    results: reactResults,
    isSearching,
    error: reactError,
    search: reactSearch,
    reset: reactReset,
  } = useReactSemanticSearch({ model, db: proxyDB, topK: DEFAULT_TOP_K });

  // Sync react hook error into local error
  useEffect(() => {
    if (reactError) {
      setError({ message: 'Search failed. Please try again.', code: 'SEARCH_FAILED', recoverable: true });
    }
  }, [reactError]);

  // Map react results to app SearchResult shape (with chunk info when chunking is active)
  useEffect(() => {
    const mapped = reactResults
      .map((r) => {
        const metadata = r.metadata;

        // When chunking is active, result IDs are "{noteId}__chunk_{index}"
        if (chunkingMode !== 'off' && metadata?.noteId) {
          // Chunk result: resolve parent note
          const noteId = metadata.noteId as string;
          const note = getNoteById(noteId);
          if (!note) return null;
          return {
            note,
            score: r.score,
            chunkIndex: metadata.chunkIndex as number,
            totalChunks: metadata.totalChunks as number,
            chunkText: metadata.text as string,
          };
        }

        // Non-chunked result: resolve by ID directly
        const note = getNoteById(r.id);
        if (!note) return null;
        return { note, score: r.score };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    setSearchResults(mapped);
  }, [reactResults, chunkingMode]);

  /**
   * Recreate the VectorDB with new settings and re-embed all existing notes.
   * Tracks progress and supports cancellation via AbortSignal.
   * Respects the current chunking mode when re-embedding.
   */
  const recreateDB = async (
    modelId: string,
    qType: QuantizationType,
    gpu: boolean,
    currentNotes: Note[],
    signal?: AbortSignal,
    chunkMode?: ChunkingMode,
  ) => {
    const activeChunkMode = chunkMode ?? chunkingMode;
    setIsReindexing(true);
    setReindexProgress(currentNotes.length > 0
      ? { completed: 0, total: currentNotes.length, skipped: 0, phase: 'embedding' as const }
      : null);

    try {
      resetState();
      const selectedOption = MODEL_OPTIONS.find((m) => m.id === modelId) ?? MODEL_OPTIONS[0];
      const newDB = await createNewVectorDB({
        dimensions: selectedOption.dimensions,
        quantizationType: qType,
        enableGPU: gpu,
      });
      dbRef.current = newDB;

      // Re-embed all existing notes into the new DB with progress tracking
      for (let i = 0; i < currentNotes.length; i++) {
        signal?.throwIfAborted();
        await addNoteService(currentNotes[i], modelId, newDB, signal, activeChunkMode);
        setReindexProgress({
          completed: i + 1,
          total: currentNotes.length,
          skipped: 0,
          phase: 'embedding',
        });
      }

      // Indexing phase
      if (currentNotes.length > 0) {
        setReindexProgress({
          completed: currentNotes.length,
          total: currentNotes.length,
          skipped: 0,
          phase: 'indexing',
        });
      }
    } catch (err) {
      // Silently handle abort
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      console.error('Failed to recreate VectorDB:', err);
      setError({ message: 'Failed to recreate database. Please try again.', code: 'RECREATE_FAILED', recoverable: true });
    } finally {
      setIsReindexing(false);
      setReindexProgress(null);
    }
  };

  /** Handle quantization type change via dropdown */
  const handleQuantizationChange = async (type: QuantizationType) => {
    if (type === quantizationType) return;
    setQuantizationTypeState(type);
    setSearchQuery('');
    setSearchResults([]);
    setSearchLatency(null);
    reactReset();
    await recreateDB(selectedModelId, type, gpuEnabled, notes);
  };

  /** Handle chunking mode change via dropdown */
  const handleChunkingModeChange = async (mode: ChunkingMode) => {
    if (mode === chunkingMode) return;
    setChunkingModeState(mode);
    setSearchQuery('');
    setSearchResults([]);
    setSearchLatency(null);
    reactReset();
    if (notes.length > 0) {
      await recreateDB(selectedModelId, quantizationType, gpuEnabled, notes, undefined, mode);
    }
  };

  /** Toggle WebGPU acceleration on/off */
  const toggleGPU = async () => {
    const newGpu = !gpuEnabled;
    setGpuEnabled(newGpu);
    setSearchQuery('');
    setSearchResults([]);
    setSearchLatency(null);
    reactReset();
    await recreateDB(selectedModelId, quantizationType, newGpu, notes);
  };

  /** Handle model change with drift detection */
  const handleModelChange = async (newModelId: string) => {
    if (newModelId === selectedModelId) return;

    setSelectedModelIdState(newModelId);
    setSearchQuery('');
    setSearchResults([]);
    setSearchLatency(null);
    reactReset();

    // Check for drift if there are notes in the DB
    if (notes.length > 0 && dbRef.current) {
      try {
        const newModel = getEmbeddingModel(newModelId);
        const result = await checkModelCompatibility(dbRef.current, newModel);

        if (result.status === 'incompatible' || result.status === 'dimension-mismatch') {
          setDriftWarning({
            status: result.status,
            storedModelId: result.storedModel?.modelId ?? 'unknown',
            currentModelId: result.currentModel.modelId,
            documentCount: result.documentCount,
          });
        } else {
          setDriftWarning(null);
        }
      } catch {
        // If drift detection fails, show a generic warning when switching models
        // since the notes were definitely embedded with a different model
        setDriftWarning({
          status: 'incompatible',
          storedModelId: selectedModelId,
          currentModelId: newModelId,
          documentCount: notes.length,
        });
      }
    } else {
      // No notes, no drift to worry about -- just recreate the DB
      setDriftWarning(null);
      await recreateDB(newModelId, quantizationType, gpuEnabled, []);
    }
  };

  /** Re-embed all documents with the currently selected model */
  const reindex = async () => {
    clearError();

    // Cancel any previous reindex
    reindexAbortRef.current?.abort();
    const controller = new AbortController();
    reindexAbortRef.current = controller;

    // Recreate DB with current model and re-embed all notes
    await recreateDB(selectedModelId, quantizationType, gpuEnabled, notes, controller.signal);

    // Clear drift warning after successful reindex (only if not aborted)
    if (!controller.signal.aborted) {
      setDriftWarning(null);
    }
  };

  /** Cancel an in-progress reindex */
  const cancelReindex = () => {
    reindexAbortRef.current?.abort();
  };

  /** Add a new note and index it for search */
  const addNote = async (text: string) => {
    clearError();
    setIsAdding(true);
    try {
      const note = createNote(text);
      await addNoteService(note, selectedModelId, dbRef.current ?? undefined, undefined, chunkingMode);
      setNotes((prev) => [...prev, note]);
    } catch (err) {
      console.error('Failed to add note:', err);
      setError({ message: 'Failed to add note. Please try again.', code: 'ADD_FAILED', recoverable: true });
    } finally {
      setIsAdding(false);
    }
  };

  /** Search notes by semantic similarity */
  const search = async (query: string) => {
    if (!query.trim()) {
      reactReset();
      setSearchLatency(null);
      return;
    }
    clearError();
    const start = performance.now();
    await reactSearch(query);
    const elapsed = performance.now() - start;
    setSearchLatency({ queryMs: Math.round(elapsed * 10) / 10, gpuEnabled });
  };

  /** Delete a note by ID */
  const deleteNote = async (id: string) => {
    clearError();
    try {
      await deleteNoteService(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
      setSearchResults((prev) => prev.filter((r) => r.note.id !== id));
    } catch (err) {
      console.error('Failed to delete note:', err);
      setError({ message: 'Failed to delete note. Please try again.', code: 'DELETE_FAILED', recoverable: true });
    }
  };

  /** Load all sample notes for quick demo */
  const loadSamples = async () => {
    clearError();
    setIsLoadingSamples(true);
    try {
      for (const text of SAMPLE_NOTES) {
        const note = createNote(text);
        await addNoteService(note, selectedModelId, dbRef.current ?? undefined, undefined, chunkingMode);
        setNotes((prev) => [...prev, note]);
      }
    } catch (err) {
      console.error('Failed to load samples:', err);
      setError({ message: 'Failed to load sample notes. Please try again.', code: 'SAMPLES_FAILED', recoverable: true });
    } finally {
      setIsLoadingSamples(false);
    }
  };

  /** Clear all notes and search results */
  const clearAllNotes = async () => {
    clearError();
    try {
      await clearAllService();
      reactReset();
      setNotes([]);
      setSearchQuery('');
      setSearchResults([]);
      setSearchLatency(null);
      setDriftWarning(null);
      setError(null);
    } catch (err) {
      console.error('Failed to clear notes:', err);
      setError({ message: 'Failed to clear notes. Please try again.', code: 'CLEAR_FAILED', recoverable: true });
    }
  };

  /** Export notes in the specified format */
  const exportNotes = async (format: ExportFormat) => {
    clearError();
    try {
      if (format === 'json') {
        const blob = await exportDB();
        downloadBlob(blob, 'semantic-search-export.json', 'application/json');
      } else if (format === 'csv') {
        const csv = buildCSVFromNotes(notes);
        downloadBlob(csv, 'semantic-search-export.csv', 'text/csv');
      } else {
        const jsonl = buildJSONLFromNotes(notes);
        downloadBlob(jsonl, 'semantic-search-export.jsonl', 'application/jsonl');
      }
    } catch (err) {
      console.error('Failed to export notes:', err);
      setError({ message: 'Failed to export notes. Please try again.', code: 'EXPORT_FAILED', recoverable: true });
    }
  };

  /** Import notes from a JSON file (native VectorDB format) */
  const importNotes = async (file: File) => {
    clearError();
    try {
      const blob = new Blob([await file.arrayBuffer()], { type: 'application/json' });
      await importDB(blob);

      // Rebuild in-memory note store from imported VectorDB data.
      // Use a zero vector search with high k to retrieve all documents.
      const db = dbRef.current;
      if (db) {
        const selectedOption = MODEL_OPTIONS.find((m) => m.id === selectedModelId) ?? MODEL_OPTIONS[0];
        const stats = await db.stats();
        const zeroVector = new Float32Array(selectedOption.dimensions);
        const allDocs = await db.search(zeroVector, { k: stats.count + 1000 });

        const importedNotes: Note[] = [];
        for (const doc of allDocs) {
          const existing = getNoteById(doc.id);
          if (!existing) {
            const meta = doc.metadata as Record<string, string> | undefined;
            const note: Note = {
              id: doc.id,
              text: meta?.text ?? '',
              createdAt: meta?.createdAt ? new Date(meta.createdAt) : new Date(),
            };
            addNoteToStore(note);
            importedNotes.push(note);
          }
        }

        if (importedNotes.length > 0) {
          setNotes((prev) => [...prev, ...importedNotes]);
        }
      }
    } catch (err) {
      console.error('Failed to import notes:', err);
      setError({ message: 'Failed to import file. Please ensure it is a valid VectorDB JSON export.', code: 'IMPORT_FAILED', recoverable: true });
    }
  };

  /**
   * Sync imported records into the local notes list after a successful import.
   * Creates Note objects from the parsed records without re-embedding.
   * @param records - Parsed import records from parseResult.records
   */
  const syncImportedNotes = (records: Array<{ id: string; text?: string; metadata?: Record<string, unknown> }>) => {
    const newNotes: Note[] = [];
    for (const record of records) {
      const text = record.text ?? (record.metadata?.text as string | undefined) ?? '';
      if (!text) continue;
      const note: Note = {
        id: record.id,
        text,
        createdAt: new Date(),
      };
      addNoteToStore(note);
      newNotes.push(note);
    }
    if (newNotes.length > 0) {
      setNotes((prev) => [...prev, ...newNotes]);
    }
  };

  // Derived: current model option
  const selectedModel = MODEL_OPTIONS.find((m) => m.id === selectedModelId) ?? MODEL_OPTIONS[0];

  // Derived: chunk statistics (only when chunking is active)
  const chunkStats: ChunkStats | null = chunkingMode !== 'off'
    ? computeChunkStats(notes, getChunkMap())
    : null;

  /** Get chunks for a specific note (delegates to service) */
  const getChunksForNote = (noteId: string) => getChunksForNoteService(noteId);

  return {
    // Existing state
    notes,
    searchQuery,
    searchResults,
    isAdding,
    isSearching,
    isLoadingSamples,
    error,
    // Settings state
    quantizationType,
    gpuEnabled,
    searchLatency,
    selectedModelId,
    selectedModel,
    driftWarning,
    isReindexing,
    reindexProgress,
    // Chunking state
    chunkingMode,
    chunkStats,
    getChunksForNote,
    // Existing actions
    addNote,
    search,
    deleteNote,
    loadSamples,
    clearAllNotes,
    setSearchQuery,
    setSearchResults,
    clearError,
    // Settings & data actions
    handleQuantizationChange,
    handleChunkingModeChange,
    toggleGPU,
    handleModelChange,
    reindex,
    cancelReindex,
    clearDriftWarning,
    exportNotes,
    importNotes,
    // Exposed for import/export hook
    db: dbRef.current,
    embeddingModel: model,
    syncImportedNotes,
  };
}
