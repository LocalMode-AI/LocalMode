/**
 * @file bridge.test.ts
 * @description Tests for the DevTools bridge and circular buffer
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createCircularBuffer, createBridge, createEvent, resetEventIdCounter } from '../src/bridge.js';

describe('createCircularBuffer', () => {
  beforeEach(() => {
    resetEventIdCounter();
  });

  it('stores events up to max size', () => {
    const buffer = createCircularBuffer(3);
    buffer.push(createEvent('a', {}));
    buffer.push(createEvent('b', {}));
    buffer.push(createEvent('c', {}));

    expect(buffer.size).toBe(3);
    expect(buffer.getAll().map((e) => e.type)).toEqual(['a', 'b', 'c']);
  });

  it('evicts oldest when full', () => {
    const buffer = createCircularBuffer(2);
    buffer.push(createEvent('a', {}));
    buffer.push(createEvent('b', {}));
    buffer.push(createEvent('c', {}));

    expect(buffer.size).toBe(2);
    expect(buffer.getAll().map((e) => e.type)).toEqual(['b', 'c']);
  });

  it('clears all events', () => {
    const buffer = createCircularBuffer(10);
    buffer.push(createEvent('a', {}));
    buffer.push(createEvent('b', {}));
    buffer.clear();

    expect(buffer.size).toBe(0);
    expect(buffer.getAll()).toEqual([]);
  });
});

describe('createBridge', () => {
  beforeEach(() => {
    resetEventIdCounter();
    delete (globalThis as Record<string, unknown>).__LOCALMODE_DEVTOOLS__;
  });

  it('creates bridge with correct shape', () => {
    const { bridge } = createBridge(500);

    expect(bridge.version).toBe(1);
    expect(bridge.enabled).toBe(true);
    expect(bridge.events).toEqual([]);
    expect(bridge.queues).toEqual({});
    expect(bridge.pipelines).toEqual({});
    expect(bridge.storage).toBeNull();
    expect(bridge.capabilities).toBeNull();
    expect(bridge.models).toEqual({});
    expect(bridge.vectorDBs).toEqual({});
    expect(typeof bridge.subscribe).toBe('function');
  });

  it('notifies subscribers when notify is called', () => {
    const { bridge, notify } = createBridge(500);
    const callback = vi.fn();

    bridge.subscribe(callback);
    notify();

    expect(callback).toHaveBeenCalledOnce();
  });

  it('unsubscribes correctly', () => {
    const { bridge, notify } = createBridge(500);
    const callback = vi.fn();

    const unsub = bridge.subscribe(callback);
    unsub();
    notify();

    expect(callback).not.toHaveBeenCalled();
  });

  it('handles multiple subscribers', () => {
    const { bridge, notify } = createBridge(500);
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    bridge.subscribe(cb1);
    bridge.subscribe(cb2);
    notify();

    expect(cb1).toHaveBeenCalledOnce();
    expect(cb2).toHaveBeenCalledOnce();
  });

  it('silences subscriber errors', () => {
    const { bridge, notify } = createBridge(500);
    const bad = vi.fn(() => { throw new Error('boom'); });
    const good = vi.fn();

    bridge.subscribe(bad);
    bridge.subscribe(good);
    notify();

    expect(bad).toHaveBeenCalledOnce();
    expect(good).toHaveBeenCalledOnce();
  });
});

describe('createEvent', () => {
  beforeEach(() => {
    resetEventIdCounter();
  });

  it('creates event with monotonically increasing IDs', () => {
    const e1 = createEvent('a', {});
    const e2 = createEvent('b', {});

    expect(e2.id).toBeGreaterThan(e1.id);
  });

  it('includes timestamp and data', () => {
    const e = createEvent('vectordb:add', { id: 'doc-1' });

    expect(e.type).toBe('vectordb:add');
    expect(e.data).toEqual({ id: 'doc-1' });
    expect(e.timestamp).toBeDefined();
  });
});
