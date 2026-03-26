/**
 * @file utils.ts
 * @description Utility functions for the sentiment analyzer application
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { SentimentResult } from './types';

/** Merges Tailwind CSS classes with proper precedence */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Calculate aggregate statistics from results */
export function calculateStats(results: SentimentResult[]) {
  if (results.length === 0) return { positive: 0, negative: 0, total: 0, avgScore: 0 };
  const positive = results.filter((r) => r.label === 'POSITIVE').length;
  const negative = results.filter((r) => r.label === 'NEGATIVE').length;
  const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
  return { positive, negative, total: results.length, avgScore };
}

/** Format confidence score as percentage */
export function formatScore(score: number) {
  return `${(score * 100).toFixed(1)}%`;
}
