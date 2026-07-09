'use client';

/**
 * @file agent-step-timeline-demo.tsx
 * @description Docs preview for `AgentStepTimeline`. Renders a finished ReAct run
 * (shaped like `useAgent().steps`) with a tool color map, a nested sub-agent
 * handoff, durations, and a distinguished final answer.
 */
import {
  AgentStepTimeline,
  type AgentStep,
  type ToolColorMap,
} from './agent-step-timeline';

const TOOL_COLORS: ToolColorMap = {
  search_documents: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  calculator: 'bg-purple-500/15 text-purple-600 dark:text-purple-400',
};

const STEPS: AgentStep[] = [
  {
    index: 0,
    type: 'tool_call',
    toolName: 'search_documents',
    toolArgs: { query: 'quarterly revenue', topK: 5 },
    observation:
      'Retrieved 5 passages. The strongest match reports Q3 revenue of $4.2M, up 18% YoY, driven by enterprise seat expansion and lower churn across the SMB segment.',
    durationMs: 740,
  },
  {
    index: 1,
    type: 'tool_call',
    toolName: 'calculator',
    toolArgs: { expression: '4.2 * 1.18' },
    observation: 'Computed projected next-quarter figure.',
    durationMs: 12,
    subSteps: [
      {
        index: 0,
        type: 'tool_call',
        toolName: 'search_documents',
        toolArgs: { query: 'guidance' },
        observation: 'Sub-agent fetched guidance notes.',
        durationMs: 210,
      },
    ],
  },
  {
    index: 2,
    type: 'finish',
    result: 'Q3 revenue was $4.2M (+18% YoY); next-quarter projection ≈ $4.96M.',
  },
];

export default function AgentStepTimelineDemo() {
  return (
    <div className="w-full max-w-xl">
      <AgentStepTimeline
        steps={STEPS}
        finishReason="finish"
        toolColorMap={TOOL_COLORS}
      />
    </div>
  );
}
