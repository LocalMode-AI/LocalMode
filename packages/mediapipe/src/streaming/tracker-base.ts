/**
 * Streaming Tracker Base
 *
 * Shared `requestAnimationFrame` loop for real-time video trackers. Subclasses
 * supply the MediaPipe task loader and per-frame processing logic.
 *
 * @packageDocumentation
 */

import { ModelLoadError } from '@localmode/core';
import type { ClosableTask } from '../implementations/base.js';
import type { TrackerInstance } from './types.js';

/**
 * Abstract base for a real-time video tracker.
 *
 * Runs a `requestAnimationFrame` loop that processes each new video frame
 * through a MediaPipe task in VIDEO mode.
 */
export abstract class StreamingTracker<T extends ClosableTask> implements TrackerInstance {
  protected task: T | null = null;
  private rafId: number | null = null;
  private lastVideoTime = -1;
  private running = false;

  /**
   * @param video - Video element to read frames from
   * @param modelId - Model identifier used in error messages
   * @param onError - Optional per-frame error callback
   */
  constructor(
    protected readonly video: HTMLVideoElement,
    protected readonly modelId: string,
    private readonly onError?: (error: Error) => void
  ) {}

  /** Create the underlying MediaPipe task (VIDEO running mode). */
  protected abstract loadTask(): Promise<T>;

  /** Process a single video frame and invoke the results callback. */
  protected abstract processFrame(task: T, timestampMs: number): void;

  get isRunning(): boolean {
    return this.running;
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }
    if (!this.task) {
      try {
        this.task = await this.loadTask();
      } catch (error) {
        throw new ModelLoadError(
          this.modelId,
          error instanceof Error ? error : new Error(String(error))
        );
      }
    }
    this.running = true;
    this.loop();
  }

  private loop = (): void => {
    if (!this.running || !this.task) {
      return;
    }
    try {
      // Only process a frame when the video has advanced.
      if (
        this.video.readyState >= 2 &&
        this.video.currentTime !== this.lastVideoTime
      ) {
        this.lastVideoTime = this.video.currentTime;
        this.processFrame(this.task, performance.now());
      }
    } catch (error) {
      this.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
    this.rafId = requestAnimationFrame(this.loop);
  };

  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  async close(): Promise<void> {
    this.stop();
    if (this.task) {
      try {
        this.task.close();
      } catch {
        // Ignore cleanup errors
      }
      this.task = null;
    }
  }
}
