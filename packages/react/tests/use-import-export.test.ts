/**
 * @file use-import-export.test.ts
 * @description Tests for useImportExport hook state management
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useImportExport } from '../src/hooks/use-import-export.js';
import { parseExternalFormat, importFrom } from '@localmode/core';

function createTestDB(dimensions = 3) {
  const documents: Array<{ id: string; vector: Float32Array; metadata?: Record<string, unknown> }> = [];

  return {
    dimensions,
    documents,
    async addMany(docs: Array<{ id: string; vector: Float32Array; metadata?: Record<string, unknown> }>) {
      for (const doc of docs) {
        documents.push({ ...doc });
      }
    },
    async export() {
      return new Blob([JSON.stringify({
        version: 1,
        collections: [{
          name: 'test',
          dimensions,
          documents: documents.map((d) => ({
            id: d.id,
            metadata: d.metadata,
            vector: Array.from(d.vector),
          })),
        }],
      })], { type: 'application/json' });
    },
  };
}

describe('useImportExport()', () => {
  it('returns initial state', () => {
    const db = createTestDB();
    const { result } = renderHook(() => useImportExport({ db }));

    expect(result.current.isImporting).toBe(false);
    expect(result.current.isParsing).toBe(false);
    expect(result.current.isExporting).toBe(false);
    expect(result.current.progress).toBeNull();
    expect(result.current.stats).toBeNull();
    expect(result.current.parseResult).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('core parseExternalFormat works directly', () => {
    const data = JSON.stringify({
      vectors: [{ id: 'v1', values: [0.1, 0.2, 0.3] }],
    });

    const result = parseExternalFormat(data);
    expect(result.totalRecords).toBe(1);
    expect(result.format).toBe('pinecone');
  });

  it('core importFrom works directly', async () => {
    const db = createTestDB();
    const data = JSON.stringify({
      vectors: [{ id: 'v1', values: [0.1, 0.2, 0.3] }],
    });

    const stats = await importFrom({ db, content: data, format: 'pinecone' });
    expect(stats.imported).toBe(1);
    expect(db.documents).toHaveLength(1);
  });

  it('parsePreview returns ParseResult without importing', async () => {
    const db = createTestDB();
    const { result } = renderHook(() => useImportExport({ db }));

    const data = JSON.stringify({
      vectors: [{ id: 'v1', values: [0.1, 0.2, 0.3] }],
    });

    await act(async () => {
      const returned = await result.current.parsePreview({ content: data, format: 'pinecone' });
      // Check the returned value inside act
      expect(returned).not.toBeNull();
      expect(returned!.totalRecords).toBe(1);
    });

    expect(result.current.parseResult).not.toBeNull();
    expect(result.current.parseResult!.format).toBe('pinecone');
    expect(result.current.parseResult!.dimensions).toBe(3);
    expect(db.documents).toHaveLength(0);
  });

  it('importData imports records and returns stats', async () => {
    const db = createTestDB();
    const { result } = renderHook(() => useImportExport({ db }));

    const data = JSON.stringify({
      vectors: [
        { id: 'v1', values: [0.1, 0.2, 0.3] },
        { id: 'v2', values: [0.4, 0.5, 0.6] },
      ],
    });

    await act(async () => {
      const returned = await result.current.importData({ content: data, format: 'pinecone' });
      expect(returned).not.toBeNull();
      expect(returned!.imported).toBe(2);
    });

    expect(result.current.stats).not.toBeNull();
    expect(result.current.isImporting).toBe(false);
    expect(db.documents).toHaveLength(2);
  });

  it('handles errors with toAppError', async () => {
    const db = createTestDB();
    const { result } = renderHook(() => useImportExport({ db }));

    await act(async () => {
      await result.current.importData({ content: 'not valid', format: 'pinecone' });
    });

    expect(result.current.error).not.toBeNull();
    expect(result.current.error!.message).toBeTruthy();
    expect(result.current.isImporting).toBe(false);
  });

  it('reset clears all state', async () => {
    const db = createTestDB();
    const { result } = renderHook(() => useImportExport({ db }));

    await act(async () => {
      await result.current.importData({ content: 'invalid', format: 'pinecone' });
    });
    expect(result.current.error).not.toBeNull();

    act(() => {
      result.current.reset();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.stats).toBeNull();
    expect(result.current.parseResult).toBeNull();
    expect(result.current.progress).toBeNull();
  });
});
