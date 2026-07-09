'use client';

import { InferenceQueueMonitor } from './inference-queue-monitor';

/**
 * Demo for InferenceQueueMonitor. Renders three fixture queues — an embedding
 * queue mid-burst (pending + active accents), an interactive chat queue with
 * one live task, and a background indexing queue carrying failures
 * (destructive accent). Wire `queues` to `useDevToolsQueueStats()` from
 * `@localmode/devtools/react` in your app.
 */
export default function InferenceQueueMonitorDemo() {
  return (
    <InferenceQueueMonitor
      queues={{
        embeddings: {
          pending: 12,
          active: 2,
          completed: 148,
          failed: 0,
          avgLatencyMs: 42,
        },
        'chat-interactive': {
          pending: 0,
          active: 1,
          completed: 23,
          failed: 0,
          avgLatencyMs: 1840,
        },
        'background-index': {
          pending: 4,
          active: 0,
          completed: 512,
          failed: 3,
          avgLatencyMs: 310,
        },
      }}
    />
  );
}
