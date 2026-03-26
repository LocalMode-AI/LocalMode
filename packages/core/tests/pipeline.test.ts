/**
 * @fileoverview Tests for the pipeline builder
 */

import { describe, it, expect, vi } from 'vitest';
import { createPipeline, PipelineError } from '../src/index.js';

describe('createPipeline()', () => {
  it('builds and runs a simple pipeline', async () => {
    const pipeline = createPipeline('test')
      .step('double', async (n: unknown) => (n as number) * 2)
      .step('addTen', async (n: unknown) => (n as number) + 10)
      .build<number, number>();

    const { result } = await pipeline.run(5);
    expect(result).toBe(20); // (5 * 2) + 10
  });

  it('returns pipeline metadata', () => {
    const pipeline = createPipeline('my-pipeline')
      .step('a', async (x: unknown) => x)
      .step('b', async (x: unknown) => x)
      .step('c', async (x: unknown) => x)
      .build();

    expect(pipeline.name).toBe('my-pipeline');
    expect(pipeline.stepCount).toBe(3);
    expect(pipeline.stepNames).toEqual(['a', 'b', 'c']);
  });

  it('tracks duration', async () => {
    const pipeline = createPipeline()
      .step('wait', async (x: unknown) => {
        await new Promise((r) => setTimeout(r, 10));
        return x;
      })
      .build();

    const { durationMs, stepsCompleted } = await pipeline.run('input');
    expect(durationMs).toBeGreaterThanOrEqual(5);
    expect(stepsCompleted).toBe(1);
  });
});

describe('Pipeline progress', () => {
  it('calls onProgress before each step and after completion', async () => {
    const progress: Array<{ completed: number; total: number; currentStep: string }> = [];

    const pipeline = createPipeline('test')
      .step('step1', async (x: unknown) => x)
      .step('step2', async (x: unknown) => x)
      .step('step3', async (x: unknown) => x)
      .build();

    await pipeline.run('input', {
      onProgress: (p) => progress.push({ ...p }),
    });

    expect(progress).toEqual([
      { completed: 0, total: 3, currentStep: 'step1' },
      { completed: 1, total: 3, currentStep: 'step2' },
      { completed: 2, total: 3, currentStep: 'step3' },
      { completed: 3, total: 3, currentStep: '' },
    ]);
  });
});

describe('Pipeline AbortSignal', () => {
  it('aborts before a step starts', async () => {
    const controller = new AbortController();
    controller.abort(); // Abort immediately

    const pipeline = createPipeline('test')
      .step('never', async () => {
        throw new Error('Should not execute');
      })
      .build();

    await expect(pipeline.run('input', { abortSignal: controller.signal }))
      .rejects.toThrow();
  });

  it('aborts between steps', async () => {
    const controller = new AbortController();
    const executed: string[] = [];

    const pipeline = createPipeline('test')
      .step('step1', async (x: unknown) => {
        executed.push('step1');
        controller.abort(); // Abort after step1
        return x;
      })
      .step('step2', async (x: unknown) => {
        executed.push('step2');
        return x;
      })
      .build();

    await expect(pipeline.run('input', { abortSignal: controller.signal }))
      .rejects.toThrow();

    expect(executed).toEqual(['step1']);
  });
});

describe('Pipeline error handling', () => {
  it('wraps step errors in PipelineError', async () => {
    const originalError = new Error('embed failed');

    const pipeline = createPipeline('test')
      .step('load', async (x: unknown) => x)
      .step('embed', async () => {
        throw originalError;
      })
      .build();

    try {
      await pipeline.run('input');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(PipelineError);
      const pipelineErr = err as PipelineError;
      expect(pipelineErr.context?.stepName).toBe('embed');
      expect(pipelineErr.context?.stepIndex).toBe(1);
      expect(pipelineErr.cause).toBe(originalError);
    }
  });

  it('does not wrap AbortError in PipelineError', async () => {
    const pipeline = createPipeline('test')
      .step('abort', async (_x: unknown, signal: AbortSignal) => {
        const abortError = new DOMException('Aborted', 'AbortError');
        throw abortError;
      })
      .build();

    await expect(pipeline.run('input')).rejects.toThrow('Aborted');
  });
});

describe('Pipeline addStep()', () => {
  it('accepts pre-built PipelineStep objects', async () => {
    const step = {
      name: 'uppercase',
      execute: async (input: unknown) => (input as string).toUpperCase(),
    };

    const pipeline = createPipeline('test')
      .addStep(step)
      .build<string, string>();

    const { result } = await pipeline.run('hello');
    expect(result).toBe('HELLO');
  });
});
