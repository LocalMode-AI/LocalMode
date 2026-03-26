/**
 * Dexie Storage Types
 *
 * Configuration types for the Dexie.js storage adapter.
 *
 * @packageDocumentation
 */

/**
 * Configuration options for DexieStorage.
 *
 * @example
 * ```typescript
 * const storage = new DexieStorage({ name: 'my-app' });
 * ```
 */
export interface DexieStorageOptions {
  /** Database name. */
  name: string;
}
