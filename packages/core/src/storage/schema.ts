/**
 * IndexedDB schema definitions.
 */

// Note: This version is managed by the migrations system.
// See migrations.ts for the actual version and upgrade logic.
export const DB_VERSION = 3;

export const STORE_NAMES = {
  DOCUMENTS: 'documents',
  VECTORS: 'vectors',
  INDEXES: 'indexes',
  COLLECTIONS: 'collections',
  META: 'meta',
} as const;

/**
 * Create the IndexedDB schema.
 */
export function createSchema(db: IDBDatabase): void {
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
}

/**
 * Document record as stored in IndexedDB.
 */
export interface DocumentRecord {
  id: string;
  collectionId: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

/**
 * Vector record as stored in IndexedDB.
 */
export interface VectorRecord {
  id: string;
  collectionId: string;
  vector: Float32Array;
}

/**
 * Index record as stored in IndexedDB.
 */
export interface IndexRecord {
  collectionId: string;
  data: string; // JSON serialized HNSW index
  updatedAt: number;
}

/**
 * Collection record as stored in IndexedDB.
 */
export interface CollectionRecord {
  id: string;
  name: string;
  dimensions: number;
  createdAt: number;
}

/**
 * Meta record as stored in IndexedDB.
 */
export interface MetaRecord {
  key: string;
  value: unknown;
}
