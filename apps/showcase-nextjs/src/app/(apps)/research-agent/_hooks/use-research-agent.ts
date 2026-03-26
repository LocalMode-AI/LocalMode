/**
 * @file use-research-agent.ts
 * @description Hook for managing the research agent with app-specific tools
 */
'use client';

import { useState } from 'react';
import { useAgent } from '@localmode/react';
import type { UseAgentReturn } from '@localmode/react';
import { getModel, createTools } from '../_services/agent.service';
import { MAX_STEPS } from '../_lib/constants';
import type { AppError } from '../_lib/types';

/** Return type for the useResearchAgent hook */
interface UseResearchAgentReturn extends Omit<UseAgentReturn, 'error'> {
  /** App-formatted error */
  error: AppError | null;
  /** Clear the error */
  clearError: () => void;
}

/** Hook for running the research agent with pre-configured tools */
export function useResearchAgent(): UseResearchAgentReturn {
  const [toolState] = useState(() => createTools());

  const agent = useAgent({
    model: getModel(),
    tools: toolState.tools,
    maxSteps: MAX_STEPS,
    temperature: 0,
    systemPrompt: 'You are a thorough research assistant. Search for information, take notes on key findings, and provide a comprehensive final answer. Always search before answering.',
  });

  const error: AppError | null = agent.error
    ? { message: agent.error.message, code: agent.error.name, recoverable: true }
    : null;

  const clearError = () => {
    agent.reset();
  };

  return {
    ...agent,
    error,
    clearError,
  };
}
