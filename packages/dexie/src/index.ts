/**
 * @localmode/dexie
 *
 * Dexie.js storage adapter for @localmode — enhanced IndexedDB with
 * schema versioning and transactions.
 *
 * @packageDocumentation
 *
 * @example
 * ```typescript
 * import { DexieStorage } from '@localmode/dexie';
 * import { createVectorDB } from '@localmode/core';
 *
 * const storage = new DexieStorage({ name: 'my-app' });
 * const db = await createVectorDB({
 *   name: 'my-app',
 *   dimensions: 384,
 *   storage,
 * });
 * ```
 */

export { DexieStorage } from './storage.js';
export type { DexieStorageOptions } from './types.js';
