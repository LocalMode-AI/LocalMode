# @localmode/localforage

Cross-browser storage adapter for LocalMode — automatic fallback from IndexedDB to WebSQL to localStorage.

[![npm](https://img.shields.io/npm/v/@localmode/localforage)](https://www.npmjs.com/package/@localmode/localforage)
[![license](https://img.shields.io/npm/l/@localmode/localforage)](../../LICENSE)

[![Docs](https://img.shields.io/badge/Docs-LocalMode.dev-red)](https://localmode.dev/docs/localforage)
[![Demo](https://img.shields.io/badge/Demo-LocalMode.ai-purple)](https://localmode.ai)

## Installation

```bash
pnpm install @localmode/localforage @localmode/core
```

## Quick Start

```typescript
import { LocalForageStorage } from '@localmode/localforage';
import { createVectorDB } from '@localmode/core';

const storage = new LocalForageStorage({ name: 'my-app' });

const db = await createVectorDB({
  name: 'my-app',
  dimensions: 384,
  storage,
});

// Use db.add(), db.search(), etc.
```

## API

### Constructor

```typescript
new LocalForageStorage({ name: string, driver?: string[] })
```

**Options:**

- `name` — Database name (required)
- `driver` — Preferred driver order (optional, defaults to `[localforage.INDEXEDDB, localforage.WEBSQL, localforage.LOCALSTORAGE]`). Accepts localforage driver constants or string values.

### StorageAdapter Methods

`LocalForageStorage` implements the `StorageAdapter` interface from `@localmode/core`:

| Method | Description |
|--------|-------------|
| `open()` / `close()` | Manage storage connection (`close()` is a no-op — localforage does not manage explicit connections) |
| `addDocument(doc)` | Add/upsert a document |
| `getDocument(id)` | Get document by ID (returns `null` if missing) |
| `deleteDocument(id)` | Delete a document |
| `getAllDocuments(collectionId)` | Get all documents in a collection |
| `countDocuments(collectionId)` | Count documents in a collection |
| `addVector(vec)` | Add/upsert a vector |
| `getVector(id)` | Get vector as `Float32Array \| null` |
| `deleteVector(id)` | Delete a vector |
| `getAllVectors(collectionId)` | Get all vectors as `Map<string, Float32Array>` |
| `saveIndex(collectionId, index)` | Save serialized HNSW index |
| `loadIndex(collectionId)` | Load serialized HNSW index |
| `deleteIndex(collectionId)` | Delete an index |
| `createCollection(collection)` | Create a collection |
| `getCollection(id)` | Get collection by ID |
| `getCollectionByName(name)` | Get collection by name |
| `getAllCollections()` | List all collections |
| `deleteCollection(id)` | Delete a collection |
| `clear()` | Clear all data |
| `clearCollection(collectionId)` | Clear a specific collection |
| `estimateSize()` | Estimate storage size in bytes |

## Auto-Fallback Behavior

localforage automatically selects the best available storage driver:

| Driver | Priority | Notes |
|--------|----------|-------|
| IndexedDB | 1 | Best performance, largest storage |
| WebSQL | 2 | Deprecated but still works in some browsers |
| localStorage | 3 | Limited to 5-10MB, synchronous under the hood |

This means `LocalForageStorage` works in environments where IndexedDB is unavailable, such as **Safari Private Browsing** mode, by falling back to localStorage.

## Comparison

| Feature | Built-in IndexedDB | IDBStorage | LocalForageStorage | DexieStorage |
|---------|-------------------|------------|-------------------|--------------|
| Bundle size | 0KB | ~3KB | ~10KB | ~15KB |
| Safari Private | No | No | Yes | No |
| Auto-fallback | No | No | Yes | No |
| Schema versioning | Manual | No | No | Built-in |
| Transactions | Manual | No | No | Automatic |
| Storage limit | Large | Large | Varies by driver | Large |

## When to Use

- You need **maximum browser compatibility**
- **Safari Private Browsing** support is required
- You prefer a **simple, consistent API** regardless of underlying driver
- You don't need advanced features like schema versioning or indexed queries

## Acknowledgments

This package is built on [localForage](https://localforage.github.io/localForage/) by [Mozilla](https://mozilla.org/) — a cross-browser storage library with automatic fallback from IndexedDB to WebSQL to localStorage.

## License

[MIT](../../LICENSE)
