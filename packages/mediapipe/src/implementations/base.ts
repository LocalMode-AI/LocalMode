/**
 * Lazy MediaPipe Task Loader
 *
 * Shared lazy-initialization helper for MediaPipe task instances. Tasks are
 * created on first use, concurrent initialization is deduplicated, and load
 * failures are wrapped in `ModelLoadError`.
 *
 * @packageDocumentation
 */

import { ModelLoadError } from '@localmode/core';

/** A MediaPipe task instance with a `close()` cleanup method. */
export interface ClosableTask {
  close(): void;
}

/**
 * Lazily loads and caches a MediaPipe task instance.
 *
 * The task is created on the first `get()` call. Concurrent `get()` calls
 * before the load resolves share a single load. Load failures are wrapped in
 * `ModelLoadError` and reset so a later call can retry.
 */
export class LazyMediaPipeTask<T extends ClosableTask> {
  private task: T | null = null;
  private loadPromise: Promise<T> | null = null;

  /**
   * @param loader - Async factory that creates the underlying MediaPipe task
   * @param modelId - Model identifier used in error messages
   */
  constructor(
    private readonly loader: () => Promise<T>,
    private readonly modelId: string
  ) {}

  /** Whether the task has finished loading. */
  get isLoaded(): boolean {
    return this.task !== null;
  }

  /**
   * Get the loaded task, initializing it on first call.
   *
   * @throws {ModelLoadError} If task initialization fails
   */
  async get(): Promise<T> {
    if (this.task) {
      return this.task;
    }
    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = (async () => {
      try {
        const task = await this.loader();
        this.task = task;
        return task;
      } catch (error) {
        this.loadPromise = null;
        throw new ModelLoadError(
          this.modelId,
          error instanceof Error ? error : new Error(String(error))
        );
      }
    })();

    return this.loadPromise;
  }

  /** Dispose the underlying task and free WASM resources. */
  close(): void {
    if (this.task) {
      try {
        this.task.close();
      } catch {
        // Ignore cleanup errors
      }
      this.task = null;
      this.loadPromise = null;
    }
  }
}
