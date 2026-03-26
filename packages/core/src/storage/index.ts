/**
 * Storage exports.
 */

export { IndexedDBStorage } from './indexeddb.js';
export { MemoryStorage } from './memory.js';
export { type StorageAdapter } from './types.js';
export * from './schema.js';
export {
  WAL,
  WAL_STORE_NAME,
  createWALSchema,
  withWAL,
  createReplayExecutor,
  type WALOperationType,
  type WALEntry,
} from './wal.js';
export {
  MigrationManager,
  MIGRATIONS,
  getCurrentVersion,
  getMigrationsToRun,
  runMigrations,
  DataMigrationUtils,
  type Migration,
  type MigrationFn,
} from './migrations.js';
export {
  compressVectors,
  decompressVectors,
  getCompressionStats,
  type CompressedVectorBlock,
  type CompressionConfig,
  type CompressionStats,
} from './compression.js';

import { IndexedDBStorage } from './indexeddb.js';
import { MemoryStorage } from './memory.js';

export type Storage = IndexedDBStorage | MemoryStorage;

export function createStorage(type: 'indexeddb' | 'memory', name: string): Storage {
  if (type === 'memory') {
    return new MemoryStorage();
  }
  return new IndexedDBStorage(name);
}
