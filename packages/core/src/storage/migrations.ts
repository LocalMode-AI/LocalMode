/**
 * Database migrations system.
 * Handles schema upgrades between versions.
 */

import { STORE_NAMES } from './schema.js';
import { createWALSchema } from './wal.js';

/**
 * Migration function signature.
 */
export type MigrationFn = (db: IDBDatabase, transaction: IDBTransaction) => void | Promise<void>;

/**
 * Migration definition.
 */
export interface Migration {
  /** Version this migration upgrades TO */
  version: number;
  /** Human-readable description */
  description: string;
  /** Migration function */
  migrate: MigrationFn;
}

/**
 * All registered migrations.
 * Add new migrations here when schema changes are needed.
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'Initial schema with documents, vectors, indexes, collections, and meta stores',
    migrate: (db: IDBDatabase) => {
      // Documents store: metadata for each document
      if (!db.objectStoreNames.contains(STORE_NAMES.DOCUMENTS)) {
        const docStore = db.createObjectStore(STORE_NAMES.DOCUMENTS, { keyPath: 'id' });
        docStore.createIndex('collectionId', 'collectionId', { unique: false });
        docStore.createIndex('collectionId_createdAt', ['collectionId', 'createdAt'], {
          unique: false,
        });
      }

      // Vectors store: raw vector data
      if (!db.objectStoreNames.contains(STORE_NAMES.VECTORS)) {
        const vecStore = db.createObjectStore(STORE_NAMES.VECTORS, { keyPath: 'id' });
        vecStore.createIndex('collectionId', 'collectionId', { unique: false });
      }

      // Indexes store: serialized HNSW graphs per collection
      if (!db.objectStoreNames.contains(STORE_NAMES.INDEXES)) {
        db.createObjectStore(STORE_NAMES.INDEXES, { keyPath: 'collectionId' });
      }

      // Collections store: collection metadata
      if (!db.objectStoreNames.contains(STORE_NAMES.COLLECTIONS)) {
        const collStore = db.createObjectStore(STORE_NAMES.COLLECTIONS, { keyPath: 'id' });
        collStore.createIndex('name', 'name', { unique: true });
      }

      // Meta store: database metadata
      if (!db.objectStoreNames.contains(STORE_NAMES.META)) {
        db.createObjectStore(STORE_NAMES.META, { keyPath: 'key' });
      }
    },
  },
  {
    version: 2,
    description: 'Add WAL store for crash recovery',
    migrate: (db: IDBDatabase) => {
      createWALSchema(db);
    },
  },
  {
    version: 3,
    description: 'Add encryption metadata to documents and vectors',
    migrate: (db: IDBDatabase) => {
      // Add encrypted flag store for tracking encrypted entries
      if (!db.objectStoreNames.contains('encryption')) {
        db.createObjectStore('encryption', { keyPath: 'key' });
      }
    },
  },
];

/**
 * Get the current database version.
 */
export function getCurrentVersion(): number {
  return MIGRATIONS.length > 0 ? Math.max(...MIGRATIONS.map((m) => m.version)) : 0;
}

/**
 * Get migrations needed to upgrade from one version to another.
 */
export function getMigrationsToRun(fromVersion: number, toVersion: number): Migration[] {
  return MIGRATIONS.filter((m) => m.version > fromVersion && m.version <= toVersion).sort(
    (a, b) => a.version - b.version
  );
}

/**
 * Run migrations during database upgrade.
 * This is called from the onupgradeneeded handler.
 */
export function runMigrations(
  db: IDBDatabase,
  transaction: IDBTransaction,
  oldVersion: number,
  newVersion: number
): void {
  const migrations = getMigrationsToRun(oldVersion, newVersion);

  for (const migration of migrations) {
    console.log(`Running migration v${migration.version}: ${migration.description}`);

    try {
      const result = migration.migrate(db, transaction);

      // Handle async migrations (note: they should be sync in onupgradeneeded)
      if (result instanceof Promise) {
        console.warn(
          `Migration v${migration.version} is async, which may not work correctly in onupgradeneeded`
        );
      }
    } catch (error) {
      console.error(`Migration v${migration.version} failed:`, error);
      throw error;
    }
  }
}

/**
 * Migration manager for tracking and running migrations.
 */
export class MigrationManager {
  private db: IDBDatabase | null = null;
  private dbName: string;

  constructor(dbName: string) {
    this.dbName = dbName;
  }

  /**
   * Get the stored schema version.
   */
  async getStoredVersion(): Promise<number> {
    if (!this.db) {
      throw new Error('Database not open');
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAMES.META, 'readonly');
      const store = tx.objectStore(STORE_NAMES.META);
      const request = store.get('schema_version');

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const record = request.result;
        resolve(record?.value ?? 0);
      };
    });
  }

  /**
   * Set the stored schema version.
   */
  async setStoredVersion(version: number): Promise<void> {
    if (!this.db) {
      throw new Error('Database not open');
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAMES.META, 'readwrite');
      const store = tx.objectStore(STORE_NAMES.META);
      const request = store.put({ key: 'schema_version', value: version });

      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve();
    });
  }

  /**
   * Check if migrations are needed.
   */
  async needsMigration(): Promise<boolean> {
    const stored = await this.getStoredVersion();
    const current = getCurrentVersion();
    return stored < current;
  }

  /**
   * Open database and handle migrations.
   */
  async open(): Promise<IDBDatabase> {
    const currentVersion = getCurrentVersion();

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, currentVersion);

      request.onerror = () => {
        reject(new Error(`Failed to open database: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = request.result;
        const transaction = request.transaction!;
        const oldVersion = event.oldVersion;
        const newVersion = event.newVersion ?? currentVersion;

        runMigrations(db, transaction, oldVersion, newVersion);
      };

      request.onblocked = () => {
        console.warn('Database upgrade blocked. Please close other tabs.');
      };
    });
  }

  /**
   * Close the database connection.
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Get migration history (for debugging).
   */
  getMigrationHistory(): Array<{ version: number; description: string }> {
    return MIGRATIONS.map((m) => ({
      version: m.version,
      description: m.description,
    }));
  }
}

/**
 * Data migration utilities for complex migrations that need to transform data.
 */
export const DataMigrationUtils = {
  /**
   * Iterate over all records in a store and transform them.
   */
  async transformStore<T>(
    db: IDBDatabase,
    storeName: string,
    transform: (record: T) => T | null,
    options: { batchSize?: number; onProgress?: (done: number, total: number) => void } = {}
  ): Promise<number> {
    const batchSize = options.batchSize ?? 100;

    return new Promise((resolve, reject) => {
      const countTx = db.transaction(storeName, 'readonly');
      const countRequest = countTx.objectStore(storeName).count();

      countRequest.onerror = () => reject(countRequest.error);
      countRequest.onsuccess = () => {
        const total = countRequest.result;
        let processed = 0;
        let transformed = 0;

        const processBatch = (): void => {
          const tx = db.transaction(storeName, 'readwrite');
          const store = tx.objectStore(storeName);
          let batchCount = 0;

          const request = store.openCursor();

          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const cursor = request.result;

            if (cursor && batchCount < batchSize) {
              const record = cursor.value as T;
              const newRecord = transform(record);

              if (newRecord === null) {
                cursor.delete();
              } else if (newRecord !== record) {
                cursor.update(newRecord);
                transformed++;
              }

              processed++;
              batchCount++;
              cursor.continue();
            }
          };

          tx.oncomplete = () => {
            options.onProgress?.(processed, total);

            if (processed < total) {
              // Process next batch
              setTimeout(processBatch, 0);
            } else {
              resolve(transformed);
            }
          };

          tx.onerror = () => reject(tx.error);
        };

        if (total > 0) {
          processBatch();
        } else {
          resolve(0);
        }
      };
    });
  },

  /**
   * Copy data from one store to another.
   */
  async copyStore(
    db: IDBDatabase,
    sourceStore: string,
    targetStore: string,
    transform?: (record: unknown) => unknown
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction([sourceStore, targetStore], 'readwrite');
      const source = tx.objectStore(sourceStore);
      const target = tx.objectStore(targetStore);

      const request = source.openCursor();
      let copied = 0;

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;

        if (cursor) {
          const record = transform ? transform(cursor.value) : cursor.value;
          target.put(record);
          copied++;
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve(copied);
      tx.onerror = () => reject(tx.error);
    });
  },

  /**
   * Rename an object store (by copying data).
   */
  async renameStore(
    db: IDBDatabase,
    oldName: string,
    newName: string,
    keyPath: string | string[]
  ): Promise<void> {
    // Create new store
    if (!db.objectStoreNames.contains(newName)) {
      db.createObjectStore(newName, { keyPath });
    }

    // Copy data
    await this.copyStore(db, oldName, newName);

    // Delete old store
    db.deleteObjectStore(oldName);
  },
};
