/**
 * @file utils.ts
 * @description Utility functions for the GGUF Explorer application
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merges Tailwind CSS classes with proper precedence */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format parameter count to human-readable string (e.g., 1236000000 -> "1.24B") */
export function formatParams(count: number) {
  if (count >= 1_000_000_000) {
    return `${(count / 1_000_000_000).toFixed(2)}B`;
  }
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(0)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(0)}K`;
  }
  return String(count);
}

/** Format bytes to human-readable string (e.g., 786432000 -> "750 MB") */
export function formatBytes(bytes: number) {
  const gb = 1024 * 1024 * 1024;
  const mb = 1024 * 1024;
  const kb = 1024;

  if (bytes >= gb) {
    return `${(bytes / gb).toFixed(2)} GB`;
  }
  if (bytes >= mb) {
    return `${(bytes / mb).toFixed(0)} MB`;
  }
  if (bytes >= kb) {
    return `${(bytes / kb).toFixed(0)} KB`;
  }
  return `${bytes} B`;
}

/** Format number with commas (e.g., 131072 -> "131,072") */
export function formatNumber(n: number) {
  return n.toLocaleString();
}

/** Get daisyUI badge color for compat verdict */
export function getCompatColor(canRun: boolean) {
  return canRun ? 'badge-success' : 'badge-error';
}

/** Get text color for compat verdict */
export function getCompatTextColor(canRun: boolean) {
  return canRun ? 'text-success' : 'text-error';
}
