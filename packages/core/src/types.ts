/**
 * Encryption configuration options.
 */
export interface EncryptionOptions {
  /** Enable encryption at rest */
  enabled: boolean;
  /** Passphrase for encryption (required if enabled) */
  passphrase?: string;
  /** Key derivation iterations (higher = more secure, slower). Default: 100000 */
  iterations?: number;
}

/**
 * Sync configuration options.
 */
export interface SyncOptions {
  /** Enable cross-tab locking with Web Locks API. Default: true */
  enableLocking?: boolean;
  /** Enable cross-tab notifications with BroadcastChannel. Default: true */
  enableBroadcast?: boolean;
  /** Enable Write-Ahead Log for crash recovery. Default: false */
  enableWAL?: boolean;
}

/**
 * Configuration options for creating a VectorDB instance.
 */
export interface VectorDBConfig {
  /** Database name (used for IndexedDB store name) */
  name: string;

  /** Number of dimensions for vectors */
  dimensions: number;

  /** Storage backend: 'indexeddb' for persistence, 'memory' for testing */
  storage?: 'indexeddb' | 'memory';

  /** HNSW index configuration options */
  indexOptions?: HNSWOptions;

  /** Encryption configuration */
  encryption?: EncryptionOptions;

  /** Sync and recovery options */
  sync?: SyncOptions;
}

/**
 * HNSW algorithm configuration options.
 */
export interface HNSWOptions {
  /** Maximum number of connections per node (default: 16) */
  m?: number;

  /** Size of dynamic candidate list during construction (default: 200) */
  efConstruction?: number;

  /** Size of dynamic candidate list during search (default: 50) */
  efSearch?: number;

  /** Distance metric to use (default: 'cosine') */
  distanceFunction?: 'cosine' | 'euclidean' | 'dot';
}

/**
 * A document to be stored in the vector database.
 */
export interface Document {
  /** Unique identifier for the document */
  id: string;

  /** Vector embedding (must match configured dimensions) */
  vector: Float32Array;

  /** Optional metadata associated with the document */
  metadata?: Record<string, unknown>;
}

/**
 * Options for search operations.
 */
export interface SearchOptions {
  /** Number of results to return (default: 10) */
  k?: number;

  /** Metadata filter to apply before/after search */
  filter?: FilterQuery;

  /** Minimum similarity threshold (0-1 for cosine, depends on metric) */
  threshold?: number;

  /** Whether to include vectors in results (default: false) */
  includeVectors?: boolean;
}

/**
 * A single search result.
 */
export interface SearchResult {
  /** Document ID */
  id: string;

  /** Similarity score (higher is more similar for cosine/dot, lower for euclidean) */
  score: number;

  /** Document metadata (if stored) */
  metadata?: Record<string, unknown>;

  /** Vector embedding (only if includeVectors was true) */
  vector?: Float32Array;
}

/**
 * Filter query for metadata filtering.
 * Supports exact match, $in (any of), $gt, $gte, $lt, $lte operators.
 */
export interface FilterQuery {
  [key: string]:
    | string
    | number
    | boolean
    | null
    | { $in: unknown[] }
    | { $nin: unknown[] }
    | { $gt: number }
    | { $gte: number }
    | { $lt: number }
    | { $lte: number }
    | { $ne: unknown }
    | { $exists: boolean };
}

/**
 * Options for batch add operations.
 */
export interface AddManyOptions {
  /** Progress callback called after each batch */
  onProgress?: (completed: number, total: number) => void;

  /** Batch size for processing (default: 100) */
  batchSize?: number;
}

/**
 * Options for import operations.
 */
export interface ImportOptions {
  /** How to handle existing data: 'merge' adds/updates, 'replace' clears first */
  mode?: 'merge' | 'replace';

  /** Progress callback */
  onProgress?: (completed: number, total: number) => void;
}

/**
 * Options for export operations.
 */
export interface ExportOptions {
  /** Export format */
  format?: 'json' | 'binary';

  /** Collections to export (default: all) */
  collections?: string[];

  /** Whether to include vectors (default: true) */
  includeVectors?: boolean;
}

/**
 * Database statistics.
 */
export interface DBStats {
  /** Total number of documents across all collections */
  count: number;

  /** List of collection names */
  collections: string[];

  /** Approximate size in bytes */
  sizeBytes: number;

  /** Database schema version */
  version: number;
}

/**
 * Internal document representation with collection info.
 */
export interface StoredDocument {
  id: string;
  collectionId: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

/**
 * Internal vector storage representation.
 */
export interface StoredVector {
  id: string;
  collectionId: string;
  vector: Float32Array;
}

/**
 * Internal collection representation.
 */
export interface Collection {
  id: string;
  name: string;
  dimensions: number;
  createdAt: number;
}

/**
 * The main VectorDB interface.
 */
export interface VectorDB {
  /** Add a single document */
  add(doc: Document): Promise<void>;

  /** Add multiple documents with optional progress tracking */
  addMany(docs: Document[], options?: AddManyOptions): Promise<void>;

  /** Search for similar vectors */
  search(vector: Float32Array, options?: SearchOptions): Promise<SearchResult[]>;

  /** Get a document by ID */
  get(id: string): Promise<(Document & { metadata?: Record<string, unknown> }) | null>;

  /** Update a document's vector or metadata */
  update(id: string, updates: Partial<Omit<Document, 'id'>>): Promise<void>;

  /** Delete a document by ID */
  delete(id: string): Promise<void>;

  /** Delete multiple documents by ID */
  deleteMany(ids: string[]): Promise<void>;

  /** Delete documents matching a filter */
  deleteWhere(filter: FilterQuery): Promise<number>;

  /** Get a namespaced collection */
  collection(name: string): VectorDB;

  /** Get database statistics */
  stats(): Promise<DBStats>;

  /** Clear all data in the database */
  clear(): Promise<void>;

  /** Close the database connection */
  close(): Promise<void>;

  /** Export database data */
  export(options?: ExportOptions): Promise<Blob>;

  /** Import database data */
  import(data: Blob, options?: ImportOptions): Promise<void>;

  /** Get the lock manager (for advanced usage) */
  getLockManager(): unknown;

  /** Get the broadcaster (for advanced usage) */
  getBroadcaster(): unknown;
}

/**
 * Message types for worker communication.
 */
export type WorkerMessageType =
  | 'init'
  | 'add'
  | 'addMany'
  | 'search'
  | 'get'
  | 'update'
  | 'delete'
  | 'deleteMany'
  | 'deleteWhere'
  | 'stats'
  | 'clear'
  | 'close'
  | 'export'
  | 'import';

/**
 * Worker request message structure.
 */
export interface WorkerRequest {
  id: number;
  type: WorkerMessageType;
  payload: unknown;
  collectionId?: string;
}

/**
 * Worker response message structure.
 */
export interface WorkerResponse {
  id: number;
  success: boolean;
  result?: unknown;
  error?: string;
}

/**
 * HNSW node in the graph.
 */
export interface HNSWNode {
  id: string;
  level: number;
  connections: Map<number, string[]>; // level -> connected node IDs
}

/**
 * Serialized HNSW index format.
 */
export interface SerializedHNSWIndex {
  version: number;
  dimensions: number;
  m: number;
  efConstruction: number;
  entryPointId: string | null;
  maxLevel: number;
  nodes: Array<{
    id: string;
    level: number;
    connections: Array<[number, string[]]>;
  }>;
}

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIG = {
  storage: 'indexeddb' as const,
  indexOptions: {
    m: 16,
    efConstruction: 200,
    efSearch: 50,
    distanceFunction: 'cosine' as const,
  },
  sync: {
    enableLocking: true,
    enableBroadcast: true,
    enableWAL: false,
  },
  encryption: {
    enabled: false,
    iterations: 100000,
  },
} as const;

/**
 * Default collection name.
 */
export const DEFAULT_COLLECTION = 'default';
