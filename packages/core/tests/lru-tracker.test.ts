/**
 * @file lru-tracker.test.ts
 * @description Tests for LRU eviction tracker
 */

import { describe, it, expect, vi } from 'vitest';

// We'll import after the module is created — for now define the test structure
// The agent is creating the actual file

describe('LRU Tracker', () => {
  // Create mock metadata records
  const now = new Date();
  const makeRecord = (modelId: string, sizeBytes: number, minutesAgo: number) => ({
    modelId,
    url: `https://example.com/${modelId}`,
    totalBytes: sizeBytes,
    chunkCount: Math.ceil(sizeBytes / (16 * 1024 * 1024)),
    chunkSize: 16 * 1024 * 1024,
    status: 'complete' as const,
    lastAccessed: new Date(now.getTime() - minutesAgo * 60_000),
    createdAt: new Date(now.getTime() - 3600_000),
  });

  describe('shouldEvict', () => {
    it('returns false when cache has room', async () => {
      // Import dynamically since file may not exist yet
      const { LRUTracker } = await import('../src/model-cache/lru-tracker.js');
      const tracker = new LRUTracker();

      const result = tracker.shouldEvict(
        500 * 1024 * 1024, // 500MB current
        100 * 1024 * 1024, // 100MB new model
        2 * 1024 * 1024 * 1024 // 2GB max
      );

      expect(result.shouldEvict).toBe(false);
    });

    it('returns true with correct bytesNeeded when over limit', async () => {
      const { LRUTracker } = await import('../src/model-cache/lru-tracker.js');
      const tracker = new LRUTracker();

      const maxSize = 1024 * 1024 * 1024; // 1GB
      const currentTotal = 900 * 1024 * 1024; // 900MB
      const newModelBytes = 200 * 1024 * 1024; // 200MB

      const result = tracker.shouldEvict(currentTotal, newModelBytes, maxSize);

      expect(result.shouldEvict).toBe(true);
      expect(result.bytesNeeded).toBe(currentTotal + newModelBytes - maxSize);
    });
  });

  describe('getEvictionCandidates', () => {
    it('returns models sorted by lastAccessed ascending', async () => {
      const { LRUTracker } = await import('../src/model-cache/lru-tracker.js');
      const tracker = new LRUTracker();

      const metadata = [
        makeRecord('recent', 100 * 1024 * 1024, 1),   // 1 min ago
        makeRecord('oldest', 100 * 1024 * 1024, 60),   // 60 min ago
        makeRecord('middle', 100 * 1024 * 1024, 30),   // 30 min ago
      ];

      const candidates = tracker.getEvictionCandidates(
        50 * 1024 * 1024, // need 50MB
        metadata,
        new Set()
      );

      expect(candidates[0].modelId).toBe('oldest');
    });

    it('excludes active model IDs', async () => {
      const { LRUTracker } = await import('../src/model-cache/lru-tracker.js');
      const tracker = new LRUTracker();

      const metadata = [
        makeRecord('model-a', 100 * 1024 * 1024, 60),
        makeRecord('model-b', 100 * 1024 * 1024, 30),
      ];

      const candidates = tracker.getEvictionCandidates(
        100 * 1024 * 1024,
        metadata,
        new Set(['model-a']) // model-a is active
      );

      expect(candidates.every((c) => c.modelId !== 'model-a')).toBe(true);
    });

    it('returns enough models to free needed bytes', async () => {
      const { LRUTracker } = await import('../src/model-cache/lru-tracker.js');
      const tracker = new LRUTracker();

      const metadata = [
        makeRecord('small1', 50 * 1024 * 1024, 60),
        makeRecord('small2', 50 * 1024 * 1024, 50),
        makeRecord('big', 200 * 1024 * 1024, 40),
        makeRecord('recent', 100 * 1024 * 1024, 1),
      ];

      const candidates = tracker.getEvictionCandidates(
        150 * 1024 * 1024, // need 150MB
        metadata,
        new Set()
      );

      const totalFreed = candidates.reduce((sum, c) => sum + c.sizeBytes, 0);
      expect(totalFreed).toBeGreaterThanOrEqual(150 * 1024 * 1024);
    });
  });
});
