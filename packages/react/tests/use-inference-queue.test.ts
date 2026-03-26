/**
 * @fileoverview Tests for useInferenceQueue hook
 */

import { describe, it, expect, vi } from 'vitest';
import { createInferenceQueue } from '@localmode/core';

// Since useInferenceQueue wraps createInferenceQueue with React state,
// we test the core queue directly (React rendering tests need jsdom setup)
// and verify the hook's contract through the core queue.

describe('useInferenceQueue — core queue integration', () => {
  it('creates a queue with default config', () => {
    const queue = createInferenceQueue();
    expect(queue.stats.pending).toBe(0);
    expect(queue.stats.active).toBe(0);
    queue.destroy();
  });

  it('queue executes tasks and updates stats', async () => {
    const queue = createInferenceQueue({ concurrency: 1 });

    const result = await queue.add(async () => 'hello');
    expect(result).toBe('hello');
    expect(queue.stats.completed).toBe(1);

    queue.destroy();
  });

  it('queue destroy rejects pending tasks', async () => {
    const queue = createInferenceQueue({ concurrency: 1 });

    // Block the queue
    const blocker = queue.add(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const pending = queue.add(async () => 'never', { priority: 'background' });

    queue.destroy();

    await expect(pending).rejects.toThrow('Queue destroyed');
    await blocker;
  });

  it('stats event fires after task completion', async () => {
    const queue = createInferenceQueue();
    const fn = vi.fn();

    queue.on('stats', fn);
    await queue.add(async () => 42);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0].completed).toBe(1);

    queue.destroy();
  });
});
