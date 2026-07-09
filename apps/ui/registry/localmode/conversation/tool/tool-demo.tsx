'use client';

/**
 * @file tool-demo.tsx
 * @description Docs preview for `Tool`. Shows the status taxonomy, expandable
 * input/output, a grouped set of consecutive calls, and the generic fallback.
 */
import {
  Tool,
  ToolContent,
  ToolGroup,
  ToolHeader,
  ToolInput,
  ToolOutput,
  type ToolCall,
} from './tool';

const CALLS: ToolCall[] = [
  {
    name: 'search_documents',
    status: 'completed',
    input: { query: 'offline support', topK: 3 },
    output: { hits: 3, topScore: 0.92 },
  },
  {
    name: 'fetch_weather',
    status: 'error',
    input: { city: 'unknown' },
    error: 'City not found',
  },
];

export default function ToolDemo() {
  return (
    <div className="flex w-full max-w-xl flex-col gap-3">
      <Tool defaultOpen>
        <ToolHeader name="search_documents" status="running" />
        <ToolContent>
          <ToolInput input={{ query: 'local-first AI', topK: 5 }} />
          <ToolOutput output={{ status: 'awaiting results…' }} />
        </ToolContent>
      </Tool>

      <ToolGroup calls={CALLS} defaultOpen />
    </div>
  );
}
