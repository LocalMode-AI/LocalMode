/**
 * Main thread proxy for the VectorDB worker.
 * Provides an async API that communicates with the worker.
 */

import type {
  VectorDB,
  VectorDBConfig,
  Document,
  SearchOptions,
  SearchResult,
  AddManyOptions,
  ExportOptions,
  ImportOptions,
  DBStats,
  FilterQuery,
  WorkerRequest,
  WorkerResponse,
  WorkerMessageType,
} from '../types.js';

/**
 * Proxy class that communicates with the VectorDB worker.
 */
export class VectorDBWorkerProxy implements VectorDB {
  private worker: Worker;
  private messageId = 0;
  private pendingRequests = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      onProgress?: (completed: number, total: number) => void;
    }
  >();
  private collectionId?: string;

  constructor(worker: Worker, collectionId?: string) {
    this.worker = worker;
    this.collectionId = collectionId;

    this.worker.onmessage = (
      event: MessageEvent<
        | WorkerResponse
        | { id: number; type: 'progress'; payload: { completed: number; total: number } }
      >
    ) => {
      const message = event.data;

      // Handle progress updates
      if ('type' in message && message.type === 'progress') {
        const pending = this.pendingRequests.get(message.id);
        if (pending?.onProgress) {
          pending.onProgress(message.payload.completed, message.payload.total);
        }
        return;
      }

      const response = message as WorkerResponse;
      const pending = this.pendingRequests.get(response.id);

      if (pending) {
        this.pendingRequests.delete(response.id);

        if (response.success) {
          pending.resolve(response.result);
        } else {
          pending.reject(new Error(response.error ?? 'Unknown error'));
        }
      }
    };

    this.worker.onerror = (event) => {
      console.error('Worker error:', event);
    };
  }

  /**
   * Send a message to the worker and wait for a response.
   */
  private async send<T>(
    type: WorkerMessageType,
    payload: unknown,
    onProgress?: (completed: number, total: number) => void
  ): Promise<T> {
    const id = ++this.messageId;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        onProgress,
      });

      const request: WorkerRequest = {
        id,
        type,
        payload,
        collectionId: this.collectionId,
      };

      this.worker.postMessage(request);
    });
  }

  /**
   * Initialize the database in the worker.
   */
  async initialize(config: VectorDBConfig): Promise<void> {
    await this.send('init', config);
  }

  async add(doc: Document): Promise<void> {
    await this.send('add', {
      id: doc.id,
      vector: Array.from(doc.vector),
      metadata: doc.metadata,
    });
  }

  async addMany(docs: Document[], options?: AddManyOptions): Promise<void> {
    await this.send(
      'addMany',
      {
        documents: docs.map((doc) => ({
          id: doc.id,
          vector: Array.from(doc.vector),
          metadata: doc.metadata,
        })),
        options: options ? { batchSize: options.batchSize } : undefined,
      },
      options?.onProgress
    );
  }

  async search(vector: Float32Array, options?: SearchOptions): Promise<SearchResult[]> {
    return this.send('search', {
      vector: Array.from(vector),
      options,
    });
  }

  async get(id: string): Promise<(Document & { metadata?: Record<string, unknown> }) | null> {
    const result = await this.send<{
      id: string;
      vector: number[];
      metadata?: Record<string, unknown>;
    } | null>('get', id);

    if (!result) return null;

    return {
      id: result.id,
      vector: new Float32Array(result.vector),
      metadata: result.metadata,
    };
  }

  async update(id: string, updates: Partial<Omit<Document, 'id'>>): Promise<void> {
    await this.send('update', {
      docId: id,
      updates: {
        vector: updates.vector ? Array.from(updates.vector) : undefined,
        metadata: updates.metadata,
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.send('delete', id);
  }

  async deleteMany(ids: string[]): Promise<void> {
    await this.send('deleteMany', ids);
  }

  async deleteWhere(filter: FilterQuery): Promise<number> {
    return this.send('deleteWhere', filter);
  }

  collection(name: string): VectorDB {
    // Return a new proxy for the collection
    return new VectorDBWorkerProxy(this.worker, name);
  }

  async stats(): Promise<DBStats> {
    return this.send('stats', null);
  }

  async clear(): Promise<void> {
    await this.send('clear', null);
  }

  async close(): Promise<void> {
    await this.send('close', null);
    this.worker.terminate();
  }

  async export(options?: ExportOptions): Promise<Blob> {
    const result = await this.send<{ buffer: ArrayBuffer; type: string }>('export', options);
    return new Blob([result.buffer], { type: result.type });
  }

  async import(data: Blob, options?: ImportOptions): Promise<void> {
    const buffer = await data.arrayBuffer();
    await this.send('import', {
      buffer,
      type: data.type,
      options,
    });
  }

  /**
   * Get the lock manager.
   * Note: Locking is not available in worker mode.
   */
  getLockManager(): null {
    return null;
  }

  /**
   * Get the broadcaster.
   * Note: Broadcasting is not available in worker mode.
   */
  getBroadcaster(): null {
    return null;
  }
}

/**
 * Create a VectorDB instance that runs in a Web Worker.
 */
export async function createVectorDBWithWorker(
  config: VectorDBConfig,
  workerUrl: string | URL
): Promise<VectorDB> {
  const worker = new Worker(workerUrl, { type: 'module' });
  const proxy = new VectorDBWorkerProxy(worker);
  await proxy.initialize(config);
  return proxy;
}
