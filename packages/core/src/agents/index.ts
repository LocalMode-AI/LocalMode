/**
 * Agent Framework
 *
 * Local-first, privacy-first agent framework for the browser.
 * Uses the ReAct pattern with generateObject() for tool selection
 * and Zod schemas for type-safe tool parameters.
 *
 * @packageDocumentation
 */

// Agent factory and function
export { createAgent, runAgent } from './agent.js';

// Tool registry
export { createToolRegistry } from './tools.js';

// Agent memory
export { createAgentMemory } from './memory.js';

// Types
export type {
  // Tool types
  ToolDefinition,
  ToolRegistry,
  ToolExecutionContext,
  // Agent types
  Agent,
  AgentConfig,
  AgentRunOptions,
  RunAgentOptions,
  AgentStep,
  AgentResult,
  AgentFinishReason,
  // Memory types
  AgentMemory,
  AgentMemoryConfig,
  MemoryEntry,
  MemoryRetrieveOptions,
} from './types.js';
