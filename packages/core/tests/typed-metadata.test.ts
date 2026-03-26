/**
 * @fileoverview Tests for typed VectorDB metadata generics and schema validation
 */

import { describe, it, expect } from 'vitest';
import {
  createVectorDB,
  createMockVectorDB,
  jsonSchema,
} from '../src/index.js';
import type {
  VectorDB,
  Document,
  SearchResult,
  TypedFilterQuery,
  VectorDBConfig,
} from '../src/index.js';

// ============================================
// Type-level tests (compile-time checks)
// ============================================

describe('Typed VectorDB Metadata — Type Safety', () => {
  interface ArticleMetadata extends Record<string, unknown> {
    title: string;
    category: 'blog' | 'docs' | 'api';
    pageCount: number;
  }

  it('Document<TMetadata> constrains metadata type', () => {
    const doc: Document<ArticleMetadata> = {
      id: '1',
      vector: new Float32Array(3),
      metadata: { title: 'Test', category: 'blog', pageCount: 5 },
    };
    expect(doc.metadata?.title).toBe('Test');
    expect(doc.metadata?.category).toBe('blog');
  });

  it('Document without generic defaults to Record<string, unknown>', () => {
    const doc: Document = {
      id: '1',
      vector: new Float32Array(3),
      metadata: { anything: 'goes', num: 42 },
    };
    expect(doc.metadata).toBeDefined();
  });

  it('SearchResult<TMetadata> carries typed metadata', () => {
    const result: SearchResult<ArticleMetadata> = {
      id: '1',
      score: 0.95,
      metadata: { title: 'Hello', category: 'docs', pageCount: 10 },
    };
    expect(result.metadata?.title).toBe('Hello');
  });

  it('TypedFilterQuery constrains keys to metadata shape', () => {
    // This should compile — category is a valid key
    const filter: TypedFilterQuery<ArticleMetadata> = {
      category: 'docs',
    };
    expect(filter.category).toBe('docs');

    // Numeric operators should work on number fields
    const numFilter: TypedFilterQuery<ArticleMetadata> = {
      pageCount: { $gt: 5 },
    };
    expect(numFilter.pageCount).toEqual({ $gt: 5 });
  });

  it('VectorDBConfig accepts generic type parameter', () => {
    const config: VectorDBConfig<ArticleMetadata> = {
      name: 'test',
      dimensions: 3,
    };
    expect(config.name).toBe('test');
  });

  it('VectorDB interface propagates generic', () => {
    // Compile-time check: VectorDB<ArticleMetadata> methods use typed metadata
    const _typeCheck = (db: VectorDB<ArticleMetadata>) => {
      // add() should accept Document<ArticleMetadata>
      db.add({
        id: '1',
        vector: new Float32Array(3),
        metadata: { title: 'T', category: 'blog', pageCount: 1 },
      });
    };
    expect(_typeCheck).toBeDefined();
  });
});

// ============================================
// Runtime tests with MemoryStorage
// ============================================

describe('Typed VectorDB Metadata — Runtime', () => {
  interface TestMeta extends Record<string, unknown> {
    label: string;
    score: number;
  }

  it('createVectorDB<TMetadata> works with typed metadata', async () => {
    const db = await createVectorDB<TestMeta>({
      name: 'typed-test',
      dimensions: 3,
      storage: 'memory',
    });

    await db.add({
      id: '1',
      vector: new Float32Array([0.1, 0.2, 0.3]),
      metadata: { label: 'first', score: 0.9 },
    });

    const doc = await db.get('1');
    expect(doc).not.toBeNull();
    expect(doc?.metadata?.label).toBe('first');
    expect(doc?.metadata?.score).toBe(0.9);

    await db.close();
  });

  it('untyped createVectorDB works unchanged (backward compat)', async () => {
    const db = await createVectorDB({
      name: 'untyped-test',
      dimensions: 3,
      storage: 'memory',
    });

    await db.add({
      id: '1',
      vector: new Float32Array([0.1, 0.2, 0.3]),
      metadata: { anything: true, count: 42 },
    });

    const doc = await db.get('1');
    expect(doc?.metadata?.anything).toBe(true);

    await db.close();
  });

  it('search returns typed results', async () => {
    const db = await createVectorDB<TestMeta>({
      name: 'search-typed',
      dimensions: 3,
      storage: 'memory',
    });

    await db.add({
      id: '1',
      vector: new Float32Array([1, 0, 0]),
      metadata: { label: 'one', score: 1.0 },
    });

    const results = await db.search(new Float32Array([1, 0, 0]), { k: 1 });
    expect(results.length).toBe(1);
    expect(results[0].metadata?.label).toBe('one');

    await db.close();
  });

  it('typed filter works with search', async () => {
    const db = await createVectorDB<TestMeta>({
      name: 'filter-typed',
      dimensions: 3,
      storage: 'memory',
    });

    await db.addMany([
      { id: '1', vector: new Float32Array([1, 0, 0]), metadata: { label: 'a', score: 0.9 } },
      { id: '2', vector: new Float32Array([0, 1, 0]), metadata: { label: 'b', score: 0.5 } },
    ]);

    const results = await db.search(new Float32Array([1, 0, 0]), {
      k: 10,
      filter: { label: 'a' },
    });
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('1');

    await db.close();
  });
});

// ============================================
// Schema validation tests
// ============================================

describe('Typed VectorDB Metadata — Schema Validation', () => {
  it('validates metadata on add() when schema is provided', async () => {
    const schema = jsonSchema<{ title: string }>({
      parse: (value: unknown) => {
        const v = value as Record<string, unknown>;
        if (typeof v?.title !== 'string') throw new Error('title must be a string');
        return v as { title: string };
      },
      jsonSchema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
    });

    const db = await createVectorDB<{ title: string }>({
      name: 'schema-test',
      dimensions: 3,
      storage: 'memory',
      schema,
    });

    // Valid metadata should work
    await db.add({
      id: '1',
      vector: new Float32Array([1, 0, 0]),
      metadata: { title: 'Hello' },
    });

    // Invalid metadata should throw
    await expect(
      db.add({
        id: '2',
        vector: new Float32Array([0, 1, 0]),
        metadata: { title: 123 as unknown as string },
      })
    ).rejects.toThrow(/Metadata validation failed/);

    await db.close();
  });

  it('skips validation when no schema is provided', async () => {
    const db = await createVectorDB({
      name: 'no-schema-test',
      dimensions: 3,
      storage: 'memory',
    });

    // Any metadata should work without schema
    await db.add({
      id: '1',
      vector: new Float32Array([1, 0, 0]),
      metadata: { random: 'stuff' },
    });

    const doc = await db.get('1');
    expect(doc?.metadata?.random).toBe('stuff');

    await db.close();
  });
});
