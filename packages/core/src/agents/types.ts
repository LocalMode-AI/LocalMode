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

  /** Async function that executes the tool */
  execute: (params: TParams, context: ToolExecutionContext) => Promise<TResult>;
}

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

  /** Time spent on this step (model generation + tool execution) in milliseconds */
  durationMs: number;

  /** Token usage from the model call */
  usage?: GenerationUsage;
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

  /** Wall-clock time for the entire run in milliseconds */
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

  /** Maximum total duration in milliseconds (no default — unlimited unless set) */
  maxDurationMs?: number;

  /** Max retries per generateObject() call within a step (default: 3) */
  maxRetries?: number;

  /** Sampling temperature for tool selection (default: 0) */
  temperature?: number;

  /** Optional conversation memory */
  memory?: AgentMemory;

  /** Callback invoked after each completed step */
  onStep?: (step: AgentStep) => void;
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
