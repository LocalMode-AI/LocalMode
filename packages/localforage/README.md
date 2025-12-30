# @localmode/localforage

> 🚧 **In Development** — This package is under active development and not yet used in production applications. API may change.

Cross-browser storage adapter with automatic fallback from IndexedDB to WebSQL to localStorage.

[![npm](https://img.shields.io/npm/v/@localmode/localforage)](https://www.npmjs.com/package/@localmode/localforage)
[![license](https://img.shields.io/npm/l/@localmode/localforage)](../../LICENSE)

## Features

- 🔄 **Auto-Fallback** - IndexedDB → WebSQL → localStorage
- 🔒 **Safari Private Browsing** - Works when IndexedDB is blocked
- 📱 **Maximum Compatibility** - Works on older browsers
- ⚡ **Simple API** - Consistent interface regardless of driver

## Installation

```bash
# Preferred: pnpm
pnpm install @localmode/localforage @localmode/core localforage

# Alternative: npm
npm install @localmode/localforage @localmode/core localforage
```

## Quick Start

```typescript
import { LocalForageStorage } from '@localmode/localforage';

const storage = new LocalForageStorage({ name: 'my-app' });
await storage.ready();

// Store documents and vectors
await storage.setDocument('doc-1', {
  metadata: { title: 'Hello' },
});
await storage.setVector('doc-1', new Float32Array([0.1, 0.2, 0.3]));

// Retrieve data
const doc = await storage.getDocument('doc-1');
const vector = await storage.getVector('doc-1');

// Check which driver is being used
const driver = await storage.getDriver();
console.log(`Using: ${driver}`);

// Check if falling back from IndexedDB
const isFallback = await storage.isUsingFallback();
```

## Batch Operations

```typescript
// Add multiple items
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
new LocalForageStorage(options: LocalForageStorageOptions)
```

**Options:**

- `name` - Database name (required)
- `storeName` - Store name prefix (default: 'vectordb')
- `description` - Database description
- `drivers` - Preferred driver order (default: [INDEXEDDB, WEBSQL, LOCALSTORAGE])

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

- `addMany(items)` - Add multiple documents and vectors
- `deleteMany(ids)` - Delete multiple items
- `clearAll()` - Clear all data

### Utility Methods

- `ready()` - Wait for storage to be ready
- `getDriver()` - Get current storage driver
- `isUsingFallback()` - Check if using fallback driver
- `drop()` - Delete entire database

## Why localforage?

localforage provides automatic driver selection and fallback:

1. **Maximum compatibility** - Works on all browsers
2. **Safari Private Browsing** - Falls back to localStorage when IndexedDB is blocked
3. **Simple API** - Same interface regardless of underlying storage
4. **Well-maintained** - Widely used and tested

## Storage Drivers

| Driver       | Priority | Notes                             |
| ------------ | -------- | --------------------------------- |
| IndexedDB    | 1        | Best performance, largest storage |
| WebSQL       | 2        | Deprecated but still works        |
| localStorage | 3        | Limited to 5-10MB                 |

## Comparison

| Feature        | Built-in IndexedDB | IDBStorage | LocalForageStorage | DexieStorage |
| -------------- | ------------------ | ---------- | ------------------ | ------------ |
| Bundle size    | 0KB                | ~3KB       | ~10KB              | ~15KB        |
| Safari Private | ❌                 | ❌         | ✅                 | ❌           |
| Fallback       | ❌                 | ❌         | ✅                 | ❌           |
| Storage limit  | Large              | Large      | Varies             | Large        |

## When to Use

- You need **maximum browser compatibility**
- Safari Private Browsing support is required
- You prefer a **simple, consistent API**
- You don't need advanced features like versioning

## License

[MIT](../../LICENSE)
