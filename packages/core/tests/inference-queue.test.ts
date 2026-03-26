/**
 * @fileoverview Tests for the inference queue
 */

import { describe, it, expect, vi } from 'vitest';
import { createInferenceQueue } from '../src/index.js';

describe('createInferenceQueue()', () => {
  it('creates queue with default config', () => {
    const queue = createInferenceQueue();
    expect(queue.stats.pending).toBe(0);
    expect(queue.stats.active).toBe(0);
    expect(queue.stats.completed).toBe(0);
    queue.destroy();
  });

  it('executes a single task and returns result', async () => {
    const queue = createInferenceQueue();
    const result = await queue.add(async () => 42);
    expect(result).toBe(42);
    expect(queue.stats.completed).toBe(1);
    queue.destroy();
  });

  it('executes tasks sequentially with concurrency 1', async () => {
    const queue = createInferenceQueue({ concurrency: 1 });
    const order: number[] = [];

    const p1 = queue.add(async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push(1);
      return 1;
    });
    const p2 = queue.add(async () => {
      order.push(2);
      return 2;
    });

    await Promise.all([p1, p2]);
    expect(order).toEqual([1, 2]);
    queue.destroy();
  });
});

describe('Queue priority ordering', () => {
  it('interactive tasks execute before background tasks', async () => {
    const queue = createInferenceQueue({ concurrency: 1 });
    const order: string[] = [];

    // Block the queue with a slow task
    const blocker = queue.add(async () => {
      await new Promise((r) => setTimeout(r, 30));
      order.push('blocker');
    }, { priority: 'interactive' });

    // Queue background then interactive — interactive should run first
    const bg = queue.add(async () => {
      order.push('background');
    }, { priority: 'background' });

    const interactive = queue.add(async () => {
      order.push('interactive');
    }, { priority: 'interactive' });

    await Promise.all([blocker, interactive, bg]);
    expect(order).toEqual(['blocker', 'interactive', 'background']);
    queue.destroy();
  });

  it('FIFO within same priority level', async () => {
    const queue = createInferenceQueue({ concurrency: 1 });
    const order: number[] = [];

    // Block the queue
    const blocker = queue.add(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    const p1 = queue.add(async () => { order.push(1); }, { priority: 'background' });
    const p2 = queue.add(async () => { order.push(2); }, { priority: 'background' });
    const p3 = queue.add(async () => { order.push(3); }, { priority: 'background' });

    await Promise.all([blocker, p1, p2, p3]);
    expect(order).toEqual([1, 2, 3]);
    queue.destroy();
  });
});

describe('Queue AbortSignal', () => {
  it('rejects task when signal is already aborted', async () => {
    const queue = createInferenceQueue();
    const controller = new AbortController();
    controller.abort();

    await expect(
      queue.add(async () => 'never', { abortSignal: controller.signal })
    ).rejects.toThrow();
    queue.destroy();
  });

  it('rejects task when signal is aborted while queued', async () => {
    const queue = createInferenceQueue({ concurrency: 1 });
    const controller = new AbortController();

    // Block the queue
    const blocker = queue.add(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Queue a task then abort it before it runs
    const task = queue.add(async () => 'never', {
      priority: 'background',
      abortSignal: controller.signal,
    });

    // Abort while still queued
    controller.abort();

    await expect(task).rejects.toThrow();
    await blocker;
    queue.destroy();
  });
});

describe('Queue stats events', () => {
  it('emits stats after task completion', async () => {
    const queue = createInferenceQueue();
    const statsHistory: Array<{ completed: number }> = [];

    queue.on('stats', (stats) => {
      statsHistory.push({ completed: stats.completed });
    });

    await queue.add(async () => 1);
    await queue.add(async () => 2);

    expect(statsHistory.length).toBe(2);
    expect(statsHistory[0].completed).toBe(1);
    expect(statsHistory[1].completed).toBe(2);
    queue.destroy();
  });

  it('tracks failed tasks in stats', async () => {
    const queue = createInferenceQueue();
    const statsHistory: Array<{ failed: number }> = [];

    queue.on('stats', (stats) => {
      statsHistory.push({ failed: stats.failed });
    });

    try {
      await queue.add(async () => { throw new Error('fail'); });
    } catch { /* expected */ }

    expect(statsHistory.length).toBe(1);
    expect(statsHistory[0].failed).toBe(1);
    queue.destroy();
  });

  it('tracks average latency', async () => {
    const queue = createInferenceQueue();

    await queue.add(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(queue.stats.avgLatencyMs).toBeGreaterThanOrEqual(5);
    queue.destroy();
  });

  it('unsubscribes from events', async () => {
    const queue = createInferenceQueue();
    const fn = vi.fn();

    const unsub = queue.on('stats', fn);
    await queue.add(async () => 1);
    expect(fn).toHaveBeenCalledTimes(1);

    unsub();
    await queue.add(async () => 2);
    expect(fn).toHaveBeenCalledTimes(1); // No additional call
    queue.destroy();
  });
});

describe('Queue clear and destroy', () => {
  it('clear() removes pending tasks without rejecting', async () => {
    const queue = createInferenceQueue({ concurrency: 1 });

    // Block the queue
    const blocker = queue.add(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return 'done';
    });

    // Queue tasks that will be cleared
    // We don't await these since they'll never resolve after clear
    let pendingResolved = false;
    queue.add(async () => { pendingResolved = true; }, { priority: 'background' })
      .catch(() => {}); // Ignore rejection

    queue.clear();
    expect(queue.stats.pending).toBe(0);

    await blocker;
    // Give a tick for any pending tasks to run
    await new Promise((r) => setTimeout(r, 10));
    expect(pendingResolved).toBe(false);
    queue.destroy();
  });

  it('destroy() rejects pending tasks', async () => {
    const queue = createInferenceQueue({ concurrency: 1 });

    // Block the queue
    const blocker = queue.add(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Queue a task
    const pending = queue.add(async () => 'never', { priority: 'background' });

    queue.destroy();

    await expect(pending).rejects.toThrow('Queue destroyed');
    await blocker;
  });

  it('add() rejects after destroy', async () => {
    const queue = createInferenceQueue();
    queue.destroy();

    await expect(queue.add(async () => 'never')).rejects.toThrow('destroyed');
  });
});

describe('Queue custom priorities', () => {
  it('supports custom priority levels', async () => {
    const queue = createInferenceQueue({
      concurrency: 1,
      priorities: ['urgent', 'normal', 'idle'],
    });

    const order: string[] = [];

    const blocker = queue.add(async () => {
      await new Promise((r) => setTimeout(r, 20));
    }, { priority: 'normal' });

    queue.add(async () => { order.push('idle'); }, { priority: 'idle' });
    queue.add(async () => { order.push('urgent'); }, { priority: 'urgent' });
    queue.add(async () => { order.push('normal'); }, { priority: 'normal' });

    await blocker;
    await new Promise((r) => setTimeout(r, 50));

    expect(order).toEqual(['urgent', 'normal', 'idle']);
    queue.destroy();
  });

  it('rejects unknown priority', async () => {
    const queue = createInferenceQueue();

    await expect(
      queue.add(async () => 1, { priority: 'nonexistent' })
    ).rejects.toThrow('Unknown priority');
    queue.destroy();
  });
});
