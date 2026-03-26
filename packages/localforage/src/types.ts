/**
 * LocalForage Storage Types
 *
 * Configuration types for the localforage storage adapter.
 *
 * @packageDocumentation
 */

/**
 * Configuration options for LocalForageStorage.
 *
 * @example
 * ```typescript
 * const storage = new LocalForageStorage({ name: 'my-app' });
 * ```
 */
export interface LocalForageStorageOptions {
  /** Database name. */
  name: string;

  /** Preferred driver order (e.g., [localforage.INDEXEDDB, localforage.LOCALSTORAGE]). */
  driver?: string[];
}
