/**
 * Tests for cross-tab synchronization features.
 */

import { describe, it, expect, vi } from 'vitest';
import { LockManager } from '../src/sync/locks';
import { Broadcaster } from '../src/sync/broadcast';

describe('LockManager', () => {
  it('should detect if Web Locks is supported', () => {
    // In jsdom, Web Locks is not available
    expect(LockManager.isSupported()).toBe(false);
  });

  it('should create a lock manager with a database name', () => {
    const manager = new LockManager('test-db');
    expect(manager).toBeInstanceOf(LockManager);
  });

  it('should execute callback without locking when Web Locks is not supported', async () => {
    const manager = new LockManager('test-db');
    const callback = vi.fn().mockResolvedValue('result');

    const result = await manager.withLock('resource', callback);

    expect(callback).toHaveBeenCalled();
    expect(result).toBe('result');
  });

  it('should execute read lock callback without Web Locks', async () => {
    const manager = new LockManager('test-db');
    const callback = vi.fn().mockResolvedValue('read-result');

    const result = await manager.withReadLock('resource', callback);

    expect(callback).toHaveBeenCalled();
    expect(result).toBe('read-result');
  });

  it('should execute write lock callback without Web Locks', async () => {
    const manager = new LockManager('test-db');
    const callback = vi.fn().mockResolvedValue('write-result');

    const result = await manager.withWriteLock('resource', callback);

    expect(callback).toHaveBeenCalled();
    expect(result).toBe('write-result');
  });

  it('should try lock and execute callback without Web Locks', async () => {
    const manager = new LockManager('test-db');
    const callback = vi.fn().mockResolvedValue('try-result');

    const result = await manager.tryLock('resource', callback);

    expect(callback).toHaveBeenCalled();
    expect(result).toBe('try-result');
  });

  it('should return empty lock state when Web Locks is not supported', async () => {
    const manager = new LockManager('test-db');
    const state = await manager.getLockState();

    expect(state).toEqual({ held: [], pending: [] });
  });
});

describe('Broadcaster', () => {
  it('should detect if BroadcastChannel is supported', () => {
    // BroadcastChannel is available in jsdom
    const isSupported = Broadcaster.isSupported();
    expect(typeof isSupported).toBe('boolean');
  });

  it('should create a broadcaster with a database name', () => {
    const broadcaster = new Broadcaster('test-db');
    expect(broadcaster).toBeInstanceOf(Broadcaster);
    expect(broadcaster.getTabId()).toBeTruthy();
    broadcaster.close();
  });

  it('should have a unique tab ID', () => {
    const broadcaster1 = new Broadcaster('test-db');
    const broadcaster2 = new Broadcaster('test-db');

    expect(broadcaster1.getTabId()).not.toBe(broadcaster2.getTabId());

    broadcaster1.close();
    broadcaster2.close();
  });

  it('should start as non-leader', () => {
    const broadcaster = new Broadcaster('test-db');
    expect(broadcaster.getIsLeader()).toBe(false);
    broadcaster.close();
  });

  it('should allow subscribing to message types', () => {
    const broadcaster = new Broadcaster('test-db');
    const listener = vi.fn();

    const unsubscribe = broadcaster.on('document_added', listener);

    expect(typeof unsubscribe).toBe('function');

    unsubscribe();
    broadcaster.close();
  });

  it('should allow subscribing to all messages', () => {
    const broadcaster = new Broadcaster('test-db');
    const listener = vi.fn();

    const unsubscribe = broadcaster.onAny(listener);

    expect(typeof unsubscribe).toBe('function');

    unsubscribe();
    broadcaster.close();
  });

  it('should close cleanly', () => {
    const broadcaster = new Broadcaster('test-db');
    expect(() => broadcaster.close()).not.toThrow();
  });

  it('should resign leadership on close', async () => {
    const broadcaster = new Broadcaster('test-db');
    await broadcaster.electLeader();

    broadcaster.close();

    expect(broadcaster.getIsLeader()).toBe(false);
  });
});
