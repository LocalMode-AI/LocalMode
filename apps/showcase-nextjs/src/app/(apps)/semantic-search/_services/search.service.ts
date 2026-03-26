/**
 * @file search.service.ts
 * @description Service for semantic search operations using @localmode/core and @localmode/transformers.
 *
 * Search is handled by `useSemanticSearch` from `@localmode/react`.
 * This service exposes embedding model factories and VectorDB creation for
 * the React hook, plus app-specific add / delete / clear operations.
 *
 * Model instances are cached by modelId. VectorDB creation is parameterized
 * to support quantization toggling.
 */
import { embed, createVectorDB, recursiveChunk, semanticChunk } from '@localmode/core';
import type { VectorDB, EmbeddingModel } from '@localmode/core';
import { transformers } from '@localmode/transformers';
import {
  DB_NAME,
  MODEL_OPTIONS,
  RECURSIVE_CHUNK_SIZE,
  RECURSIVE_CHUNK_OVERLAP,
  SEMANTIC_CHUNK_SIZE,
} from '../_lib/constants';
import type { Note, QuantizationType, ChunkingMode, ChunkInfo } from '../_lib/types';

/** Cached embedding model instances keyed by model ID */
const modelCache = new Map<string, EmbeddingModel>();

/** Current VectorDB instance */
let vectorDB: VectorDB | null = null;

/** In-memory note store for metadata retrieval */
const noteStore = new Map<string, Note>();

/** Chunk map: noteId -> ChunkInfo[] tracking which chunks belong to which note */
const chunkMap = new Map<string, ChunkInfo[]>();

/**
 * Get or create an embedding model for the given model ID.
 * Caches model instances to avoid redundant creation.
 * @param modelId - Model identifier (e.g., 'Xenova/all-MiniLM-L6-v2')
 */
export function getEmbeddingModel(modelId: string = MODEL_OPTIONS[0].id) {
  let model = modelCache.get(modelId);
  if (!model) {
    model = transformers.embedding(modelId);
    modelCache.set(modelId, model);
  }
  return model;
}

/**
 * Create a new VectorDB instance with optional quantization and GPU acceleration.
 * Always creates a fresh DB (the hook controls lifecycle and recreation).
 * @param options - Configuration for the new VectorDB
 */
export async function createNewVectorDB(options?: {
  dimensions?: number;
  quantizationType?: QuantizationType;
  enableGPU?: boolean;
}) {
  const dimensions = options?.dimensions ?? MODEL_OPTIONS[0].dimensions;
  const quantizationType = options?.quantizationType ?? 'none';

  // Build config object explicitly to satisfy TypeScript
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config: Record<string, any> = {
    name: DB_NAME,
    dimensions,
    storage: 'memory',
  };

  if (quantizationType === 'scalar') {
    config.quantization = { type: 'scalar' };
  } else if (quantizationType === 'pq') {
    config.quantization = { type: 'pq' };
  }

  if (options?.enableGPU) {
    config.enableGPU = true;
  }

  const db = await createVectorDB(config as Parameters<typeof createVectorDB>[0]);
  vectorDB = db;
  return db;
}

/**
 * Get the current VectorDB instance.
 * Falls back to creating a default one if none exists.
 */
export async function getVectorDB() {
  if (!vectorDB) {
    vectorDB = await createNewVectorDB();
  }
  return vectorDB;
}

/**
 * Reset the VectorDB and note store for clean recreation.
 * Call this before creating a new VectorDB with different settings.
 */
export function resetState() {
  vectorDB = null;
  noteStore.clear();
  chunkMap.clear();
}

/**
 * Retrieve a stored note by ID
 * @param id - Note ID
 */
export function getNoteById(id: string): Note | undefined {
  return noteStore.get(id);
}

/**
 * Chunk and add a note to the vector database.
 * Splits the note text using the specified chunking strategy, embeds each chunk,
 * and stores each chunk as a separate VectorDB entry with metadata.
 * @param note - The note to chunk and add
 * @param chunkingMode - 'recursive' or 'semantic'
 * @param modelId - Model ID to use for embedding
 * @param db - VectorDB instance to add to
 * @param signal - Optional AbortSignal for cancellation
 */
async function chunkAndAddNote(
  note: Note,
  chunkingMode: 'recursive' | 'semantic',
  modelId?: string,
  db?: VectorDB,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();

  const model = getEmbeddingModel(modelId);
  const targetDB = db ?? await getVectorDB();

  // Chunk the text based on mode
  let chunks: Array<{ text: string; leftSimilarity?: number | null; rightSimilarity?: number | null }>;

  if (chunkingMode === 'semantic') {
    const semanticChunks = await semanticChunk({
      text: note.text,
      model,
      size: SEMANTIC_CHUNK_SIZE,
      abortSignal: signal,
    });
    chunks = semanticChunks.map((c) => ({
      text: c.text,
      leftSimilarity: c.metadata?.semanticBoundaries?.leftSimilarity ?? null,
      rightSimilarity: c.metadata?.semanticBoundaries?.rightSimilarity ?? null,
    }));
  } else {
    const recursiveChunks = recursiveChunk(note.text, {
      size: RECURSIVE_CHUNK_SIZE,
      overlap: RECURSIVE_CHUNK_OVERLAP,
    });
    chunks = recursiveChunks.map((c) => ({ text: c.text }));
  }

  // If no chunks produced (very short text), fall back to single entry
  if (chunks.length === 0) {
    chunks = [{ text: note.text }];
  }

  const totalChunks = chunks.length;
  const chunkInfos: ChunkInfo[] = [];

  // Embed and store each chunk as a separate VectorDB entry
  for (let i = 0; i < chunks.length; i++) {
    signal?.throwIfAborted();

    const chunk = chunks[i];
    const chunkId = `${note.id}__chunk_${i}`;

    const { embedding } = await embed({
      model,
      value: chunk.text,
      abortSignal: signal,
    });

    await targetDB.add({
      id: chunkId,
      vector: embedding,
      metadata: {
        text: chunk.text,
        noteId: note.id,
        chunkIndex: i,
        totalChunks,
        createdAt: note.createdAt.toISOString(),
      },
    });

    chunkInfos.push({
      noteId: note.id,
      chunkIndex: i,
      totalChunks,
      text: chunk.text,
      leftSimilarity: chunk.leftSimilarity,
      rightSimilarity: chunk.rightSimilarity,
    });
  }

  // Store chunk info and note
  chunkMap.set(note.id, chunkInfos);
  noteStore.set(note.id, note);
}

/**
 * Add a note to the vector database.
 * When chunkingMode is 'off' (default), embeds the note as a single vector.
 * When 'recursive' or 'semantic', delegates to chunkAndAddNote.
 * @param note - The note to add
 * @param modelId - Model ID to use for embedding
 * @param db - VectorDB instance to add to
 * @param signal - Optional AbortSignal for cancellation
 * @param chunkingMode - Chunking strategy ('off' | 'recursive' | 'semantic')
 */
export async function addNote(
  note: Note,
  modelId?: string,
  db?: VectorDB,
  signal?: AbortSignal,
  chunkingMode: ChunkingMode = 'off',
) {
  if (chunkingMode !== 'off') {
    return chunkAndAddNote(note, chunkingMode, modelId, db, signal);
  }

  signal?.throwIfAborted();

  const model = getEmbeddingModel(modelId);
  const targetDB = db ?? await getVectorDB();

  // Embed the note text
  const { embedding } = await embed({
    model,
    value: note.text,
    abortSignal: signal,
  });

  // Add to VectorDB with metadata
  await targetDB.add({
    id: note.id,
    vector: embedding,
    metadata: {
      text: note.text,
      createdAt: note.createdAt.toISOString(),
    },
  });

  // Store note in memory for retrieval
  noteStore.set(note.id, note);
}

/**
 * Delete a note from the vector database.
 * Also deletes all associated chunk entries if the note was chunked.
 * @param id - Note ID to delete
 */
export async function deleteNote(id: string) {
  const db = await getVectorDB();

  // Delete chunk entries if present
  const chunks = chunkMap.get(id);
  if (chunks && chunks.length > 0) {
    for (let i = 0; i < chunks.length; i++) {
      try {
        await db.delete(`${id}__chunk_${i}`);
      } catch {
        // Chunk entry may not exist if DB was recreated
      }
    }
    chunkMap.delete(id);
  } else {
    // Delete the single-vector entry
    await db.delete(id);
  }

  noteStore.delete(id);
}

/**
 * Clear all notes from the vector database
 */
export async function clearAll() {
  const db = await getVectorDB();
  await db.clear();
  noteStore.clear();
  chunkMap.clear();
}

/**
 * Export the current VectorDB as a JSON Blob.
 * Delegates to `db.export()` for full data portability (includes vectors).
 * @throws If no VectorDB is initialized
 */
export async function exportDB(): Promise<Blob> {
  if (!vectorDB) throw new Error('VectorDB is not initialized');
  return vectorDB.export();
}

/**
 * Import data into the current VectorDB from a JSON Blob.
 * Delegates to `db.import()` with merge mode.
 * @param data - Blob containing the VectorDB JSON export
 * @throws If no VectorDB is initialized
 */
export async function importDB(data: Blob): Promise<void> {
  if (!vectorDB) throw new Error('VectorDB is not initialized');
  await vectorDB.import(data, { mode: 'merge' });
}

/**
 * Get all notes currently stored in the in-memory note store.
 * Useful for rebuilding state after import.
 */
export function getAllNotes(): Note[] {
  return Array.from(noteStore.values());
}

/**
 * Add a note directly to the in-memory note store without embedding.
 * Used after import to reconstruct note metadata from VectorDB metadata.
 * @param note - The note to store
 */
export function addNoteToStore(note: Note) {
  noteStore.set(note.id, note);
}

/**
 * Get the chunks for a specific note.
 * @param noteId - Note ID to look up
 * @returns Array of ChunkInfo, or empty array if not chunked
 */
export function getChunksForNote(noteId: string): ChunkInfo[] {
  return chunkMap.get(noteId) ?? [];
}

/**
 * Get a reference to the full chunk map.
 * Used for computing chunk statistics.
 */
export function getChunkMap(): Map<string, ChunkInfo[]> {
  return chunkMap;
}
