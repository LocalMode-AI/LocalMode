/**
 * @file utils.ts
 * @description Utility functions for the document redactor application
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { DetectedEntity, PrivacyLevel } from './types';

/** Merges Tailwind CSS classes with proper precedence */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Replace detected entities in text with redaction placeholders */
export function redactText(text: string, entities: DetectedEntity[]) {
  const sorted = [...entities].sort((a, b) => b.start - a.start);
  let redacted = text;
  for (const entity of sorted) {
    redacted =
      redacted.slice(0, entity.start) + `[${entity.label}]` + redacted.slice(entity.end);
  }
  return redacted;
}

/** Get privacy level label and color based on epsilon value */
export function getPrivacyLevel(epsilon: number): PrivacyLevel {
  if (epsilon <= 2.0) {
    return { label: 'High Privacy', color: 'text-poster-accent-teal' };
  }
  if (epsilon <= 5.0) {
    return { label: 'Balanced', color: 'text-poster-accent-orange' };
  }
  return { label: 'Low Privacy', color: 'text-poster-accent-pink' };
}
