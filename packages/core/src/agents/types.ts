/**
 * Agent Framework Types
 *
 * Type definitions for the local-first agent framework.
 * Defines tools, agent configuration, step tracking, results,
 * and optional VectorDB-backed conversation memory.
 *
 * @packageDocumentation
 */

import type { LanguageModel, GenerationUsage, ObjectSchema } from '../generation/types.js';
import type { EmbeddingModel } from '../embeddings/types.js';

// ═══════════════════════════════════════════════════════════════
// TOOL TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Context passed to a tool's execute function.
 */
export interface ToolExecutionContext {
  /** AbortSignal for cancellation */
  abortSignal: AbortSignal;

  /** Current step number in the agent loop (zero-based) */
  stepIndex: number;
}

/**
 * A type-safe tool definition with Zod-validated parameters.
 *
 * @typeParam TParams - The validated parameter type
 * @typeParam TResult - The tool's return type
 *
 * @example
 * ```ts
 * import { jsonSchema } from '@localmode/core';
 * import { z } from 'zod';
 *
 * const searchTool: ToolDefinition = {
 *   name: 'search',
 *   description: 'Search a knowledge base for relevant information',
 *   parameters: jsonSchema(z.object({
 *     query: z.string().describe('The search query'),
 *     maxResults: z.number().default(5),
 *   })),
 *   execute: async ({ query, maxResults }, { abortSignal }) => {
 *     // Tool implementation
 *     return { results: [] };
 *   },
 * };
 * ```
 */
export interface ToolDefinition<TParams = unknown, TResult = unknown> {
  /** Unique tool identifier */
  name: string;

  /** Human-readable description for the model prompt */
  description: string;

  /** Zod-wrapped schema for tool parameters (via jsonSchema()) */
  parameters: ObjectSchema<TParams>;

  /**
   * Async function that executes the tool.
   *
   * Declared with method syntax so a tool typed via {@link defineTool}
   * (e.g. `ToolDefinition<{ query: string }, Result>`) remains assignable
   * to `ToolDefinition[]` in mixed tool arrays.
   */
  execute(params: TParams, context: ToolExecutionContext): Promise<TResult>;

  /**
   * When `true`, the ReAct loop pauses before executing this tool and awaits
   * a human-in-the-loop decision from the `onToolApproval` callback
   * (config-level or per-run). Approved calls execute exactly like ungated
   * calls; denied calls are skipped and a rejection observation is fed back
   * to the model so the loop can adapt.
   *
   * Default: absent/`false` — the tool executes immediately without approval.
   *
   * A run that includes a tool with `requiresApproval: true` but no effective
   * `onToolApproval` callback fails fast with an `AgentError` before any
   * model call.
   *
   * @see AgentConfig.onToolApproval
   */
  requiresApproval?: boolean;
}

/**
 * Request passed to the `onToolApproval` callback when the ReAct loop
 * pauses on a tool flagged with `requiresApproval`.
 *
 * @see AgentConfig.onToolApproval
 * @see ToolDefinition.requiresApproval
 */
export interface ToolApprovalRequest {
  /** Name of the tool the model wants to call */
  toolName: string;

  /** Arguments proposed by the model (schema validation happens at execution, as for ungated calls) */
  args: Record<string, unknown>;

  /** Zero-based step index of the pending tool call */
  stepIndex: number;
}

/**
 * Decision returned by the `onToolApproval` callback.
 *
 * - `{ approved: true }` — the loop resumes and executes the tool exactly
 *   like an ungated call.
 * - `{ approved: false, reason? }` — the tool is NOT executed; the loop
 *   records a denial observation (including the optional reason) and
 *   continues so the model can adapt.
 *
 * @see AgentConfig.onToolApproval
 */
export type ToolApprovalDecision =
  | { approved: true }
  | { approved: false; reason?: string };

/**
 * Registry for managing tool registration and lookup.
 */
export interface ToolRegistry {
  /** Look up a tool by name */
  get(name: string): ToolDefinition | undefined;

  /** Check if a tool exists */
  has(name: string): boolean;

  /** List all registered tool names */
  names(): string[];

  /** Structured info for prompt construction */
  descriptions(): Array<{ name: string; description: string; parameters: Record<string, unknown> }>;

  /** Validate arguments against a tool's parameter schema */
  validate(name: string, args: unknown): unknown;

  /** Validate and execute a tool call */
  execute(name: string, args: unknown, context: ToolExecutionContext): Promise<unknown>;
}

// ═══════════════════════════════════════════════════════════════
// AGENT STEP & RESULT
// ═══════════════════════════════════════════════════════════════

/**
 * Captures one iteration of the ReAct loop.
 */
export interface AgentStep {
  /** Zero-based step number */
  index: number;

  /** What the model decided to do */
  type: 'tool_call' | 'finish';

  /** Tool that was called (when type is 'tool_call') */
  toolName?: string;

  /** Arguments passed to the tool */
  toolArgs?: Record<string, unknown>;

  /** Stringified result from tool execution (or error message) */
  observation?: string;

  /** Final answer text (when type is 'finish') */
  result?: string;

  /**
   * Time spent on this step in milliseconds (model generation + tool
   * execution). For approval-gated steps this INCLUDES the time spent
   * awaiting the approval decision — the wait is part of the step.
   */
  durationMs: number;

  /** Token usage from the model call */
  usage?: GenerationUsage;

  /**
   * Approval decision recorded for approval-gated tool calls
   * (`requiresApproval: true`). Absent on ungated steps.
   * `reason` is set when the deny decision carried one.
   *
   * @see ToolDefinition.requiresApproval
   * @see AgentConfig.onToolApproval
   */
  approval?: { decision: 'approved' | 'denied'; reason?: string };
}

/**
 * Reason why the agent stopped executing.
 */
export type AgentFinishReason =
  | 'finish'
  | 'max_steps'
  | 'timeout'
  | 'loop_detected'
  | 'aborted'
  | 'error';

/**
 * Captures the complete result of an agent run.
 */
export interface AgentResult {
  /** Final answer text (from the finish step, or empty string if terminated by safety guard) */
  result: string;

  /** All steps executed during the run */
  steps: AgentStep[];

  /** Why the agent stopped */
  finishReason: AgentFinishReason;

  /**
   * Wall-clock time for the entire run in milliseconds. Includes time spent
   * awaiting approval decisions (it reports reality), even though that wait
   * does not count toward `maxDurationMs`.
   */
  totalDurationMs: number;

  /** Accumulated token usage across all steps */
  totalUsage: GenerationUsage;
}

// ═══════════════════════════════════════════════════════════════
// AGENT MEMORY
// ═══════════════════════════════════════════════════════════════

/**
 * A single entry in agent conversation memory.
 */
export interface MemoryEntry {
  /** Unique entry identifier */
  id: string;

  /** Who produced this entry */
  role: 'user' | 'agent' | 'tool';

  /** The text content */
  content: string;

  /** When the entry was created (Date.now()) */
  timestamp: number;

  /** Optional additional context (tool name, step index, etc.) */
  metadata?: Record<string, unknown>;
}

/**
 * Options for retrieving memories.
 */
export interface MemoryRetrieveOptions {
  /** Maximum entries to retrieve (default: 5) */
  maxResults?: number;

  /** Minimum cosine similarity threshold (default: 0.7) */
  minSimilarity?: number;

  /** Optional filter by role */
  filter?: { role?: string };
}

/**
 * VectorDB-backed conversation memory for agents.
 *
 * @example
 * ```ts
 * const memory = await createAgentMemory({
 *   embeddingModel: transformers.embedding('Xenova/bge-small-en-v1.5'),
 * });
 *
 * await memory.add({
 *   id: '1',
 *   role: 'user',
 *   content: 'What is quantum computing?',
 *   timestamp: Date.now(),
 * });
 *
 * const relevant = await memory.retrieve('quantum mechanics');
 * ```
 */
export interface AgentMemory {
  /** Store a conversation turn */
  add(entry: MemoryEntry): Promise<void>;

  /** Find relevant past interactions via semantic search */
  retrieve(query: string, options?: MemoryRetrieveOptions): Promise<MemoryEntry[]>;

  /** Remove all stored memories */
  clear(): Promise<void>;

  /** Release resources (close VectorDB) */
  close(): Promise<void>;
}

/**
 * Configuration for creating an AgentMemory instance.
 */
export interface AgentMemoryConfig {
  /** Model for embedding memory entries */
  embeddingModel: EmbeddingModel;

  /** VectorDB collection name (default: 'agent-memory') */
  name?: string;

  /** Embedding dimensions (inferred from model if possible, default: 384) */
  dimensions?: number;

  /** Maximum stored entries before oldest are evicted (default: 1000) */
  maxEntries?: number;
}

// ═══════════════════════════════════════════════════════════════
// AGENT CONFIGURATION
// ═══════════════════════════════════════════════════════════════

/**
 * Configuration for creating an agent.
 *
 * @example
 * ```ts
 * const config: AgentConfig = {
 *   model: webllm.languageModel('Qwen3-1.7B-q4f16_1-MLC'),
 *   tools: [searchTool, noteTool],
 *   maxSteps: 10,
 *   systemPrompt: 'You are a helpful research assistant.',
 * };
 * ```
 */
export interface AgentConfig {
  /** The language model to use for reasoning */
  model: LanguageModel;

  /** Available tools */
  tools: ToolDefinition[];

  /** Optional system prompt prepended to the agent prompt */
  systemPrompt?: string;

  /** Maximum ReAct loop iterations (default: 10) */
  maxSteps?: number;

  /**
   * Maximum total duration in milliseconds (no default — unlimited unless set).
   * Time spent awaiting approval decisions (`onToolApproval`) does NOT count
   * toward this budget — human decision latency is unbounded.
   */
  maxDurationMs?: number;

  /** Max retries per generateObject() call within a step (default: 3) */
  maxRetries?: number;

  /** Sampling temperature for tool selection (default: 0) */
  temperature?: number;

  /** Optional conversation memory */
  memory?: AgentMemory;

  /** Callback invoked after each completed step */
  onStep?: (step: AgentStep) => void;

  /**
   * Human-in-the-loop approval callback for tools flagged
   * `requiresApproval: true`. The ReAct loop pauses before executing a
   * flagged tool, invokes this callback with the pending call's
   * `{ toolName, args, stepIndex }`, and awaits the decision (sync or
   * Promise). Return `{ approved: true }` to execute the tool, or
   * `{ approved: false, reason? }` to skip it and feed a denial observation
   * back to the model so the loop continues. Tools without the flag never
   * consult this callback. Can be overridden per-run via
   * {@link AgentRunOptions.onToolApproval} (run-level wins, mirroring `onStep`).
   *
   * NOTE: the loop waits indefinitely for the decision — there is no
   * built-in approval timeout. The escape hatch is the run's `abortSignal`
   * (a pending decision races the signal, and aborting rejects the run
   * immediately without executing the tool). Approval wait time does not
   * count toward `maxDurationMs`.
   *
   * @example
   * ```ts
   * const result = await runAgent({
   *   model,
   *   tools: [{ ...deleteFileTool, requiresApproval: true }],
   *   prompt: 'Clean up temp files',
   *   onToolApproval: async ({ toolName, args }) => {
   *     const ok = await showConfirmDialog(`Allow ${toolName}?`, args);
   *     return ok ? { approved: true } : { approved: false, reason: 'User rejected' };
   *   },
   * });
   * ```
   *
   * @see ToolDefinition.requiresApproval
   * @see ToolApprovalRequest
   * @see ToolApprovalDecision
   */
  onToolApproval?: (
    request: ToolApprovalRequest
  ) => ToolApprovalDecision | Promise<ToolApprovalDecision>;
}

/**
 * Options for a single agent run.
 */
export interface AgentRunOptions {
  /** The user's task/question */
  prompt: string;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Per-run step callback (overrides config-level onStep) */
  onStep?: (step: AgentStep) => void;

  /**
   * Per-run approval callback (overrides config-level onToolApproval).
   *
   * @see AgentConfig.onToolApproval for the full contract
   */
  onToolApproval?: (
    request: ToolApprovalRequest
  ) => ToolApprovalDecision | Promise<ToolApprovalDecision>;

  /** Additional context to include in the agent prompt */
  context?: string;
}

/**
 * Combined options for the one-shot runAgent() function.
 */
export interface RunAgentOptions extends AgentConfig, AgentRunOptions {}

// ═══════════════════════════════════════════════════════════════
// AGENT INTERFACE
// ═══════════════════════════════════════════════════════════════

/**
 * A reusable agent instance created by createAgent().
 *
 * @example
 * ```ts
 * const agent = createAgent({ model, tools, maxSteps: 10 });
 * const result1 = await agent.run({ prompt: 'Research quantum computing' });
 * const result2 = await agent.run({ prompt: 'Research machine learning' });
 * ```
 */
export interface Agent {
  /** Execute the agent with a prompt */
  run(options: AgentRunOptions): Promise<AgentResult>;
}
