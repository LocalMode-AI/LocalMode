/**
 * @localmode/idb
 *
 * Minimal idb storage adapter for @localmode — lightweight IndexedDB
 * wrapper with the smallest bundle footprint (~3KB).
 *
 * @packageDocumentation
 *
 * @example
 * ```typescript
 * import { IDBStorage } from '@localmode/idb';
 * import { createVectorDB } from '@localmode/core';
 *
 * const storage = new IDBStorage({ name: 'my-app' });
 * const db = await createVectorDB({
 *   name: 'my-app',
 *   dimensions: 384,
 *   storage,
 * });
 * ```
 */

export { IDBStorage } from './storage.js';
export type { IDBStorageOptions } from './types.js';
