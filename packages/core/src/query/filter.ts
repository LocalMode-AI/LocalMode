/**
 * Metadata filtering logic.
 */

import type { FilterQuery } from '../types.js';

/**
 * Check if a document's metadata matches a filter query.
 */
export function matchesFilter(
  metadata: Record<string, unknown> | undefined,
  filter: FilterQuery
): boolean {
  if (!filter || Object.keys(filter).length === 0) {
    return true;
  }

  if (!metadata) {
    return false;
  }

  for (const [key, condition] of Object.entries(filter)) {
    const value = metadata[key];

    if (!matchesCondition(value, condition)) {
      return false;
    }
  }

  return true;
}

/**
 * Check if a value matches a single condition.
 */
function matchesCondition(value: unknown, condition: unknown): boolean {
  // Null condition check
  if (condition === null) {
    return value === null;
  }

  // Operator objects
  if (typeof condition === 'object' && condition !== null) {
    const ops = condition as Record<string, unknown>;

    // $in: value must be in the array
    if ('$in' in ops) {
      const inArray = ops.$in as unknown[];
      return inArray.includes(value);
    }

    // $nin: value must not be in the array
    if ('$nin' in ops) {
      const ninArray = ops.$nin as unknown[];
      return !ninArray.includes(value);
    }

    // $gt: value must be greater than
    if ('$gt' in ops) {
      return typeof value === 'number' && value > (ops.$gt as number);
    }

    // $gte: value must be greater than or equal
    if ('$gte' in ops) {
      return typeof value === 'number' && value >= (ops.$gte as number);
    }

    // $lt: value must be less than
    if ('$lt' in ops) {
      return typeof value === 'number' && value < (ops.$lt as number);
    }

    // $lte: value must be less than or equal
    if ('$lte' in ops) {
      return typeof value === 'number' && value <= (ops.$lte as number);
    }

    // $ne: value must not equal
    if ('$ne' in ops) {
      return value !== ops.$ne;
    }

    // $exists: field must exist (or not)
    if ('$exists' in ops) {
      const shouldExist = ops.$exists as boolean;
      const exists = value !== undefined;
      return shouldExist ? exists : !exists;
    }

    // Unknown operator or nested object - treat as exact match
    return JSON.stringify(value) === JSON.stringify(condition);
  }

  // Exact match for primitives
  return value === condition;
}

/**
 * Apply a filter to an array of items.
 */
export function applyFilter<T extends { metadata?: Record<string, unknown> }>(
  items: T[],
  filter: FilterQuery | undefined
): T[] {
  if (!filter || Object.keys(filter).length === 0) {
    return items;
  }

  return items.filter((item) => matchesFilter(item.metadata, filter));
}

