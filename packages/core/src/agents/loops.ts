/**
 * ReAct Loop Implementation
 *
 * Orchestrates the generate-execute-observe cycle for agent execution.
 * Uses generateObject() with a discriminated union schema to let the
 * model select tool calls or signal task completion.
 *
 * @packageDocumentation
 */

import type { LanguageModel, GenerationUsage } from '../generation/types.js';
import type { AgentStep, AgentResult, AgentMemory, ToolRegistry } from './types.js';
import { generateObject } from '../generation/generate-object.js';
import { jsonSchema } from '../generation/schema.js';

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
function createActionSchema(): ReturnType<typeof jsonSchema<AgentAction>> {
  const schema = {
    parse: (value: unknown): AgentAction => {
      if (typeof value !== 'object' || value === null) {
        throw new Error('Expected an object with a "type" field');
      }

      const obj = value as Record<string, unknown>;

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

  const totalUsage: GenerationUsage = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    durationMs: 0,
  };

  for (let stepIndex = 0; stepIndex < maxSteps; stepIndex++) {
    // Check abort signal
    abortSignal?.throwIfAborted();

    // Check timeout
    if (maxDurationMs !== undefined && Date.now() - startTime > maxDurationMs) {
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
