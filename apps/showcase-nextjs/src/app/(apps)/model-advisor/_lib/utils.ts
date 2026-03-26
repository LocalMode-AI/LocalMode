/**
 * @file utils.ts
 * @description Utility functions for the model advisor application
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merges Tailwind CSS classes with proper precedence */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format raw bytes into a human-readable string (KB, MB, GB) */
export function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[i]}`;
}

/** Format size in MB to a display string (e.g. "33 MB" or "1.2 GB") */
export function formatSizeMB(mb: number) {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  return `${mb} MB`;
}

/** Return Tailwind color classes for a speed or quality tier */
export function tierColor(tier: string) {
  switch (tier) {
    case 'fast':
    case 'high':
      return 'badge-success';
    case 'medium':
      return 'badge-warning';
    case 'slow':
    case 'low':
      return 'badge-error';
    default:
      return 'badge-ghost';
  }
}

/** Return Tailwind color classes for a recommended device badge */
export function deviceBadgeColor(device: string) {
  switch (device) {
    case 'webgpu':
      return 'badge-info';
    case 'wasm':
      return 'badge-success';
    case 'cpu':
      return 'badge-ghost';
    default:
      return 'badge-ghost';
  }
}

/** Convert a kebab-case task category to a human-readable label */
export function taskLabel(task: string) {
  return task
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
