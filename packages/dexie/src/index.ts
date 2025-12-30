/**
 * @localmode/dexie
 *
 * Dexie.js storage adapter for @localmode - enhanced IndexedDB with versioning.
 *
 * @packageDocumentation
 *
 * @example
 * ```ts
 * import { DexieStorage } from '@localmode/dexie';
 * import { createVectorDB } from '@localmode/core';
 *
 * const storage = new DexieStorage({ name: 'my-app', version: 1 });
 *
 * // Use with VectorDB
 * const db = await createVectorDB({
 *   name: 'my-app',
 *   dimensions: 384,
 *   // Pass storage adapter
 * });
 * ```
 */

export { DexieStorage } from './storage.js';

export type {
  DexieStorageOptions,
  StoredDocument,
  StoredVector,
  SerializedHNSWIndex,
  Collection,
} from './types.js';

