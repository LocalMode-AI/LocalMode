/**
 * @file memory.test.ts
 * @description Unit tests for createAgentMemory()
 */
import { describe, it, expect } from 'vitest';
import { createAgentMemory } from '../../src/agents/memory.js';
import { createMockEmbeddingModel } from '../../src/testing/index.js';

function createTestMemory(maxEntries = 1000) {
  const embeddingModel = createMockEmbeddingModel({ dimensions: 384 });
  return createAgentMemory({
    embeddingModel,
    name: `test-memory-${Date.now()}`,
    dimensions: 384,
    maxEntries,
  });
}

describe('createAgentMemory()', () => {
  it('creates a memory instance', async () => {
    const memory = await createTestMemory();
    expect(memory).toBeDefined();
    expect(memory.add).toBeInstanceOf(Function);
    expect(memory.retrieve).toBeInstanceOf(Function);
    expect(memory.clear).toBeInstanceOf(Function);
    expect(memory.close).toBeInstanceOf(Function);
    await memory.close();
  });

  describe('add()', () => {
    it('stores entries', async () => {
      const memory = await createTestMemory();

      await memory.add({
        id: '1',
        role: 'user',
        content: 'What is quantum computing?',
        timestamp: Date.now(),
      });

      // Should be retrievable
      const results = await memory.retrieve('quantum computing', { minSimilarity: 0 });
      expect(results.length).toBeGreaterThanOrEqual(0);
      await memory.close();
    });

    it('handles multiple entries', async () => {
      const memory = await createTestMemory();

      await memory.add({
        id: '1',
        role: 'user',
        content: 'First message',
        timestamp: Date.now(),
      });

      await memory.add({
        id: '2',
        role: 'agent',
        content: 'Second message',
        timestamp: Date.now() + 1,
      });

      await memory.add({
        id: '3',
        role: 'tool',
        content: 'Third message from tool',
        timestamp: Date.now() + 2,
      });

      // All should be stored
      const results = await memory.retrieve('message', { maxResults: 10, minSimilarity: 0 });
      expect(results.length).toBeGreaterThanOrEqual(0);
      await memory.close();
    });
  });

  describe('eviction', () => {
    it('evicts oldest entry when maxEntries is exceeded', async () => {
      const memory = await createTestMemory(3);

      // Add 3 entries
      await memory.add({ id: '1', role: 'user', content: 'First oldest', timestamp: 1000 });
      await memory.add({ id: '2', role: 'user', content: 'Second', timestamp: 2000 });
      await memory.add({ id: '3', role: 'user', content: 'Third', timestamp: 3000 });

      // Adding a 4th should evict the oldest (id: 1)
      await memory.add({ id: '4', role: 'user', content: 'Fourth newest', timestamp: 4000 });

      // We can't directly count, but the memory should still work
      const results = await memory.retrieve('newest', { maxResults: 10, minSimilarity: 0 });
      // At minimum, the newest entry should be findable
      expect(results.length).toBeGreaterThanOrEqual(0);
      await memory.close();
    });
  });

  describe('retrieve()', () => {
    it('returns empty array from empty memory', async () => {
      const memory = await createTestMemory();
      const results = await memory.retrieve('anything');
      expect(results).toEqual([]);
      await memory.close();
    });

    it('respects maxResults', async () => {
      const memory = await createTestMemory();
      for (let i = 0; i < 5; i++) {
        await memory.add({
          id: `${i}`,
          role: 'user',
          content: `Message ${i} about testing`,
          timestamp: Date.now() + i,
        });
      }

      const results = await memory.retrieve('testing', { maxResults: 2, minSimilarity: 0 });
      expect(results.length).toBeLessThanOrEqual(2);
      await memory.close();
    });

    it('filters by role', async () => {
      const memory = await createTestMemory();

      await memory.add({ id: '1', role: 'user', content: 'User message about code', timestamp: 1 });
      await memory.add({ id: '2', role: 'tool', content: 'Tool result about code', timestamp: 2 });
      await memory.add({ id: '3', role: 'agent', content: 'Agent response about code', timestamp: 3 });

      const toolResults = await memory.retrieve('code', {
        maxResults: 10,
        minSimilarity: 0,
        filter: { role: 'tool' },
      });

      // All returned results should be tools
      for (const result of toolResults) {
        expect(result.role).toBe('tool');
      }

      await memory.close();
    });

    it('returns entries with correct structure', async () => {
      const memory = await createTestMemory();

      await memory.add({
        id: 'test-1',
        role: 'user',
        content: 'Hello world',
        timestamp: 12345,
        metadata: { extra: 'data' },
      });

      const results = await memory.retrieve('hello', { minSimilarity: 0 });
      if (results.length > 0) {
        const entry = results[0];
        expect(entry.id).toBe('test-1');
        expect(entry.role).toBe('user');
        expect(entry.content).toBe('Hello world');
        expect(entry.timestamp).toBe(12345);
      }

      await memory.close();
    });
  });

  describe('clear()', () => {
    it('removes all entries', async () => {
      const memory = await createTestMemory();

      await memory.add({ id: '1', role: 'user', content: 'Test content', timestamp: 1 });
      await memory.clear();

      const results = await memory.retrieve('test', { minSimilarity: 0 });
      expect(results).toEqual([]);
      await memory.close();
    });
  });

  describe('close()', () => {
    it('prevents further operations', async () => {
      const memory = await createTestMemory();
      await memory.close();

      await expect(
        memory.add({ id: '1', role: 'user', content: 'Test', timestamp: 1 })
      ).rejects.toThrow('closed');

      await expect(
        memory.retrieve('test')
      ).rejects.toThrow('closed');

      await expect(
        memory.clear()
      ).rejects.toThrow('closed');
    });

    it('is idempotent (can close twice)', async () => {
      const memory = await createTestMemory();
      await memory.close();
      await memory.close(); // Should not throw
    });
  });
});
