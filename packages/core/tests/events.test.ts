/**
 * @fileoverview Tests for event system
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createEventEmitter,
  EventEmitter,
  createVectorDB,
} from '../src/index.js';
import type { VectorDBEvents, EventCallback } from '../src/index.js';

describe('EventEmitter', () => {
  let emitter: EventEmitter<VectorDBEvents>;

  beforeEach(() => {
    emitter = createEventEmitter<VectorDBEvents>();
  });

  describe('on()', () => {
    it('registers event listener', () => {
      const callback = vi.fn();
      emitter.on('add', callback);

      emitter.emit('add', { id: 'doc1' });

      expect(callback).toHaveBeenCalledWith({ id: 'doc1' });
    });

    it('allows multiple listeners', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      emitter.on('add', callback1);
      emitter.on('add', callback2);

      emitter.emit('add', { id: 'doc1' });

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    it('returns unsubscribe function', () => {
      const callback = vi.fn();
      const unsubscribe = emitter.on('add', callback);

      expect(typeof unsubscribe).toBe('function');

      unsubscribe();

      emitter.emit('add', { id: 'doc1' });

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('once()', () => {
    it('fires only once', () => {
      const callback = vi.fn();
      emitter.once('add', callback);

      emitter.emit('add', { id: 'doc1' });
      emitter.emit('add', { id: 'doc2' });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({ id: 'doc1' });
    });

    it('returns unsubscribe function', () => {
      const callback = vi.fn();
      const unsubscribe = emitter.once('add', callback);

      unsubscribe();

      emitter.emit('add', { id: 'doc1' });

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('off()', () => {
    it('removes all listeners for an event', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      emitter.on('add', callback1);
      emitter.on('add', callback2);

      emitter.off('add'); // Removes all listeners for 'add' event

      emitter.emit('add', { id: 'doc1' });

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
    });

    it('removes all listeners when no event specified', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      emitter.on('add', callback1);
      emitter.on('delete', callback2);

      emitter.off(); // Removes all listeners

      emitter.emit('add', { id: 'doc1' });
      emitter.emit('delete', { id: 'doc1' });

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
    });
  });

  describe('emit()', () => {
    it('calls all listeners with data', () => {
      const callback = vi.fn();
      emitter.on('delete', callback);

      emitter.emit('delete', { ids: ['doc1', 'doc2'] });

      expect(callback).toHaveBeenCalledWith({ ids: ['doc1', 'doc2'] });
    });

    it('handles events with no listeners', () => {
      // Should not throw
      emitter.emit('add', { id: 'doc1' });
      expect(true).toBe(true);
    });

    it('catches listener errors', () => {
      const errorCallback = vi.fn(() => {
        throw new Error('Listener error');
      });
      const safeCallback = vi.fn();

      emitter.on('add', errorCallback);
      emitter.on('add', safeCallback);

      // Should not throw and should call other listeners
      emitter.emit('add', { id: 'doc1' });

      expect(safeCallback).toHaveBeenCalled();
    });
  });

  // removeAllListeners is now off() - covered above

  describe('listenerCount()', () => {
    it('returns 0 for no listeners', () => {
      expect(emitter.listenerCount('add')).toBe(0);
    });

    it('returns correct count', () => {
      emitter.on('add', () => {});
      emitter.on('add', () => {});
      emitter.on('delete', () => {});

      expect(emitter.listenerCount('add')).toBe(2);
      expect(emitter.listenerCount('delete')).toBe(1);
    });

    it('decrements when unsubscribing', () => {
      const unsubscribe = emitter.on('add', () => {});
      expect(emitter.listenerCount('add')).toBe(1);

      unsubscribe();
      expect(emitter.listenerCount('add')).toBe(0);
    });
  });
});

describe('VectorDB Events', () => {
  let db: Awaited<ReturnType<typeof createVectorDB>>;

  beforeEach(async () => {
    db = await createVectorDB({
      name: `test-events-${Date.now()}`,
      dimensions: 384,
      storage: 'memory', // Use memory storage for tests (IndexedDB not available in jsdom)
    });
  });

  afterEach(async () => {
    if (db) {
      await db.clear();
      await db.close();
    }
  });

  // VectorDB event tests - events are implemented via middleware
  describe.skip('VectorDB events via eventMiddleware', () => {
    // VectorDB does not have built-in event emission
    // Events are implemented using eventMiddleware() wrapper
    // See: wrapVectorDB({ db, middleware: eventMiddleware(emitter) })
  });
});

describe('Custom Event Types', () => {
  interface CustomEvents {
    custom: { data: string };
    another: { value: number };
  }

  it('supports custom event types', () => {
    const emitter = createEventEmitter<CustomEvents>();

    const callback = vi.fn();
    emitter.on('custom', callback);

    emitter.emit('custom', { data: 'test' });

    expect(callback).toHaveBeenCalledWith({ data: 'test' });
  });

  it('provides type safety', () => {
    const emitter = createEventEmitter<CustomEvents>();

    // This should type-check correctly
    emitter.on('custom', (event) => {
      expect(typeof event.data).toBe('string');
    });

    emitter.on('another', (event) => {
      expect(typeof event.value).toBe('number');
    });

    emitter.emit('custom', { data: 'hello' });
    emitter.emit('another', { value: 42 });
  });
});

