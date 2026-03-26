/**
 * @file utils.ts
 * @description Utility functions for the meeting-assistant application
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ACTION_VERB_PATTERNS, PRIORITY_KEYWORDS } from './constants';
import type { ActionItem } from './types';

/**
 * Merges Tailwind CSS classes with proper precedence
 * @param inputs - Class values to merge
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Determine priority of an action item based on keyword matching
 * @param text - Action item text to analyze
 * @returns Priority level
 */
function determinePriority(text: string): 'high' | 'medium' | 'low' {
  const lower = text.toLowerCase();

  for (const keyword of PRIORITY_KEYWORDS.high) {
    if (lower.includes(keyword)) return 'high';
  }
  for (const keyword of PRIORITY_KEYWORDS.medium) {
    if (lower.includes(keyword)) return 'medium';
  }
  return 'low';
}

/**
 * Extract action items from transcript text using heuristic patterns
 * @param text - Full transcript text to analyze
 * @returns Array of extracted action items
 */
export function extractActionItems(text: string): ActionItem[] {
  const seen = new Set<string>();
  const items: ActionItem[] = [];

  for (const pattern of ACTION_VERB_PATTERNS) {
    // Reset lastIndex for global regex
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      const raw = match[1]?.trim();
      if (!raw || raw.length < 5 || raw.length > 200) continue;

      // Normalize for deduplication
      const normalized = raw.toLowerCase().replace(/\s+/g, ' ');
      if (seen.has(normalized)) continue;
      seen.add(normalized);

      // Capitalize first letter
      const cleaned = raw.charAt(0).toUpperCase() + raw.slice(1);

      items.push({
        id: crypto.randomUUID(),
        text: cleaned,
        completed: false,
        priority: determinePriority(raw),
      });
    }
  }

  return items;
}

/**
 * Format a duration in seconds to a human-readable string
 * @param seconds - Duration in seconds
 * @returns Formatted string like "2m 30s"
 */
export function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);

  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

/**
 * Read a File as an ArrayBuffer
 * @param file - File to read
 * @returns Promise resolving to the ArrayBuffer
 */
export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Format a relative time from now
 * @param date - Date to format
 * @returns Relative time string like "5m ago" or "2h ago"
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
 * Count words in text
 * @param text - Text to count words in
 * @returns Word count
 */
export function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Build the export text content for a meeting transcript download
 * @param transcript - Full transcript text
 * @param summary - Meeting summary
 * @param actionItems - List of action items
 * @returns Formatted text string
 */
export function buildExportContent(
  transcript: string,
  summary: string,
  actionItems: { text: string; completed: boolean; priority: string }[]
) {
  const lines: string[] = [];
  lines.push('MEETING TRANSCRIPT');
  lines.push('==================');
  lines.push('');
  lines.push(transcript);

  if (summary) {
    lines.push('');
    lines.push('SUMMARY');
    lines.push('-------');
    lines.push(summary);
  }

  if (actionItems.length > 0) {
    lines.push('');
    lines.push('ACTION ITEMS');
    lines.push('------------');
    actionItems.forEach((item, i) => {
      const status = item.completed ? '[x]' : '[ ]';
      const priority = `(${item.priority})`;
      lines.push(`${status} ${i + 1}. ${item.text} ${priority}`);
    });
  }

  return lines.join('\n');
}
