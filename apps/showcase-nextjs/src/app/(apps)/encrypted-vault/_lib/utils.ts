/**
 * @file utils.ts
 * @description Utility functions for the encrypted vault application
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { VaultEntry } from './types';

/**
 * Merges Tailwind CSS classes with proper precedence
 * @param inputs - Class values to merge
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Create a vault entry with auto-generated ID and timestamp
 * @param title - Entry title
 * @param encryptedContent - Encrypted content string
 */
export function createEntry(title: string, encryptedContent: string): VaultEntry {
  return {
    id: crypto.randomUUID(),
    title,
    encryptedContent,
    createdAt: new Date(),
  };
}

/**
 * Format date for display (e.g., "Mar 18, 2026")
 * @param date - Date to format
 */
export function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Validate password strength
 * @param password - Password to validate
 */
export function validatePassword(password: string) {
  if (password.length < 8) {
    return 'Password must be at least 8 characters';
  }
  return null;
}
