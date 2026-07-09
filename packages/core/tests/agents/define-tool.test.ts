/**
 * @file define-tool.test.ts
 * @description Runtime tests for defineTool() — identity and interop with
 * createToolRegistry / the ReAct loop. Type-level inference is covered by
 * define-tool.test-d.ts (compiled via tsconfig.typetest.json).
 */
import { describe, it, expect } from 'vitest';
import { defineTool, createToolRegistry, jsonSchema } from '../../src/index.js';
import type { ToolDefinition } from '../../src/index.js';
import { executeReActLoop } from '../../src/agents/loops.js';
import { createMockLanguageModelForAgent, createMockTool } from '../../src/testing/index.js';

function schemaOf<T>(): { parse: (v: unknown) => T } {
  return { parse: (v: unknown) => v as T };
}

describe('defineTool()', () => {
  it('returns the same object reference at runtime', () => {
    const tool = {
      name: 'echo',
      description: 'Echo the input',
      parameters: jsonSchema(schemaOf<{ value: string }>()),
      execute: async ({ value }: { value: string }) => value,
    };

    expect(defineTool(tool)).toBe(tool);
  });

  it('interops with createToolRegistry in mixed tool arrays', () => {
    const typed = defineTool({
      name: 'calculate',
      description: 'Evaluate an expression',
      parameters: jsonSchema(schemaOf<{ expression: string }>()),
      execute: async ({ expression }) => expression.length,
    });
    const legacy: ToolDefinition = createMockTool('legacy', 'legacy result');

    const registry = createToolRegistry([typed, legacy]);

    expect(registry.has('calculate')).toBe(true);
    expect(registry.has('legacy')).toBe(true);
    expect(registry.names()).toEqual(['calculate', 'legacy']);
  });

  it('executes through the ReAct loop like any tool', async () => {
    const typed = defineTool({
      name: 'lookup',
      description: 'Look up a fact',
      parameters: jsonSchema(schemaOf<{ topic: string }>()),
      execute: async ({ topic }) => `fact about ${topic}`,
    });

    const model = createMockLanguageModelForAgent({
      actionSequence: [
        { type: 'tool_call', tool: 'lookup', args: { topic: 'reactors' } },
        { type: 'finish', result: 'done' },
      ],
    });

    const result = await executeReActLoop({
      model,
      toolRegistry: createToolRegistry([typed]),
      prompt: 'Find a fact',
      maxSteps: 5,
      maxRetries: 1,
      temperature: 0,
    });

    expect(result.finishReason).toBe('finish');
    const toolStep = result.steps.find((s) => s.type === 'tool_call');
    expect(toolStep?.toolName).toBe('lookup');
    expect(toolStep?.observation).toContain('fact about reactors');
  });
});
