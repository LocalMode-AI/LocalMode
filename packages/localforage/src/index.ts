/**
 * @localmode/localforage
 *
 * Cross-browser storage adapter with automatic fallback using localforage.
 *
 * @packageDocumentation
 *
 * @example
 * ```ts
 * import { LocalForageStorage } from '@localmode/localforage';
 *
 * const storage = new LocalForageStorage({ name: 'my-app' });
 * await storage.ready();
 *
 * // Store and retrieve data
 * await storage.setDocument('doc-1', { metadata: { title: 'Hello' } });
 * const doc = await storage.getDocument('doc-1');
 * ```
 */

export {
  LocalForageStorage,
  type LocalForageStorageOptions,
  type StoredDocument,
  type StoredVector,
  type SerializedHNSWIndex,
} from './storage.js';

