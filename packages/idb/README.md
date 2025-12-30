# @localmode/idb

> 🚧 **In Development** — This package is under active development and not yet used in production applications. API may change.

Minimal IndexedDB storage adapter using the idb library - the lightest option at ~3KB.

[![npm](https://img.shields.io/npm/v/@localmode/idb)](https://www.npmjs.com/package/@localmode/idb)
[![license](https://img.shields.io/npm/l/@localmode/idb)](../../LICENSE)

## Features

- 🪶 **Minimal Overhead** - Only ~3KB added to bundle
- 📦 **Promise-Based** - Clean async/await API
- ⚡ **Transaction Support** - Atomic batch operations
- 🛠️ **TypeScript** - Full type safety

## Installation

```bash
# Preferred: pnpm
pnpm install @localmode/idb @localmode/core idb

# Alternative: npm
npm install @localmode/idb @localmode/core idb
```

## Quick Start

```typescript
import { IDBStorage } from '@localmode/idb';

const storage = new IDBStorage({ name: 'my-app' });
await storage.open();

// Store documents and vectors
await storage.setDocument('doc-1', {
  metadata: { title: 'Hello' },
});
await storage.setVector('doc-1', new Float32Array([0.1, 0.2, 0.3]));

// Retrieve data
const doc = await storage.getDocument('doc-1');
const vector = await storage.getVector('doc-1');

await storage.close();
```

## Batch Operations

```typescript
// Add multiple items atomically
await storage.addMany([
  { id: 'doc-1', vector: embedding1, metadata: { title: 'First' } },
  { id: 'doc-2', vector: embedding2, metadata: { title: 'Second' } },
]);

// Delete multiple items
await storage.deleteMany(['doc-1', 'doc-2']);
```

## API Reference

### Constructor

```typescript
new IDBStorage(options: IDBStorageOptions)
```

**Options:**

- `name` - Database name (required)
- `version` - Schema version (default: 1)

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
- `getAllVectors()` - Get all vectors
- `clearVectors()` - Delete all vectors

### Index Operations

- `getIndex(id)` - Get serialized index
- `setIndex(id, index)` - Store serialized index
- `deleteIndex(id)` - Delete index

### Batch Operations

- `addMany(items)` - Add multiple documents and vectors atomically
- `deleteMany(ids)` - Delete multiple items atomically
- `clearAll()` - Clear all data

### Utility Methods

- `open()` - Open database connection
- `close()` - Close database connection
- `delete()` - Delete entire database

## Why idb?

The idb library is a tiny (~3KB gzipped) Promise wrapper around IndexedDB:

1. **Minimal size** - Smallest viable IndexedDB wrapper
2. **Promise-based** - No callbacks needed
3. **TypeScript** - Excellent type support
4. **Well-maintained** - By Jake Archibald (Google Chrome team)

## Comparison

| Feature        | Built-in IndexedDB | IDBStorage | DexieStorage |
| -------------- | ------------------ | ---------- | ------------ |
| Bundle size    | 0KB                | ~3KB       | ~15KB        |
| Learning curve | High               | Low        | Low          |
| TypeScript     | Manual             | Excellent  | Excellent    |
| Versioning     | Manual             | Basic      | Advanced     |

## When to Use

- You need the **smallest possible bundle**
- Simple storage needs without complex queries
- Prefer minimal abstractions

## License

[MIT](../../LICENSE)
