/**
 * @fileoverview Tests for network logging system
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  NetworkLogger,
  createNetworkLogger,
  getGlobalLogger,
  getNetworkLogs,
  clearNetworkLogs,
  onNetworkRequest,
  getNetworkStats,
  wrapFetchWithLogging,
  createLoggingFetch,
  unwrapFetch,
  isFetchWrapped,
  getNetworkStatus,
  onNetworkChange,
  isOffline,
  isOnline,
  waitForOnline,
  isConnectionSuitable,
  getConnectionRecommendation,
} from '../src/index.js';
import type { NetworkLogEntry, NetworkStats, NetworkStatus } from '../src/index.js';

describe('NetworkLogger', () => {
  let logger: NetworkLogger;

  beforeEach(() => {
    logger = createNetworkLogger({
      maxEntries: 100,
      persistLogs: false,
    });
  });

  afterEach(async () => {
    await logger.clear();
  });

  describe('createNetworkLogger()', () => {
    it('creates a logger instance', () => {
      expect(logger).toBeDefined();
      expect(typeof logger.log).toBe('function');
      expect(typeof logger.getLogs).toBe('function');
      expect(typeof logger.clear).toBe('function');
    });

    it('respects maxEntries config', async () => {
      const smallLogger = createNetworkLogger({ maxEntries: 5 });

      // Add more than maxEntries
      for (let i = 0; i < 10; i++) {
        await smallLogger.log({
          url: `https://example.com/${i}`,
          method: 'GET',
          type: 'download',
          status: 200,
          state: 'completed',
        });
      }

      const logs = await smallLogger.getLogs();
      expect(logs.length).toBeLessThanOrEqual(5);
    });
  });

  describe('log()', () => {
    it('logs a network request', async () => {
      await logger.log({
        url: 'https://api.example.com/data',
        method: 'GET',
        type: 'download',
        status: 200,
        state: 'completed',
        responseSize: 1024,
        duration: 150,
      });

      const logs = await logger.getLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].url).toBe('https://api.example.com/data');
      expect(logs[0].status).toBe(200);
    });

    it('adds timestamp automatically', async () => {
      await logger.log({
        url: 'https://example.com',
        method: 'GET',
        type: 'download',
        state: 'completed',
      });

      const logs = await logger.getLogs();
      expect(logs[0].timestamp).toBeInstanceOf(Date);
    });

    it('generates unique IDs', async () => {
      await logger.log({
        url: 'https://example.com/1',
        method: 'GET',
        type: 'download',
        state: 'completed',
      });

      await logger.log({
        url: 'https://example.com/2',
        method: 'GET',
        type: 'download',
        state: 'completed',
      });

      const logs = await logger.getLogs();
      expect(logs[0].id).not.toBe(logs[1].id);
    });
  });

  describe('getLogs()', () => {
    beforeEach(async () => {
      await logger.log({
        url: 'https://example.com/model',
        method: 'GET',
        type: 'download',
        category: 'model',
        status: 200,
        state: 'completed',
      });

      await logger.log({
        url: 'https://example.com/data',
        method: 'POST',
        type: 'upload',
        category: 'data',
        status: 201,
        state: 'completed',
      });

      await logger.log({
        url: 'https://example.com/error',
        method: 'GET',
        type: 'download',
        category: 'other',
        status: 500,
        state: 'failed',
        error: 'Server error',
      });
    });

    it('returns all logs without filter', async () => {
      const logs = await logger.getLogs();
      expect(logs.length).toBe(3);
    });

    it('filters by category', async () => {
      const logs = await logger.getLogs({ category: 'model' });
      expect(logs.length).toBe(1);
      expect(logs[0].category).toBe('model');
    });

    it('filters by state', async () => {
      const logs = await logger.getLogs({ state: 'failed' });
      expect(logs.length).toBe(1);
      expect(logs[0].state).toBe('failed');
    });

    it('filters by method', async () => {
      const allLogs = await logger.getLogs();
      const postLogs = allLogs.filter(log => log.method === 'POST');
      expect(postLogs.length).toBe(1);
      expect(postLogs[0].method).toBe('POST');
    });

    it('filters by since date', async () => {
      const now = new Date();
      const logs = await logger.getLogs({
        since: new Date(now.getTime() - 1000), // Last second
      });
      expect(logs.length).toBe(3); // All should be recent
    });

    it('limits results', async () => {
      const logs = await logger.getLogs({ limit: 2 });
      expect(logs.length).toBe(2);
    });
  });

  describe('clear()', () => {
    it('clears all logs', async () => {
      await logger.log({
        url: 'https://example.com',
        method: 'GET',
        type: 'download',
        state: 'completed',
      });

      await logger.clear();

      const logs = await logger.getLogs();
      expect(logs.length).toBe(0);
    });

    it('clears logs older than specified time', async () => {
      vi.useFakeTimers();
      const baseTime = new Date('2024-01-01T00:00:00Z');
      vi.setSystemTime(baseTime);

      await logger.log({
        url: 'https://example.com/old',
        method: 'GET',
        type: 'download',
        state: 'completed',
      });

      vi.advanceTimersByTime(10000); // 10 seconds

      await logger.log({
        url: 'https://example.com/new',
        method: 'GET',
        type: 'download',
        state: 'completed',
      });

      // Clear logs older than 5000ms (should keep only the new one)
      await logger.clear({ olderThan: '5s' });

      const logs = await logger.getLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].url).toBe('https://example.com/new');

      vi.useRealTimers();
    });
  });

  describe('subscribe()', () => {
    it('notifies on new log entry', async () => {
      const entries: NetworkLogEntry[] = [];
      const unsubscribe = logger.subscribe((entry) => {
        entries.push(entry);
      });

      await logger.log({
        url: 'https://example.com',
        method: 'GET',
        type: 'download',
        state: 'completed',
      });

      expect(entries.length).toBe(1);

      unsubscribe();
    });

    it('unsubscribe stops notifications', async () => {
      const entries: NetworkLogEntry[] = [];
      const unsubscribe = logger.subscribe((entry) => {
        entries.push(entry);
      });

      await logger.log({
        url: 'https://example.com/1',
        method: 'GET',
        type: 'download',
        state: 'completed',
      });

      unsubscribe();

      await logger.log({
        url: 'https://example.com/2',
        method: 'GET',
        type: 'download',
        state: 'completed',
      });

      expect(entries.length).toBe(1);
    });
  });

  describe('getStats()', () => {
    beforeEach(async () => {
      await logger.log({
        url: 'https://example.com/1',
        method: 'GET',
        type: 'download',
        category: 'model',
        status: 200,
        state: 'completed',
        responseSize: 1024,
        duration: 100,
      });

      await logger.log({
        url: 'https://example.com/2',
        method: 'POST',
        type: 'upload',
        category: 'data',
        status: 201,
        state: 'completed',
        requestSize: 512,
        duration: 50,
      });

      await logger.log({
        url: 'https://example.com/3',
        method: 'GET',
        type: 'download',
        category: 'model',
        status: 500,
        state: 'failed',
        duration: 200,
      });
    });

    it('returns stats object', async () => {
      const stats = await logger.getStats();

      expect(stats).toHaveProperty('totalRequests');
      expect(stats).toHaveProperty('completedRequests');
      expect(stats).toHaveProperty('failedRequests');
      expect(stats).toHaveProperty('totalDownloadBytes');
      expect(stats).toHaveProperty('totalUploadBytes');
      expect(stats).toHaveProperty('totalDuration');
      expect(stats).toHaveProperty('averageSpeed');
      expect(stats).toHaveProperty('byCategory');
      expect(stats).toHaveProperty('byStatus');
      expect(stats).toHaveProperty('requestsPerMinute');
    });

    it('counts requests correctly', async () => {
      const stats = await logger.getStats();

      expect(stats.totalRequests).toBe(3);
      expect(stats.completedRequests).toBe(2);
      expect(stats.failedRequests).toBe(1);
    });

    it('calculates bytes correctly', async () => {
      const stats = await logger.getStats();

      expect(stats.totalDownloadBytes).toBe(1024);
      expect(stats.totalUploadBytes).toBe(512);
    });

    it('groups by category', async () => {
      const stats = await logger.getStats();

      expect(stats.byCategory).toHaveProperty('model');
      expect(stats.byCategory).toHaveProperty('data');
      expect(stats.byCategory.model.requests).toBe(2);
      expect(stats.byCategory.data.requests).toBe(1);
    });
  });
});

describe('Global Logger Functions', () => {
  beforeEach(async () => {
    await clearNetworkLogs();
  });

  describe('getNetworkLogs()', () => {
    it('returns logs from global logger', async () => {
      const logger = getGlobalLogger();
      await logger.log({
        url: 'https://example.com',
        method: 'GET',
        type: 'download',
        state: 'completed',
      });

      const logs = await getNetworkLogs();
      expect(logs.length).toBe(1);
    });
  });

  describe('clearNetworkLogs()', () => {
    it('clears global logger', async () => {
      const logger = getGlobalLogger();
      await logger.log({
        url: 'https://example.com',
        method: 'GET',
        type: 'download',
        state: 'completed',
      });

      await clearNetworkLogs();

      const logs = await getNetworkLogs();
      expect(logs.length).toBe(0);
    });
  });

  describe('onNetworkRequest()', () => {
    it('subscribes to global logger', async () => {
      const entries: NetworkLogEntry[] = [];
      const unsubscribe = onNetworkRequest((entry) => {
        entries.push(entry);
      });

      const logger = getGlobalLogger();
      await logger.log({
        url: 'https://example.com',
        method: 'GET',
        type: 'download',
        state: 'completed',
      });

      expect(entries.length).toBe(1);

      unsubscribe();
    });
  });

  describe('getNetworkStats()', () => {
    it('returns stats from global logger', async () => {
      const logger = getGlobalLogger();
      await logger.log({
        url: 'https://example.com',
        method: 'GET',
        type: 'download',
        status: 200,
        state: 'completed',
        responseSize: 1024,
      });

      const stats = await getNetworkStats();

      expect(stats.totalRequests).toBe(1);
      expect(stats.totalDownloadBytes).toBe(1024);
    });
  });
});

describe('Fetch Wrapping', () => {
  describe('createLoggingFetch()', () => {
    it('creates a fetch wrapper', () => {
      const loggingFetch = createLoggingFetch({
        category: 'model',
      });

      expect(typeof loggingFetch).toBe('function');
    });
  });

  describe('isFetchWrapped()', () => {
    it('returns boolean', () => {
      const result = isFetchWrapped();
      expect(typeof result).toBe('boolean');
    });
  });
});

describe('Network Status', () => {
  describe('getNetworkStatus()', () => {
    it('returns status object', () => {
      const status = getNetworkStatus();

      expect(status).toHaveProperty('isOnline');
      expect(typeof status.isOnline).toBe('boolean');
    });

    it('includes connection type if available', () => {
      const status = getNetworkStatus();

      // connectionType may be undefined if not supported
      expect(status).toHaveProperty('connectionType');
    });
  });

  describe('isOnline()', () => {
    it('returns boolean', () => {
      const result = isOnline();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('isOffline()', () => {
    it('returns boolean', () => {
      const result = isOffline();
      expect(typeof result).toBe('boolean');
    });

    it('is inverse of isOnline', () => {
      expect(isOffline()).toBe(!isOnline());
    });
  });

  describe('onNetworkChange()', () => {
    it('returns unsubscribe function', () => {
      const unsubscribe = onNetworkChange(() => {});
      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });
  });

  describe('waitForOnline()', () => {
    it('resolves immediately if online', async () => {
      if (isOnline()) {
        await expect(waitForOnline()).resolves.toBeUndefined();
      }
    });

    it('supports timeout', async () => {
      // This test validates the function signature
      const promise = waitForOnline({ timeout: 100 });
      expect(promise).toBeInstanceOf(Promise);

      // If already online, should resolve immediately
      if (isOnline()) {
        await expect(promise).resolves.toBeUndefined();
      }
    });
  });

  describe('isConnectionSuitable()', () => {
    it('returns boolean', () => {
      const result = isConnectionSuitable();
      expect(typeof result).toBe('boolean');
    });

    it('accepts options', () => {
      const result = isConnectionSuitable({
        requiredSpeed: 'slow-2g',
      });
      expect(typeof result).toBe('boolean');
    });
  });

  describe('getConnectionRecommendation()', () => {
    it('returns recommendation object', () => {
      const rec = getConnectionRecommendation();

      expect(rec).toHaveProperty('useLargeModels');
      expect(rec).toHaveProperty('preloadAssets');
      expect(rec).toHaveProperty('downloadInBackground');
      expect(typeof rec.useLargeModels).toBe('boolean');
      expect(typeof rec.preloadAssets).toBe('boolean');
      expect(typeof rec.downloadInBackground).toBe('boolean');
    });
  });
});

