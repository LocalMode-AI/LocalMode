/**
 * @file utils.ts
 * @description Utility functions for the PDF chat application
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ChatMessage, MessageRole } from './types';

/**
 * Merges Tailwind CSS classes with proper precedence
 * @param inputs - Class values to merge
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
 * Create a chat message with auto-generated ID and timestamp
 * @param role - Message role (user, assistant, system)
 * @param content - Message content
 */
export function createMessage(role: MessageRole, content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    timestamp: new Date(),
  };
}

/**
 * Format file size to human-readable string
 * @param bytes - Size in bytes
 */
export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Validate if file is a PDF
 * @param file - File to validate
 */
export function isPDFFile(file: File) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

/**
 * Build search context from results for display
 * @param results - Search results from vector database
 */
export function buildSearchContext(
  results: Array<{ text: string; score: number; metadata: Record<string, unknown> }>
) {
  return results
    .map((r, i) => {
      const filename = r.metadata?.filename || 'Unknown';
      const page = r.metadata?.page || '?';
      return `[${i + 1}] (${filename}, page ${page})\n${r.text}`;
    })
    .join('\n\n');
}

/**
 * Format search result for display in chat
 * @param context - Built context string
 * @param resultCount - Number of results
 * @param searchTimeMs - Search time in milliseconds
 */
export function formatSearchResponse(context: string, resultCount: number, searchTimeMs: number) {
  const timeStr = (searchTimeMs / 1000).toFixed(2);
  return `Based on the documents:\n\n${context}\n\n---\n*Found ${resultCount} relevant passages in ${timeStr}s*`;
}
