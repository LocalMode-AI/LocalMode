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
  ToolApprovalRequest,
  ToolApprovalDecision,
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

  /**
   * The tool call currently awaiting a human decision, or `null` when
   * nothing is pending. Non-null only while the ReAct loop is paused on a
   * tool flagged `requiresApproval: true`; exposes the pending call's
   * `toolName`, model-proposed `args`, and `stepIndex`. Runs whose tools
   * have no `requiresApproval` flag never surface a pending approval.
   */
  pendingApproval: ToolApprovalRequest | null;

  /**
   * Approve the pending tool call: the tool executes and the run resumes.
   * No-op when nothing is pending. Clears `pendingApproval`.
   */
  approve: () => void;

  /**
   * Deny the pending tool call (with an optional reason): the tool is NOT
   * executed and a denial observation is fed back to the model so the loop
   * continues. No-op when nothing is pending. Clears `pendingApproval`.
   */
  deny: (reason?: string) => void;

  /** Start the agent with a prompt */
  run: (prompt: string, context?: string) => Promise<AgentResult | null>;

  /** Abort the current agent run (also clears any pending approval) */
  cancel: () => void;

  /** Clear steps, result, error, and pending-approval state */
  reset: () => void;
}

/**
 * React hook for running agents with step-by-step progress.
 *
 * Wraps `runAgent()` with React state management, providing real-time
 * step updates, loading/error state, cancellation support, and a
 * human-in-the-loop approval surface for tools flagged
 * `requiresApproval: true`. The hook installs the core `onToolApproval`
 * callback internally: when the loop pauses on a gated call,
 * `pendingApproval` becomes non-null and the run waits until `approve()`
 * or `deny(reason?)` is invoked (or the run is cancelled).
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
 *
 * @example
 * ```tsx
 * // Human-in-the-loop approval with a ui/conversation/tool-approval-style card.
 * // Flag sensitive tools with requiresApproval; the hook pauses the loop and
 * // exposes the pending call for the user to approve or deny.
 * function GatedAgent() {
 *   const { pendingApproval, approve, deny, steps, run } = useAgent({
 *     model,
 *     tools: [{ ...deleteFileTool, requiresApproval: true }],
 *   });
 *
 *   return (
 *     <div>
 *       <button onClick={() => run('Clean up temp files')}>Start</button>
 *       {pendingApproval && (
 *         <ToolApproval
 *           toolName={pendingApproval.toolName}
 *           args={pendingApproval.args}
 *           onApprove={() => approve()}
 *           onReject={() => deny('User rejected')}
 *         />
 *       )}
 *       {steps.map(step => (
 *         // step.approval?.decision is 'approved' | 'denied' for gated steps
 *         <StepCard key={step.index} step={step} />
 *       ))}
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
  const [pendingApproval, setPendingApproval] = useState<ToolApprovalRequest | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Single pending-approval slot (the ReAct loop is sequential, so at most
  // one decision is pending at a time). Holds the resolver of the Promise
  // the core loop is awaiting; approve()/deny() settle it.
  const pendingDecisionRef = useRef<((decision: ToolApprovalDecision) => void) | null>(null);

  /** Clear the pending approval slot without resolving (the core abort race unblocks the loop). */
  const clearPendingApproval = useCallback(() => {
    pendingDecisionRef.current = null;
    if (mountedRef.current) {
      setPendingApproval(null);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
      pendingDecisionRef.current = null;
    };
  }, []);

  const run = useCallback(async (prompt: string, context?: string): Promise<AgentResult | null> => {
    if (IS_SERVER) return null;

    // Abort any previous run (unblocks any pending approval race in core)
    abortControllerRef.current?.abort();
    // Drop any stale deferred so it cannot leak into the new run
    pendingDecisionRef.current = null;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setSteps([]);
    setResult(null);
    setError(null);
    setPendingApproval(null);
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
        // Deferred-based approval bridge: store the pending request in state
        // and hand the core loop a Promise settled by approve()/deny().
        // Installed unconditionally — the core loop only consults it for
        // tools flagged requiresApproval, so ungated runs never pause.
        onToolApproval: (request) =>
          new Promise<ToolApprovalDecision>((resolve) => {
            pendingDecisionRef.current = resolve;
            if (mountedRef.current && !controller.signal.aborted) {
              setPendingApproval(request);
            }
          }),
      });

      if (mountedRef.current && !controller.signal.aborted) {
        setResult(agentResult);
        setPendingApproval(null);
        setIsRunning(false);
        return agentResult;
      }
      return null;
    } catch (err) {
      // The run settled — no decision can apply anymore
      pendingDecisionRef.current = null;

      if (!mountedRef.current) return null;

      setPendingApproval(null);

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

  const approve = useCallback(() => {
    const resolveDecision = pendingDecisionRef.current;
    if (!resolveDecision) return; // no-op when nothing is pending
    clearPendingApproval();
    resolveDecision({ approved: true });
  }, [clearPendingApproval]);

  const deny = useCallback((reason?: string) => {
    const resolveDecision = pendingDecisionRef.current;
    if (!resolveDecision) return; // no-op when nothing is pending
    clearPendingApproval();
    resolveDecision(reason !== undefined ? { approved: false, reason } : { approved: false });
  }, [clearPendingApproval]);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    clearPendingApproval();
    if (mountedRef.current) {
      setIsRunning(false);
    }
  }, [clearPendingApproval]);

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    pendingDecisionRef.current = null;
    setSteps([]);
    setResult(null);
    setError(null);
    setPendingApproval(null);
    setIsRunning(false);
  }, []);

  // SSR: return inert state
  if (IS_SERVER) {
    return {
      steps: [],
      result: null,
      isRunning: false,
      error: null,
      pendingApproval: null,
      approve: () => {},
      deny: () => {},
      run: async () => null,
      cancel: () => {},
      reset: () => {},
    };
  }

  return { steps, result, isRunning, error, pendingApproval, approve, deny, run, cancel, reset };
}
