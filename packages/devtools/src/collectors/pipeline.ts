/**
 * Pipeline collector — tracks pipeline execution progress.
 *
 * @packageDocumentation
 */

import type { DevToolsBridge, PipelineSnapshot } from '../types.js';

/**
 * Create a DevTools-aware onProgress callback for a pipeline.
 *
 * @param pipelineName - Display name for the pipeline
 * @param bridge - The DevTools bridge object
 * @param notify - Function to notify subscribers
 * @returns An onProgress callback compatible with PipelineRunOptions
 */
export function createPipelineCollector(
  pipelineName: string,
  bridge: DevToolsBridge,
  notify: () => void
): (progress: { completed: number; total: number; currentStep: string }) => void {
  const startedAt = new Date().toISOString();

  bridge.pipelines[pipelineName] = {
    currentStep: '',
    completed: 0,
    total: 0,
    status: 'running',
    startedAt,
  };

  const startTime = Date.now();

  return (progress) => {
    const snapshot: PipelineSnapshot = {
      currentStep: progress.currentStep,
      completed: progress.completed,
      total: progress.total,
      status: progress.completed >= progress.total && progress.total > 0 ? 'completed' : 'running',
      startedAt,
    };

    if (snapshot.status === 'completed') {
      snapshot.durationMs = Date.now() - startTime;
    }

    bridge.pipelines[pipelineName] = snapshot;
    notify();
  };
}
