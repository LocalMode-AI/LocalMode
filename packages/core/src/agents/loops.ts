/**
 * ReAct Loop Implementation
 *
 * Orchestrates the generate-execute-observe cycle for agent execution.
 * Uses generateObject() with a discriminated union schema to let the
 * model select tool calls or signal task completion.
 *
 * @packageDocumentation
 */

import type { LanguageModel, GenerationUsage, ObjectSchema } from '../generation/types.js';
import type {
  AgentStep,
  AgentResult,
  AgentMemory,
  ToolRegistry,
  ToolApprovalRequest,
  ToolApprovalDecision,
} from './types.js';
import { generateObject } from '../generation/generate-object.js';

// ═══════════════════════════════════════════════════════════════
// ACTION SCHEMA (discriminated union for model output)
// ═══════════════════════════════════════════════════════════════

/**
 * Action type the model can output — either a tool call or a finish signal.
 */
interface ToolCallAction {
  type: 'tool_call';
  tool: string;
  args: Record<string, unknown>;
}

interface FinishAction {
  type: 'finish';
  result: string;
}

type AgentAction = ToolCallAction | FinishAction;

/**
 * Build a Zod-compatible ObjectSchema for the agent action without
 * importing Zod (core is zero-dependency). We define a manual parse
 * function and JSON Schema representation.
 */
function createActionSchema(): ObjectSchema<AgentAction> {
  const schema = {
    parse: (value: unknown): AgentAction => {
      if (typeof value !== 'object' || value === null) {
        throw new Error('Expected an object with a "type" field');
      }

      let obj = value as Record<string, unknown>;

      // Small models sometimes parrot the displayed JSON schema's
      // discriminated-union wrapper, emitting `{"oneOf": [ {action} ]}` (or
      // anyOf) instead of the bare action object. The intent is unambiguous —
      // unwrap a single-element union wrapper before validating. Found by the
      // blocks-chat agent E2E lane (LiteRT qwen3-0.6B).
      if (obj.type === undefined) {
        const wrapper = obj.oneOf ?? obj.anyOf;
        if (Array.isArray(wrapper) && wrapper.length >= 1 &&
            typeof wrapper[0] === 'object' && wrapper[0] !== null) {
          obj = wrapper[0] as Record<string, unknown>;
        }
      }

      if (obj.type === 'tool_call') {
        if (typeof obj.tool !== 'string' || !obj.tool) {
          throw new Error('tool_call action requires a non-empty "tool" string');
        }
        const args = (typeof obj.args === 'object' && obj.args !== null)
          ? obj.args as Record<string, unknown>
          : {};
        return { type: 'tool_call', tool: obj.tool, args };
      }

      if (obj.type === 'finish') {
        if (typeof obj.result !== 'string') {
          throw new Error('finish action requires a "result" string');
        }
        return { type: 'finish', result: obj.result };
      }

      throw new Error(
        `Invalid action type: "${String(obj.type)}". Must be "tool_call" or "finish".`
      );
    },

    jsonSchema: {
      oneOf: [
        {
          type: 'object',
          properties: {
            type: { type: 'string', const: 'tool_call' },
            tool: { type: 'string', description: 'Name of the tool to call' },
            args: { type: 'object', description: 'Arguments for the tool' },
          },
          required: ['type', 'tool', 'args'],
        },
        {
          type: 'object',
          properties: {
            type: { type: 'string', const: 'finish' },
            result: { type: 'string', description: 'Final answer to the user\'s question' },
          },
          required: ['type', 'result'],
        },
      ],
      description: 'Either call a tool or finish with a final answer',
    },

    description: 'Agent action: tool_call or finish',
  };

  return schema;
}

// ═══════════════════════════════════════════════════════════════
// PROMPT CONSTRUCTION
// ═══════════════════════════════════════════════════════════════

/**
 * Token budget for each ReAct action generation. generateObject's default
 * (1024) truncates reasoning/thinking models mid-`<think>` under the large
 * agent prompt (tools + schema + rules): the think block never closes, no
 * JSON is ever emitted, and — at the loop's temperature 0 — every retry
 * fails identically ("Failed to generate valid object after N attempts").
 * 2048 gives thinking models room to close the think block and still emit
 * the action JSON; non-thinking models stop at the JSON's end long before
 * the cap, so the headroom costs nothing when unused.
 */
const ACTION_MAX_TOKENS = 2048;

/**
 * Build the agent system prompt with tool descriptions and instructions.
 */
export function buildAgentPrompt(
  toolRegistry: ToolRegistry,
  systemPrompt?: string,
): string {
  const parts: string[] = [];

  if (systemPrompt) {
    parts.push(systemPrompt);
  }

  parts.push(
    'You are an AI agent that solves tasks by using available tools step by step.',
    'Follow the ReAct pattern: Reason about the task, select a tool to call, observe the result, and repeat until you can provide a final answer.',
    '',
    'Available tools:',
  );

  for (const tool of toolRegistry.descriptions()) {
    parts.push(
      `- ${tool.name}: ${tool.description}`,
      `  Parameters: ${JSON.stringify(tool.parameters)}`,
    );
  }

  parts.push(
    '',
    'To call a tool, output: {"type": "tool_call", "tool": "<tool_name>", "args": {<arguments>}}',
    'When you have gathered enough information to answer, output: {"type": "finish", "result": "<your_final_answer>"}',
    '',
    'Rules:',
    '- Call ONE tool at a time',
    '- Analyze each observation before deciding the next action',
    '- Do not repeat the same tool call with identical arguments',
    '- Provide a clear, comprehensive final answer',
  );

  return parts.join('\n');
}

/**
 * Build the user-facing prompt with task, context, memory, and step history.
 */
function buildUserPrompt(
  task: string,
  history: string,
  context?: string,
  memoryContext?: string,
  deduplicationHint?: string,
): string {
  const parts: string[] = [];

  if (memoryContext) {
    parts.push('Relevant past context:', memoryContext, '');
  }

  if (context) {
    parts.push('Additional context:', context, '');
  }

  parts.push(`Task: ${task}`);

  if (history) {
    parts.push('', 'Previous steps:', history);
  }

  if (deduplicationHint) {
    parts.push('', deduplicationHint);
  }

  parts.push('', 'What is your next action? Output valid JSON.');

  return parts.join('\n');
}

/**
 * Format a completed step as a structured log entry for conversation history.
 */
function formatStepForHistory(step: AgentStep): string {
  if (step.type === 'tool_call') {
    const argsStr = JSON.stringify(step.toolArgs ?? {});
    return `Step ${step.index}: Called tool "${step.toolName}" with ${argsStr}\nObservation: ${step.observation ?? 'No result'}`;
  }
  return `Step ${step.index}: Finished with result: ${step.result ?? ''}`;
}

/**
 * Truncate step history when it exceeds context window limits.
 * Keeps the most recent steps that fit within the estimated budget.
 *
 * @param steps - All completed steps
 * @param contextLength - Model's context length in tokens
 * @param reservedTokens - Tokens reserved for system prompt, tools, and current prompt
 * @returns Formatted history string within token budget
 */
export function truncateHistory(
  steps: AgentStep[],
  contextLength: number,
  reservedTokens: number,
): string {
  if (steps.length === 0) return '';

  const availableTokens = Math.floor(contextLength * 0.8) - reservedTokens;
  if (availableTokens <= 0) return '';

  // Build history from most recent steps backwards
  const formattedSteps: string[] = [];
  let estimatedTokens = 0;

  for (let i = steps.length - 1; i >= 0; i--) {
    const formatted = formatStepForHistory(steps[i]);
    const stepTokens = Math.ceil(formatted.length / 4); // ~4 chars per token

    if (estimatedTokens + stepTokens > availableTokens) {
      break;
    }

    formattedSteps.unshift(formatted);
    estimatedTokens += stepTokens;
  }

  if (formattedSteps.length < steps.length) {
    return `[${steps.length - formattedSteps.length} earlier steps truncated]\n\n${formattedSteps.join('\n\n')}`;
  }

  return formattedSteps.join('\n\n');
}

// ═══════════════════════════════════════════════════════════════
// REACT LOOP
// ═══════════════════════════════════════════════════════════════

/** Internal configuration for the ReAct loop */
interface ReActLoopConfig {
  model: LanguageModel;
  toolRegistry: ToolRegistry;
  prompt: string;
  systemPrompt?: string;
  context?: string;
  maxSteps: number;
  maxDurationMs?: number;
  maxRetries: number;
  temperature: number;
  memory?: AgentMemory;
  abortSignal?: AbortSignal;
  onStep?: (step: AgentStep) => void;
  onToolApproval?: (
    request: ToolApprovalRequest
  ) => ToolApprovalDecision | Promise<ToolApprovalDecision>;
}

/**
 * Await an approval decision raced against the run's abort signal (D5).
 *
 * The abort listener is attached only for the duration of the wait and
 * removed once the race settles. If the signal aborts while the decision is
 * pending, the returned promise rejects with the abort reason immediately;
 * a decision that resolves afterwards is ignored (the race already settled).
 */
async function awaitApprovalDecision(
  decision: ToolApprovalDecision | Promise<ToolApprovalDecision>,
  abortSignal?: AbortSignal,
): Promise<ToolApprovalDecision> {
  if (!abortSignal) {
    return await decision;
  }

  abortSignal.throwIfAborted();

  let removeAbortListener: (() => void) | undefined;
  try {
    return await new Promise<ToolApprovalDecision>((resolve, reject) => {
      const onAbort = () => {
        reject(
          abortSignal.reason ??
            new DOMException('This operation was aborted', 'AbortError')
        );
      };
      abortSignal.addEventListener('abort', onAbort, { once: true });
      removeAbortListener = () => abortSignal.removeEventListener('abort', onAbort);
      Promise.resolve(decision).then(resolve, reject);
    });
  } finally {
    removeAbortListener?.();
  }
}

/**
 * Execute the ReAct loop: generate -> execute -> observe -> repeat.
 *
 * This is the core agent loop that:
 * 1. Builds a prompt with tool descriptions and conversation history
 * 2. Calls generateObject() to get the model's action (tool_call or finish)
 * 3. Validates and executes tool calls, or returns on finish
 * 4. Enforces safety guards: maxSteps, maxDurationMs, loop detection
 *
 * @internal Not exported from the public API
 */
export async function executeReActLoop(config: ReActLoopConfig): Promise<AgentResult> {
  const {
    model,
    toolRegistry,
    prompt,
    systemPrompt,
    context,
    maxSteps,
    maxDurationMs,
    maxRetries,
    temperature,
    memory,
    abortSignal,
    onStep,
    onToolApproval,
  } = config;

  const startTime = Date.now();
  const steps: AgentStep[] = [];
  const actionSchema = createActionSchema();
  const agentSystemPrompt = buildAgentPrompt(toolRegistry, systemPrompt);

  // Estimate reserved tokens for system prompt and tools
  const reservedTokens = Math.ceil(agentSystemPrompt.length / 4) + Math.ceil(prompt.length / 4) + 200;

  // Retrieve memory context if available
  let memoryContext: string | undefined;
  if (memory) {
    try {
      const memories = await memory.retrieve(prompt, { maxResults: 5, minSimilarity: 0.7 });
      if (memories.length > 0) {
        memoryContext = memories
          .map((m) => `[${m.role}] ${m.content}`)
          .join('\n');
      }
    } catch {
      // Memory retrieval is best-effort; continue without it
    }
  }

  // Loop detection state
  let lastToolCall: string | null = null;
  let consecutiveDuplicates = 0;

  // Accumulated time spent awaiting approval decisions. Excluded from the
  // maxDurationMs budget (D6) — human decision latency is unbounded and
  // must not make a configured timeout fire spuriously mid-decision.
  let approvalWaitMs = 0;

  const totalUsage: GenerationUsage = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    durationMs: 0,
  };

  for (let stepIndex = 0; stepIndex < maxSteps; stepIndex++) {
    // Check abort signal
    abortSignal?.throwIfAborted();

    // Check timeout (approval wait time does not consume the budget — D6)
    if (maxDurationMs !== undefined && Date.now() - startTime - approvalWaitMs > maxDurationMs) {
      return {
        result: '',
        steps,
        finishReason: 'timeout',
        totalDurationMs: Date.now() - startTime,
        totalUsage,
      };
    }

    const stepStart = Date.now();

    // Build conversation history
    const history = truncateHistory(steps, model.contextLength, reservedTokens);

    // Build deduplication hint if needed
    let deduplicationHint: string | undefined;
    if (consecutiveDuplicates >= 1) {
      deduplicationHint = 'IMPORTANT: You already called the same tool with identical arguments. Try a different approach, use different arguments, or finish with your current knowledge.';
    }

    // Build user prompt
    const userPrompt = buildUserPrompt(prompt, history, context, memoryContext, deduplicationHint);

    // Call generateObject with action schema
    let action: AgentAction;
    let stepUsage: GenerationUsage | undefined;

    try {
      const result = await generateObject<AgentAction>({
        model,
        schema: actionSchema,
        prompt: userPrompt,
        systemPrompt: agentSystemPrompt,
        maxRetries,
        temperature,
        maxTokens: ACTION_MAX_TOKENS,
        abortSignal,
      });

      action = result.object;
      stepUsage = result.usage;
      totalUsage.inputTokens += result.usage.inputTokens;
      totalUsage.outputTokens += result.usage.outputTokens;
      totalUsage.totalTokens += result.usage.totalTokens;
      totalUsage.durationMs += result.usage.durationMs;
    } catch (error) {
      // Re-throw abort errors
      if (abortSignal?.aborted) {
        throw error;
      }

      // Unrecoverable model failure — throw AgentError
      const { AgentError } = await import('../errors/index.js');
      throw new AgentError(
        `Agent failed at step ${stepIndex}: ${error instanceof Error ? error.message : String(error)}`,
        {
          steps,
          hint: 'The model could not produce a valid action. Try a more capable model (Qwen3 8B recommended) or simplify the tool definitions.',
          cause: error instanceof Error ? error : undefined,
        }
      );
    }

    // Handle finish action
    if (action.type === 'finish') {
      const step: AgentStep = {
        index: stepIndex,
        type: 'finish',
        result: action.result,
        durationMs: Date.now() - stepStart,
        usage: stepUsage,
      };
      steps.push(step);
      onStep?.(step);

      return {
        result: action.result,
        steps,
        finishReason: 'finish',
        totalDurationMs: Date.now() - startTime,
        totalUsage,
      };
    }

    // Handle tool_call action
    const toolCallKey = `${action.tool}:${JSON.stringify(action.args)}`;

    // Loop detection
    if (toolCallKey === lastToolCall) {
      consecutiveDuplicates++;
      if (consecutiveDuplicates >= 2) {
        // Terminate with loop_detected
        const step: AgentStep = {
          index: stepIndex,
          type: 'tool_call',
          toolName: action.tool,
          toolArgs: action.args,
          observation: 'Loop detected: repeated identical tool call. Agent terminated.',
          durationMs: Date.now() - stepStart,
          usage: stepUsage,
        };
        steps.push(step);
        onStep?.(step);

        return {
          result: '',
          steps,
          finishReason: 'loop_detected',
          totalDurationMs: Date.now() - startTime,
          totalUsage,
        };
      }
    } else {
      consecutiveDuplicates = 0;
    }
    lastToolCall = toolCallKey;

    // Approval gate: pause before executing a flagged tool (D1/D2).
    // Consulted ONLY for tools with requiresApproval — ungated tools never
    // touch the callback. Denied calls still participated in the loop
    // detection above, so persistent identical retries terminate via the
    // existing loop_detected guard.
    let approval: AgentStep['approval'];
    const pendingTool = toolRegistry.get(action.tool);
    if (pendingTool?.requiresApproval && onToolApproval) {
      const waitStart = Date.now();
      let decision: ToolApprovalDecision;
      try {
        decision = await awaitApprovalDecision(
          onToolApproval({ toolName: action.tool, args: action.args, stepIndex }),
          abortSignal,
        );
      } catch (error) {
        // Abort while pending surfaces through the existing abort path (D5)
        if (abortSignal?.aborted) {
          throw error;
        }
        // A throwing approval callback is a programming error — fail loudly
        const { AgentError } = await import('../errors/index.js');
        throw new AgentError(
          `Approval callback failed at step ${stepIndex}: ${error instanceof Error ? error.message : String(error)}`,
          {
            steps,
            hint: 'The onToolApproval callback threw or rejected. Return { approved: true } or { approved: false, reason? } instead of throwing.',
            cause: error instanceof Error ? error : undefined,
          }
        );
      } finally {
        approvalWaitMs += Date.now() - waitStart;
      }

      if (!decision.approved) {
        // Denied: skip execution and feed a rejection observation back (D3)
        const reason = decision.reason;
        const step: AgentStep = {
          index: stepIndex,
          type: 'tool_call',
          toolName: action.tool,
          toolArgs: action.args,
          observation: `Tool call denied by user${reason ? `: ${reason}` : ''}. Do not repeat this exact call; try a different approach or finish with what you know.`,
          durationMs: Date.now() - stepStart,
          usage: stepUsage,
          approval: reason !== undefined
            ? { decision: 'denied', reason }
            : { decision: 'denied' },
        };
        steps.push(step);
        onStep?.(step);
        continue;
      }

      approval = { decision: 'approved' };
    }

    // Execute the tool
    let observation: string;
    try {
      const toolResult = await toolRegistry.execute(action.tool, action.args, {
        abortSignal: abortSignal ?? new AbortController().signal,
        stepIndex,
      });

      // Stringify the tool result
      observation = typeof toolResult === 'string'
        ? toolResult
        : JSON.stringify(toolResult);
    } catch (error) {
      // Tool errors become observations — the model can adapt
      observation = `Error: ${error instanceof Error ? error.message : String(error)}`;
    }

    const step: AgentStep = {
      index: stepIndex,
      type: 'tool_call',
      toolName: action.tool,
      toolArgs: action.args,
      observation,
      durationMs: Date.now() - stepStart,
      usage: stepUsage,
      // Only gated steps carry the approval field (backward compatible)
      ...(approval ? { approval } : {}),
    };
    steps.push(step);
    onStep?.(step);
  }

  // Max steps reached without finishing
  return {
    result: '',
    steps,
    finishReason: 'max_steps',
    totalDurationMs: Date.now() - startTime,
    totalUsage,
  };
}
