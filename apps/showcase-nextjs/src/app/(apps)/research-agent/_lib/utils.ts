/**
 * @file utils.ts
 * @description Utility functions for the research agent application
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merges Tailwind CSS classes with proper precedence */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formats a duration in milliseconds to a human-readable string */
export function formatDuration(ms: number) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Truncates text to a maximum length with ellipsis */
export function truncateText(text: string, maxLength: number = 200) {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + '...';
}

/** Formats tool arguments as a readable string */
export function formatToolArgs(args: Record<string, unknown>) {
  return Object.entries(args)
    .map(([key, value]) => {
      const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
      return `${key}: ${truncateText(String(valueStr), 100)}`;
    })
    .join(', ');
}
