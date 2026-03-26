# @localmode/idb

Minimal idb storage adapter for LocalMode — lightweight IndexedDB wrapper with the smallest bundle footprint (~3KB).

[![npm](https://img.shields.io/npm/v/@localmode/idb)](https://www.npmjs.com/package/@localmode/idb)
[![license](https://img.shields.io/npm/l/@localmode/idb)](../../LICENSE)

[![Docs](https://img.shields.io/badge/Docs-LocalMode.dev-red)](https://localmode.dev/docs/idb)
[![Demo](https://img.shields.io/badge/Demo-LocalMode.ai-purple)](https://localmode.ai)

## Installation

```bash
pnpm install @localmode/idb @localmode/core
```

## Quick Start

```typescript
import { IDBStorage } from '@localmode/idb';
import { createVectorDB } from '@localmode/core';

const storage = new IDBStorage({ name: 'my-app' });

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
new IDBStorage({ name: string })
```

### StorageAdapter Methods

`IDBStorage` implements the `StorageAdapter` interface from `@localmode/core`:

| Method | Description |
|--------|-------------|
| `open()` / `close()` | Manage database connection |
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

## Why idb?

The idb library is a tiny (~3KB gzipped) Promise wrapper around IndexedDB by Jake Archibald (Google Chrome team):

1. **Minimal size** — Smallest viable IndexedDB wrapper
2. **Promise-based** — Clean async/await API, no callbacks
3. **TypeScript** — Excellent type support
4. **Well-maintained** — Widely used, battle-tested

## Comparison

| Feature | IndexedDBStorage (built-in) | IDBStorage | DexieStorage |
|---------|---------------------------|------------|--------------|
| Bundle size | 0KB (built-in) | ~3KB | ~15KB |
| Schema versioning | Manual | Basic | Advanced |
| Transactions | Manual | Manual | Automatic |
| Queries | Basic | Basic | Indexed |
| TypeScript | Good | Excellent | Excellent |

## When to Use

- You need the **smallest possible bundle**
- Simple storage needs without complex queries
- Prefer minimal abstractions over feature-rich wrappers

## Acknowledgments

This package is built on [idb](https://github.com/jakearchibald/idb) by [Jake Archibald](https://jakearchibald.com/) — a tiny, Promise-based IndexedDB wrapper.

## License

[MIT](../../LICENSE)
