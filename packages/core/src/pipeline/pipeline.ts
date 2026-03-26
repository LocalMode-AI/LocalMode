/**
 * Composable pipeline builder for multi-step workflows.
 *
 * @packageDocumentation
 */

import type {
  PipelineStep,
  Pipeline,
  PipelineRunOptions,
  PipelineResult,
  PipelineProgress,
} from './types.js';
import { PipelineError } from '../errors/index.js';

/**
 * Internal pipeline builder that accumulates steps.
 */
class PipelineBuilder {
  private steps: PipelineStep[] = [];
  private pipelineName: string;

  constructor(name: string) {
    this.pipelineName = name;
  }

  /**
   * Add a step to the pipeline.
   *
   * @param name - Human-readable step name
   * @param execute - Async function that processes input
   * @returns The builder for chaining
   */
  step<TIn, TOut>(
    name: string,
    execute: (input: TIn, signal: AbortSignal) => Promise<TOut>
  ): PipelineBuilder {
    this.steps.push({ name, execute: execute as PipelineStep['execute'] });
    return this;
  }

  /**
   * Add a pre-built PipelineStep to the pipeline.
   *
   * @param pipelineStep - A PipelineStep object with name and execute
   * @returns The builder for chaining
   */
  addStep(pipelineStep: PipelineStep): PipelineBuilder {
    this.steps.push(pipelineStep);
    return this;
  }

  /**
   * Build the pipeline and return a Pipeline object ready for execution.
   */
  build<TIn = unknown, TOut = unknown>(): Pipeline<TIn, TOut> {
    const steps = [...this.steps];
    const name = this.pipelineName;

    return {
      name,
      stepCount: steps.length,
      stepNames: steps.map((s) => s.name),

      async run(input: TIn, options?: PipelineRunOptions): Promise<PipelineResult<TOut>> {
        const startTime = Date.now();
        const signal = options?.abortSignal;
        const onProgress = options?.onProgress;
        const totalSteps = steps.length;

        let currentInput: unknown = input;

        for (let i = 0; i < totalSteps; i++) {
          signal?.throwIfAborted();

          const step = steps[i];
          const progress: PipelineProgress = {
            completed: i,
            total: totalSteps,
            currentStep: step.name,
          };
          onProgress?.(progress);

          try {
            currentInput = await step.execute(
              currentInput,
              signal ?? new AbortController().signal
            );
          } catch (err) {
            // Re-throw AbortError without wrapping
            if (
              err instanceof Error && err.name === 'AbortError' ||
              (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError')
            ) {
              throw err;
            }
            throw new PipelineError(
              `Pipeline "${name}" failed at step "${step.name}" (${i + 1}/${totalSteps})`,
              {
                stepName: step.name,
                stepIndex: i,
                cause: err instanceof Error ? err : new Error(String(err)),
              }
            );
          }
        }

        // Final progress
        onProgress?.({
          completed: totalSteps,
          total: totalSteps,
          currentStep: '',
        });

        return {
          result: currentInput as TOut,
          durationMs: Date.now() - startTime,
          stepsCompleted: totalSteps,
        };
      },
    };
  }
}

/**
 * Create a composable multi-step pipeline.
 *
 * @param name - Human-readable pipeline name (default: 'pipeline')
 * @returns A pipeline builder with `.step()` and `.build()` methods
 *
 * @example
 * ```ts
 * import { createPipeline } from '@localmode/core';
 *
 * const pipeline = createPipeline('embed-search')
 *   .step('embed', async (text: string, signal) => {
 *     return embed({ model, value: text, abortSignal: signal });
 *   })
 *   .step('search', async (embedResult, signal) => {
 *     signal.throwIfAborted();
 *     return db.search(embedResult.embedding, { k: 10 });
 *   })
 *   .build();
 *
 * const { result } = await pipeline.run('query text', {
 *   onProgress: (p) => console.log(`Step ${p.completed}/${p.total}: ${p.currentStep}`),
 * });
 * ```
 */
export function createPipeline(name = 'pipeline'): PipelineBuilder {
  return new PipelineBuilder(name);
}
