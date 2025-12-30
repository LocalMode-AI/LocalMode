/**
 * Tests for Write-Ahead Log (WAL).
 */

import { describe, it, expect, vi } from 'vitest';
import { createReplayExecutor, type WALEntry } from '../src/storage/wal';

describe('WAL Replay Executor', () => {
  it('should create a replay executor', () => {
    const mockStorage = {
      addDocument: vi.fn(),
      deleteDocument: vi.fn(),
      addVector: vi.fn(),
      deleteVector: vi.fn(),
      saveIndex: vi.fn(),
      createCollection: vi.fn(),
      deleteCollection: vi.fn(),
      clearCollection: vi.fn(),
      clear: vi.fn(),
    };

    const executor = createReplayExecutor(mockStorage);
    expect(typeof executor).toBe('function');
  });

  it('should replay add_document operation', async () => {
    const mockStorage = {
      addDocument: vi.fn().mockResolvedValue(undefined),
      deleteDocument: vi.fn(),
      addVector: vi.fn(),
      deleteVector: vi.fn(),
      saveIndex: vi.fn(),
      createCollection: vi.fn(),
      deleteCollection: vi.fn(),
      clearCollection: vi.fn(),
      clear: vi.fn(),
    };

    const executor = createReplayExecutor(mockStorage);
    const entry: WALEntry = {
      id: 'wal-1',
      sequence: 1,
      type: 'add_document',
      data: { document: { id: 'doc-1', collectionId: 'default' } },
      timestamp: Date.now(),
      status: 'pending',
    };

    await executor(entry);

    expect(mockStorage.addDocument).toHaveBeenCalledWith({ id: 'doc-1', collectionId: 'default' });
  });

  it('should replay delete_document operation', async () => {
    const mockStorage = {
      addDocument: vi.fn(),
      deleteDocument: vi.fn().mockResolvedValue(undefined),
      addVector: vi.fn(),
      deleteVector: vi.fn(),
      saveIndex: vi.fn(),
      createCollection: vi.fn(),
      deleteCollection: vi.fn(),
      clearCollection: vi.fn(),
      clear: vi.fn(),
    };

    const executor = createReplayExecutor(mockStorage);
    const entry: WALEntry = {
      id: 'wal-2',
      sequence: 2,
      type: 'delete_document',
      data: { id: 'doc-1' },
      timestamp: Date.now(),
      status: 'pending',
    };

    await executor(entry);

    expect(mockStorage.deleteDocument).toHaveBeenCalledWith('doc-1');
  });

  it('should replay add_vector operation', async () => {
    const mockStorage = {
      addDocument: vi.fn(),
      deleteDocument: vi.fn(),
      addVector: vi.fn().mockResolvedValue(undefined),
      deleteVector: vi.fn(),
      saveIndex: vi.fn(),
      createCollection: vi.fn(),
      deleteCollection: vi.fn(),
      clearCollection: vi.fn(),
      clear: vi.fn(),
    };

    const executor = createReplayExecutor(mockStorage);
    const entry: WALEntry = {
      id: 'wal-3',
      sequence: 3,
      type: 'add_vector',
      data: { vector: { id: 'vec-1', collectionId: 'default', vector: [1, 2, 3] } },
      timestamp: Date.now(),
      status: 'pending',
    };

    await executor(entry);

    expect(mockStorage.addVector).toHaveBeenCalled();
  });

  it('should replay clear_database operation', async () => {
    const mockStorage = {
      addDocument: vi.fn(),
      deleteDocument: vi.fn(),
      addVector: vi.fn(),
      deleteVector: vi.fn(),
      saveIndex: vi.fn(),
      createCollection: vi.fn(),
      deleteCollection: vi.fn(),
      clearCollection: vi.fn(),
      clear: vi.fn().mockResolvedValue(undefined),
    };

    const executor = createReplayExecutor(mockStorage);
    const entry: WALEntry = {
      id: 'wal-4',
      sequence: 4,
      type: 'clear_database',
      data: {},
      timestamp: Date.now(),
      status: 'pending',
    };

    await executor(entry);

    expect(mockStorage.clear).toHaveBeenCalled();
  });
});

describe('WAL Entry Types', () => {
  it('should have correct structure', () => {
    const entry: WALEntry = {
      id: 'test-id',
      sequence: 1,
      type: 'add_document',
      data: { document: { id: 'doc-1' } },
      timestamp: Date.now(),
      status: 'pending',
      transactionId: 'tx-1',
    };

    expect(entry.id).toBe('test-id');
    expect(entry.sequence).toBe(1);
    expect(entry.type).toBe('add_document');
    expect(entry.status).toBe('pending');
    expect(entry.transactionId).toBe('tx-1');
  });
});

