/**
 * Pipeline types for composable multi-step workflows.
 *
 * @packageDocumentation
 */

/**
 * A single step in a pipeline.
 *
 * @typeParam TIn - Input type for this step
 * @typeParam TOut - Output type for this step
 */
export interface PipelineStep<TIn = unknown, TOut = unknown> {
  /** Human-readable name for the step */
  name: string;

  /** Async function that processes input and returns output */
  execute: (input: TIn, signal: AbortSignal) => Promise<TOut>;
}

/**
 * Progress information for a running pipeline.
 */
export interface PipelineProgress {
  /** Number of steps completed */
  completed: number;

  /** Total number of steps */
  total: number;

  /** Name of the currently executing step */
  currentStep: string;
}

/**
 * Options for running a pipeline.
 */
export interface PipelineRunOptions {
  /** AbortSignal for cancelling the pipeline */
  abortSignal?: AbortSignal;

  /** Progress callback invoked before each step */
  onProgress?: (progress: PipelineProgress) => void;
}

/**
 * Result from a pipeline run.
 *
 * @typeParam TResult - The output type of the last step
 */
export interface PipelineResult<TResult> {
  /** The final result from the last step */
  result: TResult;

  /** Total time in milliseconds */
  durationMs: number;

  /** Number of steps executed */
  stepsCompleted: number;
}

/**
 * A built pipeline ready for execution.
 *
 * @typeParam TIn - Input type for the first step
 * @typeParam TOut - Output type of the last step
 */
export interface Pipeline<TIn = unknown, TOut = unknown> {
  /** Human-readable pipeline name */
  readonly name: string;

  /** Number of steps in the pipeline */
  readonly stepCount: number;

  /** Names of all steps in order */
  readonly stepNames: string[];

  /** Execute the pipeline with an initial input */
  run(input: TIn, options?: PipelineRunOptions): Promise<PipelineResult<TOut>>;
}

/**
 * Configuration for creating a pipeline.
 */
export interface PipelineConfig {
  /** Human-readable name for the pipeline */
  name?: string;
}
