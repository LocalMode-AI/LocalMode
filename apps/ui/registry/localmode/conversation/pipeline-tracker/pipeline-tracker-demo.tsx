'use client';

/**
 * @file pipeline-tracker-demo.tsx
 * @description Docs preview for `MultiStepPipelineTracker`. Shows the numbered
 * step indicator, the stage+percentage variant, the Steps/Plan outline, and the
 * inference-queue surface — driven by a simulated progress loop.
 */
import * as React from 'react';
import {
  InferenceQueueSurface,
  MultiStepPipelineTracker,
  StagePipelineTracker,
  StepsPlan,
  type PlanStep,
  type QueuedTask,
} from './pipeline-tracker';

const STEPS = ['Load', 'Chunk', 'Embed', 'Index'];

const PLAN: PlanStep[] = [
  { id: 'a', title: 'Parse documents', status: 'completed', detail: 'Extracted text from 12 PDFs.' },
  { id: 'b', title: 'Embed chunks', status: 'active', detail: 'Running bge-small on 340 chunks.' },
  { id: 'c', title: 'Build index', status: 'pending' },
];

const QUEUE: QueuedTask[] = [
  { id: '1', label: 'Answer current question', priority: 'interactive' },
  { id: '2', label: 'Re-embed updated doc', priority: 'background' },
  { id: '3', label: 'Warm reranker model', priority: 'background' },
];

export default function PipelineTrackerDemo() {
  const [completed, setCompleted] = React.useState(0);
  const [percent, setPercent] = React.useState(0);

  React.useEffect(() => {
    const id = window.setInterval(() => {
      setCompleted((c) => (c >= STEPS.length ? 0 : c + 1));
      setPercent((p) => (p >= 100 ? 0 : p + 20));
    }, 1200);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="flex w-full max-w-xl flex-col gap-6">
      <MultiStepPipelineTracker
        steps={STEPS}
        completed={completed}
        currentStep={STEPS[completed]}
      />
      <StagePipelineTracker stage="Embedding chunks" percent={percent} />
      <StepsPlan steps={PLAN} />
      <InferenceQueueSurface tasks={QUEUE} />
    </div>
  );
}
