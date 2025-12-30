/**
 * Write-Ahead Log (WAL) for crash recovery.
 * Ensures data consistency by logging operations before they are applied.
 */

/**
 * WAL operation types.
 */
export type WALOperationType =
  | 'add_document'
  | 'update_document'
  | 'delete_document'
  | 'add_vector'
  | 'delete_vector'
  | 'save_index'
  | 'create_collection'
  | 'delete_collection'
  | 'clear_collection'
  | 'clear_database';

/**
 * WAL entry representing a pending operation.
 */
export interface WALEntry {
  /** Unique operation ID */
  id: string;
  /** Sequence number for ordering */
  sequence: number;
  /** Operation type */
  type: WALOperationType;
  /** Operation data (serializable) */
  data: Record<string, unknown>;
  /** Timestamp when the operation was logged */
  timestamp: number;
  /** Status of the operation */
  status: 'pending' | 'committed' | 'rolled_back';
  /** Transaction ID for grouping related operations */
  transactionId?: string;
}

/**
 * WAL store name in IndexedDB.
 */
export const WAL_STORE_NAME = 'wal';

/**
 * Add WAL store to the IndexedDB schema.
 */
export function createWALSchema(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(WAL_STORE_NAME)) {
    const walStore = db.createObjectStore(WAL_STORE_NAME, { keyPath: 'id' });
    walStore.createIndex('sequence', 'sequence', { unique: true });
    walStore.createIndex('status', 'status', { unique: false });
    walStore.createIndex('transactionId', 'transactionId', { unique: false });
  }
}

/**
 * Generate a unique ID for WAL entries.
 */
function generateWALId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Write-Ahead Log manager.
 */
export class WAL {
  private db: IDBDatabase;
  private sequence = 0;
  private currentTransactionId: string | null = null;

  constructor(db: IDBDatabase) {
    this.db = db;
  }

  /**
   * Initialize WAL and recover any pending operations.
   */
  async initialize(): Promise<number> {
    // Get the max sequence number
    const maxSequence = await this.getMaxSequence();
    this.sequence = maxSequence;

    // Get count of pending operations
    const pendingCount = await this.getPendingCount();
    return pendingCount;
  }

  /**
   * Get the maximum sequence number in the log.
   */
  private async getMaxSequence(): Promise<number> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(WAL_STORE_NAME, 'readonly');
      const store = tx.objectStore(WAL_STORE_NAME);
      const index = store.index('sequence');

      const request = index.openCursor(null, 'prev');

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const entry = cursor.value as WALEntry;
          resolve(entry.sequence);
        } else {
          resolve(0);
        }
      };
    });
  }

  /**
   * Get count of pending operations.
   */
  private async getPendingCount(): Promise<number> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(WAL_STORE_NAME, 'readonly');
      const store = tx.objectStore(WAL_STORE_NAME);
      const index = store.index('status');

      const request = index.count('pending');

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  /**
   * Start a new transaction.
   */
  beginTransaction(): string {
    this.currentTransactionId = generateWALId();
    return this.currentTransactionId;
  }

  /**
   * End the current transaction.
   */
  endTransaction(): void {
    this.currentTransactionId = null;
  }

  /**
   * Log an operation to the WAL.
   */
  async log(type: WALOperationType, data: Record<string, unknown>): Promise<string> {
    const entry: WALEntry = {
      id: generateWALId(),
      sequence: ++this.sequence,
      type,
      data,
      timestamp: Date.now(),
      status: 'pending',
      transactionId: this.currentTransactionId ?? undefined,
    };

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(WAL_STORE_NAME, 'readwrite');
      const store = tx.objectStore(WAL_STORE_NAME);
      const request = store.add(entry);

      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve(entry.id);
    });
  }

  /**
   * Mark an operation as committed.
   */
  async commit(id: string): Promise<void> {
    return this.updateStatus(id, 'committed');
  }

  /**
   * Mark an operation as rolled back.
   */
  async rollback(id: string): Promise<void> {
    return this.updateStatus(id, 'rolled_back');
  }

  /**
   * Update the status of a WAL entry.
   */
  private async updateStatus(id: string, status: WALEntry['status']): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(WAL_STORE_NAME, 'readwrite');
      const store = tx.objectStore(WAL_STORE_NAME);
      const getRequest = store.get(id);

      getRequest.onerror = () => reject(getRequest.error);
      getRequest.onsuccess = () => {
        const entry = getRequest.result as WALEntry | undefined;
        if (!entry) {
          reject(new Error(`WAL entry not found: ${id}`));
          return;
        }

        entry.status = status;
        const putRequest = store.put(entry);
        putRequest.onerror = () => reject(putRequest.error);
      };

      tx.oncomplete = () => resolve();
    });
  }

  /**
   * Commit all operations in a transaction.
   */
  async commitTransaction(transactionId: string): Promise<void> {
    const entries = await this.getTransactionEntries(transactionId);

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(WAL_STORE_NAME, 'readwrite');
      const store = tx.objectStore(WAL_STORE_NAME);

      for (const entry of entries) {
        entry.status = 'committed';
        store.put(entry);
      }

      tx.onerror = () => reject(tx.error);
      tx.oncomplete = () => resolve();
    });
  }

  /**
   * Rollback all operations in a transaction.
   */
  async rollbackTransaction(transactionId: string): Promise<void> {
    const entries = await this.getTransactionEntries(transactionId);

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(WAL_STORE_NAME, 'readwrite');
      const store = tx.objectStore(WAL_STORE_NAME);

      for (const entry of entries) {
        entry.status = 'rolled_back';
        store.put(entry);
      }

      tx.onerror = () => reject(tx.error);
      tx.oncomplete = () => resolve();
    });
  }

  /**
   * Get all entries for a transaction.
   */
  private async getTransactionEntries(transactionId: string): Promise<WALEntry[]> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(WAL_STORE_NAME, 'readonly');
      const store = tx.objectStore(WAL_STORE_NAME);
      const index = store.index('transactionId');
      const request = index.getAll(transactionId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as WALEntry[]);
    });
  }

  /**
   * Get all pending operations for recovery.
   */
  async getPendingOperations(): Promise<WALEntry[]> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(WAL_STORE_NAME, 'readonly');
      const store = tx.objectStore(WAL_STORE_NAME);
      const index = store.index('status');
      const request = index.getAll('pending');

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const entries = request.result as WALEntry[];
        // Sort by sequence for proper ordering
        entries.sort((a, b) => a.sequence - b.sequence);
        resolve(entries);
      };
    });
  }

  /**
   * Replay pending operations (for crash recovery).
   */
  async replay(
    executor: (entry: WALEntry) => Promise<void>,
    options: { onProgress?: (completed: number, total: number) => void } = {}
  ): Promise<number> {
    const pending = await this.getPendingOperations();

    if (pending.length === 0) {
      return 0;
    }

    let completed = 0;

    for (const entry of pending) {
      try {
        await executor(entry);
        await this.commit(entry.id);
        completed++;
        options.onProgress?.(completed, pending.length);
      } catch (error) {
        console.error(`Failed to replay WAL entry ${entry.id}:`, error);
        // Mark as rolled back if we can't replay
        await this.rollback(entry.id);
      }
    }

    return completed;
  }

  /**
   * Clean up committed and rolled back entries older than the given age.
   */
  async cleanup(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
    const cutoff = Date.now() - maxAgeMs;

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(WAL_STORE_NAME, 'readwrite');
      const store = tx.objectStore(WAL_STORE_NAME);
      const request = store.openCursor();

      let deleted = 0;

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const entry = cursor.value as WALEntry;

          if (entry.status !== 'pending' && entry.timestamp < cutoff) {
            cursor.delete();
            deleted++;
          }

          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve(deleted);
    });
  }

  /**
   * Clear all WAL entries (use with caution).
   */
  async clear(): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(WAL_STORE_NAME, 'readwrite');
      const store = tx.objectStore(WAL_STORE_NAME);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      tx.oncomplete = () => {
        this.sequence = 0;
        resolve();
      };
    });
  }
}

/**
 * WAL-enabled operation wrapper.
 * Logs the operation to WAL before executing, then commits on success.
 */
export async function withWAL<T>(
  wal: WAL,
  type: WALOperationType,
  data: Record<string, unknown>,
  operation: () => Promise<T>
): Promise<T> {
  const entryId = await wal.log(type, data);

  try {
    const result = await operation();
    await wal.commit(entryId);
    return result;
  } catch (error) {
    await wal.rollback(entryId);
    throw error;
  }
}

/**
 * Create WAL replay executor for the storage layer.
 */
export function createReplayExecutor(storage: {
  addDocument: (doc: unknown) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  addVector: (vec: unknown) => Promise<void>;
  deleteVector: (id: string) => Promise<void>;
  saveIndex: (collectionId: string, data: unknown) => Promise<void>;
  createCollection: (collection: unknown) => Promise<void>;
  deleteCollection: (id: string) => Promise<void>;
  clearCollection: (collectionId: string) => Promise<void>;
  clear: () => Promise<void>;
}): (entry: WALEntry) => Promise<void> {
  return async (entry: WALEntry) => {
    switch (entry.type) {
      case 'add_document':
      case 'update_document':
        await storage.addDocument(entry.data.document);
        break;

      case 'delete_document':
        await storage.deleteDocument(entry.data.id as string);
        break;

      case 'add_vector':
        await storage.addVector(entry.data.vector);
        break;

      case 'delete_vector':
        await storage.deleteVector(entry.data.id as string);
        break;

      case 'save_index':
        await storage.saveIndex(entry.data.collectionId as string, entry.data.index);
        break;

      case 'create_collection':
        await storage.createCollection(entry.data.collection);
        break;

      case 'delete_collection':
        await storage.deleteCollection(entry.data.id as string);
        break;

      case 'clear_collection':
        await storage.clearCollection(entry.data.collectionId as string);
        break;

      case 'clear_database':
        await storage.clear();
        break;

      default:
        console.warn(`Unknown WAL operation type: ${entry.type}`);
    }
  };
}
