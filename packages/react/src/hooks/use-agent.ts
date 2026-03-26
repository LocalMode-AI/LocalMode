/**
 * @file use-agent.ts
 * @description React hook for running agents with step-by-step streaming, loading/error state, and cancellation
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type {
  LanguageModel,
  ToolDefinition,
  AgentMemory,
  AgentStep,
  AgentResult,
} from '@localmode/core';

const IS_SERVER = typeof window === 'undefined';

/**
 * Options for configuring the useAgent hook.
 */
export interface UseAgentOptions {
  /** The language model to use */
  model: LanguageModel;

  /** Available tools */
  tools: ToolDefinition[];

  /** Maximum ReAct loop iterations (default: 10) */
  maxSteps?: number;

  /** Maximum total duration in milliseconds */
  maxDurationMs?: number;

  /** Sampling temperature for tool selection (default: 0) */
  temperature?: number;

  /** Optional system prompt */
  systemPrompt?: string;

  /** Optional conversation memory */
  memory?: AgentMemory;
}

/**
 * Return type from the useAgent hook.
 */
export interface UseAgentReturn {
  /** Array of completed steps, updated in real-time */
  steps: AgentStep[];

  /** Final result when the agent completes */
  result: AgentResult | null;

  /** Whether the agent is currently executing */
  isRunning: boolean;

  /** Error if the agent failed */
  error: Error | null;

  /** Start the agent with a prompt */
  run: (prompt: string, context?: string) => Promise<AgentResult | null>;

  /** Abort the current agent run */
  cancel: () => void;

  /** Clear steps, result, and error state */
  reset: () => void;
}

/**
 * React hook for running agents with step-by-step progress.
 *
 * Wraps `runAgent()` with React state management, providing real-time
 * step updates, loading/error state, and cancellation support.
 *
 * @param options - Agent configuration
 * @returns Agent state and control functions
 *
 * @example
 * ```tsx
 * import { useAgent } from '@localmode/react';
 *
 * function ResearchAgent() {
 *   const { steps, result, isRunning, run, cancel } = useAgent({
 *     model: webllm.languageModel('Qwen3-1.7B-q4f16_1-MLC'),
 *     tools: [searchTool, noteTool],
 *   });
 *
 *   return (
 *     <div>
 *       <button onClick={() => run('Research quantum computing')}>Start</button>
 *       {isRunning && <button onClick={cancel}>Stop</button>}
 *       {steps.map(step => <StepCard key={step.index} step={step} />)}
 *       {result && <p>{result.result}</p>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useAgent(options: UseAgentOptions): UseAgentReturn {
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  const run = useCallback(async (prompt: string, context?: string): Promise<AgentResult | null> => {
    if (IS_SERVER) return null;

    // Abort any previous run
    abortControllerRef.current?.abort();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setSteps([]);
    setResult(null);
    setError(null);
    setIsRunning(true);

    try {
      // Dynamic import to avoid SSR issues
      const { runAgent } = await import('@localmode/core');

      const {
        model,
        tools,
        maxSteps,
        maxDurationMs,
        temperature,
        systemPrompt,
        memory,
      } = optionsRef.current;

      const agentResult = await runAgent({
        model,
        tools,
        prompt,
        context,
        maxSteps,
        maxDurationMs,
        temperature,
        systemPrompt,
        memory,
        abortSignal: controller.signal,
        onStep: (step: AgentStep) => {
          if (mountedRef.current && !controller.signal.aborted) {
            setSteps((prev) => [...prev, step]);
          }
        },
      });

      if (mountedRef.current && !controller.signal.aborted) {
        setResult(agentResult);
        setIsRunning(false);
        return agentResult;
      }
      return null;
    } catch (err) {
      if (!mountedRef.current) return null;

      // Silence abort errors
      if (err instanceof DOMException && err.name === 'AbortError') {
        setIsRunning(false);
        return null;
      }
      if (err instanceof Error && err.name === 'AbortError') {
        setIsRunning(false);
        return null;
      }

      setError(err instanceof Error ? err : new Error(String(err)));
      setIsRunning(false);
      return null;
    }
  }, []);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    if (mountedRef.current) {
      setIsRunning(false);
    }
  }, []);

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    setSteps([]);
    setResult(null);
    setError(null);
    setIsRunning(false);
  }, []);

  // SSR: return inert state
  if (IS_SERVER) {
    return {
      steps: [],
      result: null,
      isRunning: false,
      error: null,
      run: async () => null,
      cancel: () => {},
      reset: () => {},
    };
  }

  return { steps, result, isRunning, error, run, cancel, reset };
}
