/**
 * Web Worker for VectorDB operations.
 * All heavy computation runs here to keep the main thread responsive.
 */

import type { WorkerRequest, WorkerResponse, VectorDBConfig, Document, SearchOptions, AddManyOptions, FilterQuery, ExportOptions, ImportOptions } from '../types.js';
import { VectorDBImpl } from '../db.js';

let db: VectorDBImpl | null = null;

/**
 * Handle incoming messages from the main thread.
 */
self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, type, payload, collectionId } = event.data;
  
  try {
    let result: unknown;
    
    switch (type) {
      case 'init': {
        const config = payload as VectorDBConfig;
        db = new VectorDBImpl(config);
        await db.initialize();
        result = true;
        break;
      }
      
      case 'add': {
        ensureDb();
        const targetDb = collectionId ? (db!.collection(collectionId) as VectorDBImpl) : db!;
        const doc = deserializeDocument(payload as SerializedDocument);
        await targetDb.add(doc);
        result = true;
        break;
      }
      
      case 'addMany': {
        ensureDb();
        const targetDb = collectionId ? (db!.collection(collectionId) as VectorDBImpl) : db!;
        const { documents, options } = payload as { documents: SerializedDocument[]; options?: AddManyOptions };
        const docs = documents.map(deserializeDocument);
        
        // Create a progress handler that posts messages back
        const wrappedOptions: AddManyOptions = {
          ...options,
          onProgress: options?.onProgress ? (completed, total) => {
            self.postMessage({
              id,
              type: 'progress',
              payload: { completed, total },
            });
          } : undefined,
        };
        
        await targetDb.addMany(docs, wrappedOptions);
        result = true;
        break;
      }
      
      case 'search': {
        ensureDb();
        const targetDb = collectionId ? (db!.collection(collectionId) as VectorDBImpl) : db!;
        const { vector, options } = payload as { vector: number[]; options?: SearchOptions };
        const queryVector = new Float32Array(vector);
        result = await targetDb.search(queryVector, options);
        break;
      }
      
      case 'get': {
        ensureDb();
        const targetDb = collectionId ? (db!.collection(collectionId) as VectorDBImpl) : db!;
        const docId = payload as string;
        const doc = await targetDb.get(docId);
        result = doc ? serializeDocument(doc) : null;
        break;
      }
      
      case 'update': {
        ensureDb();
        const targetDb = collectionId ? (db!.collection(collectionId) as VectorDBImpl) : db!;
        const { docId, updates } = payload as { docId: string; updates: Partial<SerializedDocument> };
        const deserializedUpdates: Partial<Document> = {
          metadata: updates.metadata,
        };
        if (updates.vector) {
          deserializedUpdates.vector = new Float32Array(updates.vector);
        }
        await targetDb.update(docId, deserializedUpdates);
        result = true;
        break;
      }
      
      case 'delete': {
        ensureDb();
        const targetDb = collectionId ? (db!.collection(collectionId) as VectorDBImpl) : db!;
        const deleteId = payload as string;
        await targetDb.delete(deleteId);
        result = true;
        break;
      }
      
      case 'deleteMany': {
        ensureDb();
        const targetDb = collectionId ? (db!.collection(collectionId) as VectorDBImpl) : db!;
        const ids = payload as string[];
        await targetDb.deleteMany(ids);
        result = true;
        break;
      }
      
      case 'deleteWhere': {
        ensureDb();
        const targetDb = collectionId ? (db!.collection(collectionId) as VectorDBImpl) : db!;
        const filter = payload as FilterQuery;
        result = await targetDb.deleteWhere(filter);
        break;
      }
      
      case 'stats': {
        ensureDb();
        result = await db!.stats();
        break;
      }
      
      case 'clear': {
        ensureDb();
        const targetDb = collectionId ? (db!.collection(collectionId) as VectorDBImpl) : db!;
        await targetDb.clear();
        result = true;
        break;
      }
      
      case 'close': {
        if (db) {
          await db.close();
          db = null;
        }
        result = true;
        break;
      }
      
      case 'export': {
        ensureDb();
        const exportOptions = payload as ExportOptions | undefined;
        const blob = await db!.export(exportOptions);
        // Convert blob to array buffer for transfer
        const buffer = await blob.arrayBuffer();
        result = { buffer, type: blob.type };
        break;
      }
      
      case 'import': {
        ensureDb();
        const { buffer, type: blobType, options: importOptions } = payload as { 
          buffer: ArrayBuffer; 
          type: string; 
          options?: ImportOptions;
        };
        const blob = new Blob([buffer], { type: blobType });
        await db!.import(blob, importOptions);
        result = true;
        break;
      }
      
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
    
    const response: WorkerResponse = { id, success: true, result };
    self.postMessage(response);
    
  } catch (error) {
    const response: WorkerResponse = {
      id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
};

function ensureDb(): void {
  if (!db) {
    throw new Error('Database not initialized. Send "init" message first.');
  }
}

// ============================================
// Serialization helpers
// ============================================

interface SerializedDocument {
  id: string;
  vector: number[];
  metadata?: Record<string, unknown>;
}

function deserializeDocument(doc: SerializedDocument): Document {
  return {
    id: doc.id,
    vector: new Float32Array(doc.vector),
    metadata: doc.metadata,
  };
}

function serializeDocument(doc: Document & { metadata?: Record<string, unknown> }): SerializedDocument {
  return {
    id: doc.id,
    vector: Array.from(doc.vector),
    metadata: doc.metadata,
  };
}

