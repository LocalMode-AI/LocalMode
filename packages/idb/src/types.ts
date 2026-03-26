/**
 * IDB Storage Types
 *
 * Configuration types for the idb storage adapter.
 *
 * @packageDocumentation
 */

/**
 * Configuration options for IDBStorage.
 *
 * @example
 * ```typescript
 * const storage = new IDBStorage({ name: 'my-app' });
 * ```
 */
export interface IDBStorageOptions {
  /** Database name. */
  name: string;
}
