/**
 * In-memory storage adapter for testing.
 */

import type { StoredDocument, StoredVector, Collection, SerializedHNSWIndex } from '../types.js';

export class MemoryStorage {
  private documents: Map<string, StoredDocument> = new Map();
  private vectors: Map<string, StoredVector> = new Map();
  private indexes: Map<string, SerializedHNSWIndex> = new Map();
  private collections: Map<string, Collection> = new Map();

  async open(): Promise<void> {
    // No-op for memory storage
  }

  async close(): Promise<void> {
    // No-op for memory storage
  }

  // ============================================
  // Document Operations
  // ============================================

  async addDocument(doc: StoredDocument): Promise<void> {
    this.documents.set(doc.id, { ...doc });
  }

  async getDocument(id: string): Promise<StoredDocument | null> {
    const doc = this.documents.get(id);
    return doc ? { ...doc } : null;
  }

  async deleteDocument(id: string): Promise<void> {
    this.documents.delete(id);
  }

  async getAllDocuments(collectionId: string): Promise<StoredDocument[]> {
    const docs: StoredDocument[] = [];
    for (const doc of this.documents.values()) {
      if (doc.collectionId === collectionId) {
        docs.push({ ...doc });
      }
    }
    return docs;
  }

  async countDocuments(collectionId: string): Promise<number> {
    let count = 0;
    for (const doc of this.documents.values()) {
      if (doc.collectionId === collectionId) {
        count++;
      }
    }
    return count;
  }

  // ============================================
  // Vector Operations
  // ============================================

  async addVector(vec: StoredVector): Promise<void> {
    this.vectors.set(vec.id, {
      id: vec.id,
      collectionId: vec.collectionId,
      vector: new Float32Array(vec.vector),
    });
  }

  async getVector(id: string): Promise<Float32Array | null> {
    const vec = this.vectors.get(id);
    return vec ? new Float32Array(vec.vector) : null;
  }

  async deleteVector(id: string): Promise<void> {
    this.vectors.delete(id);
  }

  async getAllVectors(collectionId: string): Promise<Map<string, Float32Array>> {
    const result = new Map<string, Float32Array>();
    for (const vec of this.vectors.values()) {
      if (vec.collectionId === collectionId) {
        result.set(vec.id, new Float32Array(vec.vector));
      }
    }
    return result;
  }

  // ============================================
  // Index Operations
  // ============================================

  async saveIndex(collectionId: string, index: SerializedHNSWIndex): Promise<void> {
    this.indexes.set(collectionId, JSON.parse(JSON.stringify(index)));
  }

  async loadIndex(collectionId: string): Promise<SerializedHNSWIndex | null> {
    const index = this.indexes.get(collectionId);
    return index ? JSON.parse(JSON.stringify(index)) : null;
  }

  async deleteIndex(collectionId: string): Promise<void> {
    this.indexes.delete(collectionId);
  }

  // ============================================
  // Collection Operations
  // ============================================

  async createCollection(collection: Collection): Promise<void> {
    this.collections.set(collection.id, { ...collection });
  }

  async getCollection(id: string): Promise<Collection | null> {
    const collection = this.collections.get(id);
    return collection ? { ...collection } : null;
  }

  async getCollectionByName(name: string): Promise<Collection | null> {
    for (const collection of this.collections.values()) {
      if (collection.name === name) {
        return { ...collection };
      }
    }
    return null;
  }

  async getAllCollections(): Promise<Collection[]> {
    return Array.from(this.collections.values()).map((c) => ({ ...c }));
  }

  async deleteCollection(id: string): Promise<void> {
    this.collections.delete(id);
  }

  // ============================================
  // Utility Operations
  // ============================================

  async clear(): Promise<void> {
    this.documents.clear();
    this.vectors.clear();
    this.indexes.clear();
    this.collections.clear();
  }

  async clearCollection(collectionId: string): Promise<void> {
    // Delete documents
    for (const [id, doc] of this.documents) {
      if (doc.collectionId === collectionId) {
        this.documents.delete(id);
      }
    }

    // Delete vectors
    for (const [id, vec] of this.vectors) {
      if (vec.collectionId === collectionId) {
        this.vectors.delete(id);
      }
    }

    // Delete index
    this.indexes.delete(collectionId);
  }

  async estimateSize(): Promise<number> {
    // Rough estimate
    let size = 0;
    for (const vec of this.vectors.values()) {
      size += vec.vector.byteLength;
    }
    return size;
  }
}

