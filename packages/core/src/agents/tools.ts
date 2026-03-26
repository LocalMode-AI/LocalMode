/**
 * Tool Registry
 *
 * Factory and implementation for managing agent tool registration,
 * validation, and execution. Tools are defined with Zod schemas
 * for type-safe parameter validation.
 *
 * @packageDocumentation
 */

import type { ToolDefinition, ToolRegistry, ToolExecutionContext } from './types.js';

/**
 * Create a tool registry from an array of tool definitions.
 *
 * Validates that tool names are unique and stores them for lookup,
 * validation, and execution during the agent ReAct loop.
 *
 * @param tools - Array of tool definitions
 * @returns A ToolRegistry instance
 *
 * @throws {ValidationError} If duplicate tool names are found
 *
 * @example
 * ```ts
 * import { createToolRegistry, jsonSchema } from '@localmode/core';
 * import { z } from 'zod';
 *
 * const registry = createToolRegistry([
 *   {
 *     name: 'search',
 *     description: 'Search the knowledge base',
 *     parameters: jsonSchema(z.object({ query: z.string() })),
 *     execute: async ({ query }) => ({ results: [] }),
 *   },
 * ]);
 *
 * registry.has('search'); // true
 * registry.names(); // ['search']
 * ```
 */
export function createToolRegistry(tools: ToolDefinition[]): ToolRegistry {
  const toolMap = new Map<string, ToolDefinition>();

  // Validate uniqueness and register tools
  for (const tool of tools) {
    if (toolMap.has(tool.name)) {
      // Lazy import to avoid circular dependencies
      throw new Error(
        `Duplicate tool name: "${tool.name}". Each tool must have a unique name.`
      );
    }
    toolMap.set(tool.name, tool);
  }

  return {
    get(name: string): ToolDefinition | undefined {
      return toolMap.get(name);
    },

    has(name: string): boolean {
      return toolMap.has(name);
    },

    names(): string[] {
      return [...toolMap.keys()];
    },

    descriptions(): Array<{ name: string; description: string; parameters: Record<string, unknown> }> {
      return [...toolMap.values()].map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters.jsonSchema,
      }));
    },

    validate(name: string, args: unknown): unknown {
      const tool = toolMap.get(name);
      if (!tool) {
        const available = [...toolMap.keys()].join(', ');
        throw createValidationError(
          `Unknown tool: "${name}"`,
          `Available tools: ${available}`
        );
      }

      try {
        return tool.parameters.parse(args);
      } catch (error) {
        throw createValidationError(
          `Invalid arguments for tool "${name}": ${error instanceof Error ? error.message : String(error)}`,
          `Check the parameter schema for tool "${name}". Expected: ${JSON.stringify(tool.parameters.jsonSchema)}`
        );
      }
    },

    async execute(name: string, args: unknown, context: ToolExecutionContext): Promise<unknown> {
      const tool = toolMap.get(name);
      if (!tool) {
        const available = [...toolMap.keys()].join(', ');
        throw createValidationError(
          `Unknown tool: "${name}"`,
          `Available tools: ${available}`
        );
      }

      // Validate arguments against schema
      let validatedArgs: unknown;
      try {
        validatedArgs = tool.parameters.parse(args);
      } catch (error) {
        throw createValidationError(
          `Invalid arguments for tool "${name}": ${error instanceof Error ? error.message : String(error)}`,
          `Check the parameter schema for tool "${name}".`
        );
      }

      // Execute the tool with validated args
      return tool.execute(validatedArgs, context);
    },
  };
}

/**
 * Create a ValidationError without direct import to avoid circular deps.
 * Uses dynamic import pattern matching existing codebase.
 */
function createValidationError(message: string, hint: string): Error {
  const error = new Error(message);
  error.name = 'ValidationError';
  (error as unknown as Record<string, unknown>).code = 'VALIDATION_ERROR';
  (error as unknown as Record<string, unknown>).hint = hint;
  return error;
}
