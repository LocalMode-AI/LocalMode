'use client';

/**
 * @file task-demo.tsx
 * @description Docs preview for `Task`. Renders a small ReAct-style step list
 * shaped like `useAgent().steps`, ending in a distinguished final answer.
 */
import { Task, TaskItem, type TaskStep } from './task';

const STEPS: TaskStep[] = [
  {
    index: 0,
    type: 'tool_call',
    toolName: 'search_documents',
    toolArgs: { query: 'pricing' },
    observation: 'Found 3 matching passages.',
    status: 'completed',
  },
  {
    index: 1,
    type: 'tool_call',
    toolName: 'summarize',
    toolArgs: { topK: 3 },
    observation: 'Synthesized an answer from the top passages.',
    status: 'running',
  },
  {
    index: 2,
    type: 'finish',
    result: 'The pro plan is $20/mo and includes priority support.',
  },
];

export default function TaskDemo() {
  return (
    <div className="w-full max-w-xl">
      <Task>
        {STEPS.map((s) => (
          <TaskItem key={s.index} step={s} />
        ))}
      </Task>
    </div>
  );
}
