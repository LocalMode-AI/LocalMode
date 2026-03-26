# @localmode/dexie

Dexie.js storage adapter for LocalMode — enhanced IndexedDB with schema versioning and transactions.

[![npm](https://img.shields.io/npm/v/@localmode/dexie)](https://www.npmjs.com/package/@localmode/dexie)
[![license](https://img.shields.io/npm/l/@localmode/dexie)](../../LICENSE)

[![Docs](https://img.shields.io/badge/Docs-LocalMode.dev-red)](https://localmode.dev/docs/dexie)
[![Demo](https://img.shields.io/badge/Demo-LocalMode.ai-purple)](https://localmode.ai)

## Installation

```bash
pnpm install @localmode/dexie @localmode/core
```

## Quick Start

```typescript
import { DexieStorage } from '@localmode/dexie';
import { createVectorDB } from '@localmode/core';

const storage = new DexieStorage({ name: 'my-app' });

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
new DexieStorage({ name: string })
```

### StorageAdapter Methods

`DexieStorage` implements the `StorageAdapter` interface from `@localmode/core`:

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

## Why Dexie?

| Feature | IndexedDBStorage (built-in) | DexieStorage |
|---------|---------------------------|--------------|
| Bundle size | 0KB (built-in) | ~15KB |
| Schema versioning | Manual migrations | Built-in |
| Transactions | Manual | Automatic |
| Queries | Basic | Indexed |
| TypeScript | Good | Excellent |

## Acknowledgments

This package is built on [Dexie.js](https://dexie.org/) by [David Fahlander](https://github.com/dfahlander) — a minimalistic IndexedDB wrapper with schema versioning and transactions.

## License

[MIT](../../LICENSE)
