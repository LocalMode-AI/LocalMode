/**
 * @localmode/idb
 *
 * Minimal IndexedDB storage adapter using the idb library.
 *
 * @packageDocumentation
 *
 * @example
 * ```ts
 * import { IDBStorage } from '@localmode/idb';
 *
 * const storage = new IDBStorage({ name: 'my-app' });
 * await storage.open();
 *
 * // Store and retrieve data
 * await storage.setDocument('doc-1', { metadata: { title: 'Hello' } });
 * const doc = await storage.getDocument('doc-1');
 *
 * await storage.close();
 * ```
 */

export {
  IDBStorage,
  type IDBStorageOptions,
  type StoredDocument,
  type StoredVector,
  type SerializedHNSWIndex,
} from './storage.js';

