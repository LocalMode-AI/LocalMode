/**
 * @localmode/localforage
 *
 * Cross-browser storage adapter for @localmode — automatic fallback
 * from IndexedDB to WebSQL to localStorage.
 *
 * @packageDocumentation
 *
 * @example
 * ```typescript
 * import { LocalForageStorage } from '@localmode/localforage';
 * import { createVectorDB } from '@localmode/core';
 *
 * const storage = new LocalForageStorage({ name: 'my-app' });
 * const db = await createVectorDB({
 *   name: 'my-app',
 *   dimensions: 384,
 *   storage,
 * });
 * ```
 */

export { LocalForageStorage } from './storage.js';
export type { LocalForageStorageOptions } from './types.js';
