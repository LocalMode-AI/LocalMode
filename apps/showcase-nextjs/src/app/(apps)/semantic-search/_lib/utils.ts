/**
 * @file utils.ts
 * @description Utility functions for the semantic search application
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Note, QuantizationType, ChunkInfo, ChunkStats } from './types';

/**
 * Merges Tailwind CSS classes with proper precedence
 * @param inputs - Class values to merge
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Create a note with auto-generated ID and timestamp
 * @param text - Note text content
 */
export function createNote(text: string): Note {
  return {
    id: crypto.randomUUID(),
    text,
    createdAt: new Date(),
  };
}

/**
 * Format a similarity score as a percentage string
 * @param score - Similarity score (0-1)
 */
export function formatScore(score: number) {
  return `${Math.round(score * 100)}%`;
}

/**
 * Format date to relative time (e.g., "2m ago")
 * @param date - Date to format
 */
export function formatRelativeTime(date: Date) {
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);

  if (diffSec < 60) return 'just now';

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;

  return date.toLocaleDateString();
}

/**
 * Get color class for a score badge based on similarity threshold
 * @param score - Similarity score (0-1)
 */
export function getScoreColor(score: number) {
  if (score >= 0.7) return 'badge-success';
  if (score >= 0.4) return 'badge-warning';
  return 'badge-ghost';
}

/**
 * Calculate raw (Float32) storage size in bytes
 * @param count - Number of vectors
 * @param dimensions - Embedding dimensions
 */
export function calculateRawStorageBytes(count: number, dimensions: number) {
  return count * dimensions * 4;
}

/**
 * Calculate quantized (Uint8/SQ8) storage size in bytes
 * @param count - Number of vectors
 * @param dimensions - Embedding dimensions
 */
export function calculateQuantizedStorageBytes(count: number, dimensions: number) {
  return count * dimensions * 1;
}

/**
 * Calculate product quantization (PQ) storage size in bytes.
 * PQ stores centroid indices: one byte per subvector per vector.
 * @param count - Number of vectors
 * @param dimensions - Embedding dimensions
 * @param subvectors - Number of PQ subvectors (default: 48)
 */
export function calculatePQStorageBytes(count: number, dimensions: number, subvectors = 48) {
  return count * Math.ceil(dimensions / subvectors);
}

/**
 * Get storage bytes for a given quantization type.
 * Dispatches to the appropriate calculation function.
 * @param count - Number of vectors
 * @param dimensions - Embedding dimensions
 * @param type - Quantization type
 */
export function getStorageBytesForQuantization(count: number, dimensions: number, type: QuantizationType) {
  switch (type) {
    case 'scalar':
      return calculateQuantizedStorageBytes(count, dimensions);
    case 'pq':
      return calculatePQStorageBytes(count, dimensions);
    case 'none':
    default:
      return calculateRawStorageBytes(count, dimensions);
  }
}

/**
 * Format a latency value in milliseconds for display.
 * Returns "12ms" for values >= 1, "0.8ms" for sub-millisecond (one decimal).
 * @param ms - Latency in milliseconds
 */
export function formatLatency(ms: number) {
  if (ms < 1) return `${ms.toFixed(1)}ms`;
  return `${Math.round(ms)}ms`;
}

/**
 * Build a CSV string from in-memory notes (id, text, createdAt columns).
 * Values are properly escaped for CSV format.
 * @param notes - Array of notes to export
 */
export function buildCSVFromNotes(notes: Note[]) {
  const escapeCSV = (value: string) => {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  const header = 'id,text,createdAt';
  const rows = notes.map(
    (note) =>
      `${escapeCSV(note.id)},${escapeCSV(note.text)},${escapeCSV(note.createdAt.toISOString())}`
  );
  return [header, ...rows].join('\n');
}

/**
 * Build a JSONL (JSON Lines) string from in-memory notes.
 * One JSON object per line with { id, text, createdAt } fields.
 * @param notes - Array of notes to export
 */
export function buildJSONLFromNotes(notes: Note[]) {
  return notes
    .map((note) =>
      JSON.stringify({ id: note.id, text: note.text, createdAt: note.createdAt.toISOString() })
    )
    .join('\n');
}

/**
 * Format bytes to a human-readable string (e.g., "1.5 KB", "2.3 MB")
 * @param bytes - Number of bytes
 */
export function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ============================================================================
// Chunk utilities
// ============================================================================

/** Alternating background colors for chunk boundary visualization (low-opacity poster accents) */
const CHUNK_COLORS = [
  'bg-poster-primary/10',
  'bg-poster-accent-teal/10',
  'bg-poster-accent-purple/10',
  'bg-poster-accent-orange/10',
  'bg-poster-accent-pink/10',
];

/**
 * Get a background color class for a chunk based on its index.
 * Cycles through poster accent colors at low opacity.
 * @param chunkIndex - 0-based chunk index
 */
export function getChunkColor(chunkIndex: number) {
  return CHUNK_COLORS[chunkIndex % CHUNK_COLORS.length];
}

/**
 * Format a chunk badge label (e.g., "C1", "C2")
 * @param chunkIndex - 0-based chunk index
 * @param totalChunks - Total number of chunks
 */
export function formatChunkBadge(chunkIndex: number) {
  return `C${chunkIndex + 1}`;
}

/**
 * Compute aggregate chunk statistics from the chunk map.
 * @param notes - Array of notes
 * @param chunkMap - Map of noteId to ChunkInfo arrays
 */
export function computeChunkStats(
  notes: Note[],
  chunkMap: Map<string, ChunkInfo[]>,
): ChunkStats | null {
  if (chunkMap.size === 0) return null;

  let totalChunks = 0;
  let totalCharsAcrossChunks = 0;

  for (const chunks of chunkMap.values()) {
    totalChunks += chunks.length;
    for (const chunk of chunks) {
      totalCharsAcrossChunks += chunk.text.length;
    }
  }

  if (totalChunks === 0) return null;

  const notesWithChunks = chunkMap.size;

  return {
    totalChunks,
    avgChunkSize: Math.round(totalCharsAcrossChunks / totalChunks),
    avgChunksPerNote: Math.round((totalChunks / notesWithChunks) * 10) / 10,
  };
}
