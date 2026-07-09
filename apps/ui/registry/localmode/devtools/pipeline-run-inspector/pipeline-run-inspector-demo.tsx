'use client';

import {
  PipelineRunInspector,
  type PipelineRunLike,
} from './pipeline-run-inspector';

/**
 * Static fixture shaped like real `@localmode/devtools` pipeline snapshots:
 * a running run mid-embed with live step timings, a completed run with full
 * per-step durations, and a failed run (aggregate-only view — no `steps`).
 */
const FIXTURE_RUNS: Record<string, PipelineRunLike> = {
  'rag-ingest': {
    currentStep: 'embed',
    completed: 2,
    total: 4,
    status: 'running',
    startedAt: '2026-07-03T09:12:04.000Z',
    steps: [
      { name: 'load', durationMs: 84, status: 'completed' },
      { name: 'chunk', durationMs: 112, status: 'completed' },
      { name: 'embed', status: 'running' },
      { name: 'store', status: 'idle' },
    ],
  },
  'semantic-search': {
    currentStep: 'rerank',
    completed: 3,
    total: 3,
    status: 'completed',
    startedAt: '2026-07-03T09:11:40.000Z',
    durationMs: 1834,
    steps: [
      { name: 'embed', durationMs: 412, status: 'completed' },
      { name: 'search', durationMs: 96, status: 'completed' },
      { name: 'rerank', durationMs: 1326, status: 'completed' },
    ],
  },
  'batch-caption': {
    currentStep: 'caption',
    completed: 1,
    total: 3,
    status: 'failed',
    startedAt: '2026-07-03T09:10:12.000Z',
    durationMs: 3261,
  },
};

/**
 * Demo for PipelineRunInspector. Renders three fixture runs — one running
 * (primary pulse badge + current step), one completed (emerald badge +
 * duration), one failed (destructive badge) — with expandable per-step timing
 * rows where the fixture carries `steps`. No models, no network. Wire `runs`
 * to `useDevToolsPipelineRuns()` from `@localmode/devtools/react` in your app.
 */
export default function PipelineRunInspectorDemo() {
  return <PipelineRunInspector runs={FIXTURE_RUNS} />;
}
