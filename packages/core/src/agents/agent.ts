/**
 * Agent Factory and Function
 *
 * Creates reusable agent instances and provides a one-shot runAgent() function.
 * Agents use the ReAct loop to iteratively call tools and reason about results.
 *
 * @packageDocumentation
 */

import type {
  AgentConfig,
  AgentRunOptions,
  RunAgentOptions,
  Agent,
  AgentResult,
} from './types.js';
import { createToolRegistry } from './tools.js';
import { executeReActLoop } from './loops.js';

// ═══════════════════════════════════════════════════════════════
// AGENT FACTORY
// ═══════════════════════════════════════════════════════════════

/**
 * Create a reusable agent instance.
 *
 * Binds a language model, tools, and configuration into an Agent
 * that can be run multiple times with different prompts. Each run
 * is independent unless memory is configured.
 *
 * @param config - Agent configuration
 * @returns An Agent instance with a run() method
 *
 * @throws {Error} If no tools are provided or model is missing
 *
 * @example
 * ```ts
 * import { createAgent, jsonSchema } from '@localmode/core';
 * import { webllm } from '@localmode/webllm';
 * import { z } from 'zod';
 *
 * const agent = createAgent({
 *   model: webllm.languageModel('Qwen3-1.7B-q4f16_1-MLC'),
 *   tools: [{
 *     name: 'search',
 *     description: 'Search for information',
 *     parameters: jsonSchema(z.object({ query: z.string() })),
 *     execute: async ({ query }) => `Results for: ${query}`,
 *   }],
 *   maxSteps: 10,
 * });
 *
 * const result = await agent.run({ prompt: 'Research quantum computing' });
 * console.log(result.result);
 * console.log(result.steps.length, 'steps taken');
 * ```
 *
 * @see {@link runAgent} for one-shot execution
 */
export function createAgent(config: AgentConfig): Agent {
  // Validate configuration
  if (!config.model) {
    throw new Error('Agent requires a LanguageModel. Provide a model via the "model" option.');
  }
  if (!config.tools || config.tools.length === 0) {
    throw new Error('Agent requires at least one tool. Provide tools via the "tools" option.');
  }

  const {
    model,
    tools,
    systemPrompt,
    maxSteps = 10,
    maxDurationMs,
    maxRetries = 3,
    temperature = 0,
    memory,
    onStep: configOnStep,
  } = config;

  const toolRegistry = createToolRegistry(tools);

  return {
    async run(options: AgentRunOptions): Promise<AgentResult> {
      const {
        prompt,
        abortSignal,
        onStep: runOnStep,
        context,
      } = options;

      // Per-run onStep overrides config-level onStep
      const onStep = runOnStep ?? configOnStep;

      const result = await executeReActLoop({
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
      });

      // Store result in memory if configured and agent finished successfully
      if (memory && result.finishReason === 'finish' && result.result) {
        try {
          await memory.add({
            id: `user-${Date.now()}`,
            role: 'user',
            content: prompt,
            timestamp: Date.now(),
          });
          await memory.add({
            id: `agent-${Date.now()}`,
            role: 'agent',
            content: result.result,
            timestamp: Date.now(),
            metadata: {
              finishReason: result.finishReason,
              stepCount: result.steps.length,
            },
          });
        } catch {
          // Memory storage is best-effort; do not fail the agent run
        }
      }

      return result;
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// ONE-SHOT FUNCTION
// ═══════════════════════════════════════════════════════════════

/**
 * Run an agent as a one-shot function.
 *
 * Convenience function that creates an agent and immediately runs it.
 * Equivalent to `createAgent(config).run(options)`.
 *
 * @param options - Combined agent configuration and run options
 * @returns Promise with the agent result
 *
 * @example
 * ```ts
 * import { runAgent, jsonSchema } from '@localmode/core';
 * import { webllm } from '@localmode/webllm';
 * import { z } from 'zod';
 *
 * const result = await runAgent({
 *   model: webllm.languageModel('Qwen3-1.7B-q4f16_1-MLC'),
 *   tools: [{
 *     name: 'calculate',
 *     description: 'Evaluate a math expression',
 *     parameters: jsonSchema(z.object({ expression: z.string() })),
 *     execute: async ({ expression }) => String(eval(expression)),
 *   }],
 *   prompt: 'What is 2 + 2?',
 *   maxSteps: 5,
 * });
 *
 * console.log(result.result); // "4"
 * ```
 *
 * @see {@link createAgent} for reusable agents
 */
export async function runAgent(options: RunAgentOptions): Promise<AgentResult> {
  const {
    prompt,
    abortSignal,
    context,
    onStep: runOnStep,
    ...agentConfig
  } = options;

  // Use run-level onStep if provided, fallback to config-level
  const agent = createAgent({ ...agentConfig, onStep: options.onStep });
  return agent.run({
    prompt,
    abortSignal,
    onStep: runOnStep,
    context,
  });
}
