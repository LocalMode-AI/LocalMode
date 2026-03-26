/**
 * @file step-card.tsx
 * @description Renders a single agent step as a visual card
 */
'use client';

import { Wrench, CheckCircle, Clock, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { AgentStep } from '@localmode/core';
import { cn, formatDuration, truncateText, formatToolArgs } from '../_lib/utils';

/** Props for the StepCard component */
interface StepCardProps {
  /** The agent step to render */
  step: AgentStep;
}

/** Badge color based on tool name */
function getToolColor(toolName: string) {
  switch (toolName) {
    case 'search':
      return 'badge-primary';
    case 'note':
      return 'badge-secondary';
    case 'calculate':
      return 'badge-accent';
    default:
      return 'badge-ghost';
  }
}

/** Renders a single agent step as a card with tool info and observation */
export function StepCard({ step }: StepCardProps) {
  const [expanded, setExpanded] = useState(false);

  if (step.type === 'finish') {
    return (
      <div className="flex items-start gap-3 animate-fadeIn">
        <div className="w-8 h-8 rounded-full bg-success/20 text-success flex items-center justify-center shrink-0 mt-0.5">
          <CheckCircle className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-success">Final Answer</span>
            <span className="text-xs text-poster-text-sub/50">
              <Clock className="w-3 h-3 inline mr-0.5" />
              {formatDuration(step.durationMs)}
            </span>
          </div>
          <div className="bg-success/5 border border-success/20 rounded-xl p-4">
            <p className="text-sm text-poster-text-main leading-relaxed whitespace-pre-wrap">
              {step.result}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Tool call step
  const hasLongObservation = (step.observation?.length ?? 0) > 200;

  return (
    <div className="flex items-start gap-3 animate-fadeIn">
      <div className="w-8 h-8 rounded-full bg-poster-primary/10 text-poster-primary flex items-center justify-center shrink-0 mt-0.5">
        <Wrench className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-xs text-poster-text-sub/60">Step {step.index + 1}</span>
          <span className={cn('badge badge-sm', getToolColor(step.toolName ?? ''))}>
            {step.toolName}
          </span>
          {step.toolArgs && Object.keys(step.toolArgs).length > 0 && (
            <span className="text-xs text-poster-text-sub/50 truncate max-w-[300px]">
              {formatToolArgs(step.toolArgs)}
            </span>
          )}
          <span className="text-xs text-poster-text-sub/50 ml-auto shrink-0">
            <Clock className="w-3 h-3 inline mr-0.5" />
            {formatDuration(step.durationMs)}
          </span>
        </div>

        {step.observation && (
          <div className="bg-poster-surface/50 border border-poster-border/20 rounded-xl p-3">
            <p className="text-xs text-poster-text-sub leading-relaxed whitespace-pre-wrap">
              {expanded || !hasLongObservation
                ? step.observation
                : truncateText(step.observation, 200)}
            </p>
            {hasLongObservation && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-poster-primary hover:text-poster-primary-dark mt-1 flex items-center gap-0.5 cursor-pointer"
              >
                <ChevronDown className={cn('w-3 h-3 transition-transform', expanded && 'rotate-180')} />
                {expanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
