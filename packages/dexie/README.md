# @localmode/dexie

> 🚧 **In Development** — This package is under active development and not yet used in production applications. API may change.

[![license](https://img.shields.io/npm/l/@localmode/dexie)](../../LICENSE)

## Features

- 📦 **Schema Versioning** - Built-in migration support
- ⚡ **Transaction Support** - Atomic batch operations
- 🔍 **Better Queries** - Indexed fields for faster lookups
- 🛠️ **Developer-Friendly** - Excellent TypeScript support

## Installation

```bash
pnpm install @localmode/dexie @localmode/core
```

## Quick Start

```typescript
import { DexieStorage } from '@localmode/dexie';

// Create storage instance
const storage = new DexieStorage({
  name: 'my-app',
  version: 1,
});

// Store documents and vectors
await storage.setDocument('doc-1', {
  metadata: { title: 'Hello' },
});

await storage.setVector('doc-1', new Float32Array([0.1, 0.2, 0.3]));

// Retrieve data
const doc = await storage.getDocument('doc-1');
const vector = await storage.getVector('doc-1');
```

## Batch Operations

```typescript
// Add multiple items in a single transaction
await storage.addMany([
  { id: 'doc-1', vector: embedding1, metadata: { title: 'First' } },
  { id: 'doc-2', vector: embedding2, metadata: { title: 'Second' } },
  { id: 'doc-3', vector: embedding3, metadata: { title: 'Third' } },
]);

// Delete multiple items
await storage.deleteMany(['doc-1', 'doc-2']);
```

## Collections

```typescript
// Create a collection
await storage.setCollection('my-collection', {
  name: 'My Collection',
  dimensions: 384,
  distanceFunction: 'cosine',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  documentCount: 0,
});

// Get all collections
const collections = await storage.getAllCollections();
```

## Index Storage

```typescript
// Store serialized HNSW index
await storage.setIndex('main-index', {
  data: serializedIndexData,
  metadata: {
    dimensions: 384,
    nodeCount: 1000,
    m: 16,
    efConstruction: 200,
  },
});

// Retrieve index
const index = await storage.getIndex('main-index');
```

## API Reference

### Constructor

```typescript
new DexieStorage(options: DexieStorageOptions)
```

**Options:**

- `name` - Database name (required)
- `version` - Schema version for migrations (default: 1)
- `autoOpen` - Auto-open on first operation (default: true)

### Document Operations

- `getDocument(id)` - Get document by ID
- `setDocument(id, doc)` - Create or update document
- `deleteDocument(id)` - Delete document
- `getDocumentIds()` - Get all document IDs
- `getDocumentCount()` - Get document count
- `clearDocuments()` - Delete all documents

### Vector Operations

- `getVector(id)` - Get vector by document ID
- `setVector(id, vector, collection?)` - Store vector
- `deleteVector(id)` - Delete vector
- `getAllVectors(collection?)` - Get all vectors
- `clearVectors()` - Delete all vectors

### Index Operations

- `getIndex(id)` - Get serialized index
- `setIndex(id, index)` - Store serialized index
- `deleteIndex(id)` - Delete index

### Collection Operations

- `getCollection(id)` - Get collection metadata
- `setCollection(id, collection)` - Create/update collection
- `deleteCollection(id)` - Delete collection
- `getAllCollections()` - List all collections

### Batch Operations

- `addMany(items)` - Add multiple documents and vectors atomically
- `deleteMany(ids)` - Delete multiple items atomically
- `clearAll()` - Clear all data

### Utility Methods

- `open()` - Explicitly open database
- `close()` - Close database connection
- `exists()` - Check if database exists
- `delete()` - Delete entire database

## Why Dexie?

Dexie.js provides several advantages over raw IndexedDB:

1. **Promise-based API** - No callback hell
2. **Transaction handling** - Automatic transaction management
3. **Schema versioning** - Built-in migration support
4. **Indexed queries** - Fast lookups on indexed fields
5. **TypeScript support** - Excellent type inference

## Comparison with Built-in Storage

| Feature      | IndexedDBStorage | DexieStorage |
| ------------ | ---------------- | ------------ |
| Bundle size  | 0KB              | ~15KB        |
| Versioning   | Manual           | Built-in     |
| Transactions | Manual           | Automatic    |
| Queries      | Basic            | Advanced     |
| TypeScript   | Good             | Excellent    |

## License

[MIT](../../LICENSE)
