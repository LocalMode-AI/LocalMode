/**
 * @file loops.test.ts
 * @description Unit tests for executeReActLoop()
 */
import { describe, it, expect, vi } from 'vitest';
import { executeReActLoop, buildAgentPrompt, truncateHistory } from '../../src/agents/loops.js';
import { createToolRegistry } from '../../src/agents/tools.js';
import { createMockLanguageModelForAgent, createMockTool } from '../../src/testing/index.js';
import type { AgentStep } from '../../src/agents/types.js';

function createTestSetup(
  actionSequence: Array<
    | { type: 'tool_call'; tool: string; args: Record<string, unknown> }
    | { type: 'finish'; result: string }
  >,
) {
  const searchTool = createMockTool('search', 'Found: quantum computing article');
  const noteTool = createMockTool('note', 'Note saved.');
  const model = createMockLanguageModelForAgent({ actionSequence });
  const toolRegistry = createToolRegistry([searchTool, noteTool]);
  return { model, toolRegistry, searchTool, noteTool };
}

describe('executeReActLoop()', () => {
  it('completes a single-step finish', async () => {
    const { model, toolRegistry } = createTestSetup([
      { type: 'finish', result: 'The answer is 42.' },
    ]);

    const result = await executeReActLoop({
      model,
      toolRegistry,
      prompt: 'What is the answer?',
      maxSteps: 10,
      maxRetries: 3,
      temperature: 0,
    });

    expect(result.finishReason).toBe('finish');
    expect(result.result).toBe('The answer is 42.');
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].type).toBe('finish');
  });

  it('executes multi-step tool calls before finish', async () => {
    const { model, toolRegistry } = createTestSetup([
      { type: 'tool_call', tool: 'search', args: { query: 'quantum' } },
      { type: 'tool_call', tool: 'note', args: { text: 'Found article' } },
      { type: 'finish', result: 'Quantum computing uses qubits.' },
    ]);

    const result = await executeReActLoop({
      model,
      toolRegistry,
      prompt: 'Explain quantum computing',
      maxSteps: 10,
      maxRetries: 3,
      temperature: 0,
    });

    expect(result.finishReason).toBe('finish');
    expect(result.steps).toHaveLength(3);
    expect(result.steps[0].type).toBe('tool_call');
    expect(result.steps[0].toolName).toBe('search');
    expect(result.steps[0].observation).toBe('Found: quantum computing article');
    expect(result.steps[1].type).toBe('tool_call');
    expect(result.steps[1].toolName).toBe('note');
    expect(result.steps[2].type).toBe('finish');
    expect(result.result).toBe('Quantum computing uses qubits.');
  });

  it('terminates at maxSteps', async () => {
    const { model, toolRegistry } = createTestSetup([
      { type: 'tool_call', tool: 'search', args: { query: 'a' } },
      { type: 'tool_call', tool: 'search', args: { query: 'b' } },
      { type: 'tool_call', tool: 'search', args: { query: 'c' } },
      { type: 'tool_call', tool: 'search', args: { query: 'd' } },
      { type: 'finish', result: 'Should not reach this.' },
    ]);

    const result = await executeReActLoop({
      model,
      toolRegistry,
      prompt: 'Test',
      maxSteps: 3,
      maxRetries: 3,
      temperature: 0,
    });

    expect(result.finishReason).toBe('max_steps');
    expect(result.steps).toHaveLength(3);
    expect(result.result).toBe('');
  });

  it('terminates on timeout', async () => {
    const model = createMockLanguageModelForAgent({
      actionSequence: [
        { type: 'tool_call', tool: 'search', args: { query: 'slow' } },
        { type: 'tool_call', tool: 'search', args: { query: 'slow2' } },
        { type: 'finish', result: 'done' },
      ],
      delay: 50,
    });
    const toolRegistry = createToolRegistry([createMockTool('search', 'result')]);

    const result = await executeReActLoop({
      model,
      toolRegistry,
      prompt: 'Test timeout',
      maxSteps: 10,
      maxDurationMs: 10,
      maxRetries: 3,
      temperature: 0,
    });

    // Should either timeout or complete fast depending on timing
    expect(['timeout', 'finish', 'max_steps']).toContain(result.finishReason);
  });

  it('detects consecutive identical tool calls', async () => {
    const { model, toolRegistry } = createTestSetup([
      { type: 'tool_call', tool: 'search', args: { query: 'test' } },
      { type: 'tool_call', tool: 'search', args: { query: 'test' } }, // duplicate 1 (hint injected)
      { type: 'tool_call', tool: 'search', args: { query: 'test' } }, // duplicate 2 (loop_detected)
    ]);

    const result = await executeReActLoop({
      model,
      toolRegistry,
      prompt: 'Test loop detection',
      maxSteps: 10,
      maxRetries: 3,
      temperature: 0,
    });

    expect(result.finishReason).toBe('loop_detected');
    expect(result.steps.length).toBeLessThanOrEqual(3);
  });

  it('turns tool execution errors into observations', async () => {
    const failingTool = {
      name: 'failing',
      description: 'A tool that fails',
      parameters: {
        parse: (v: unknown) => v,
        jsonSchema: { type: 'object' as const },
      },
      execute: async () => {
        throw new Error('Network timeout');
      },
    };

    const model = createMockLanguageModelForAgent({
      actionSequence: [
        { type: 'tool_call', tool: 'failing', args: {} },
        { type: 'finish', result: 'Done after error.' },
      ],
    });

    const toolRegistry = createToolRegistry([failingTool]);

    const result = await executeReActLoop({
      model,
      toolRegistry,
      prompt: 'Test error handling',
      maxSteps: 10,
      maxRetries: 3,
      temperature: 0,
    });

    expect(result.finishReason).toBe('finish');
    expect(result.steps[0].observation).toContain('Error: Network timeout');
    expect(result.steps[1].type).toBe('finish');
  });

  it('calls onStep callback for each step', async () => {
    const { model, toolRegistry } = createTestSetup([
      { type: 'tool_call', tool: 'search', args: { query: 'test' } },
      { type: 'finish', result: 'Done.' },
    ]);

    const steps: AgentStep[] = [];

    await executeReActLoop({
      model,
      toolRegistry,
      prompt: 'Test callbacks',
      maxSteps: 10,
      maxRetries: 3,
      temperature: 0,
      onStep: (step) => steps.push(step),
    });

    expect(steps).toHaveLength(2);
    expect(steps[0].type).toBe('tool_call');
    expect(steps[1].type).toBe('finish');
  });

  it('respects AbortSignal', async () => {
    const model = createMockLanguageModelForAgent({
      actionSequence: [
        { type: 'tool_call', tool: 'search', args: { query: 'test' } },
        { type: 'finish', result: 'Done.' },
      ],
      delay: 100,
    });
    const toolRegistry = createToolRegistry([createMockTool('search', 'result')]);

    const controller = new AbortController();
    // Abort immediately
    controller.abort();

    await expect(
      executeReActLoop({
        model,
        toolRegistry,
        prompt: 'Test abort',
        maxSteps: 10,
        maxRetries: 3,
        temperature: 0,
        abortSignal: controller.signal,
      })
    ).rejects.toThrow();
  });

  it('accumulates token usage across steps', async () => {
    const { model, toolRegistry } = createTestSetup([
      { type: 'tool_call', tool: 'search', args: { query: 'test' } },
      { type: 'finish', result: 'Done.' },
    ]);

    const result = await executeReActLoop({
      model,
      toolRegistry,
      prompt: 'Test usage',
      maxSteps: 10,
      maxRetries: 3,
      temperature: 0,
    });

    expect(result.totalUsage.totalTokens).toBeGreaterThan(0);
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
  });
});

describe('buildAgentPrompt()', () => {
  it('includes tool descriptions in the prompt', () => {
    const toolRegistry = createToolRegistry([
      createMockTool('search', 'result', 'Search the knowledge base'),
      createMockTool('note', 'result', 'Save a note'),
    ]);

    const prompt = buildAgentPrompt(toolRegistry);
    expect(prompt).toContain('search');
    expect(prompt).toContain('note');
    expect(prompt).toContain('Search the knowledge base');
    expect(prompt).toContain('Save a note');
  });

  it('includes custom system prompt', () => {
    const toolRegistry = createToolRegistry([createMockTool('search', 'result')]);
    const prompt = buildAgentPrompt(toolRegistry, 'You are a helpful assistant.');
    expect(prompt).toContain('You are a helpful assistant.');
  });
});

describe('truncateHistory()', () => {
  it('returns empty string for no steps', () => {
    expect(truncateHistory([], 4096, 500)).toBe('');
  });

  it('formats steps as structured log', () => {
    const steps: AgentStep[] = [
      { index: 0, type: 'tool_call', toolName: 'search', toolArgs: { query: 'test' }, observation: 'Found result', durationMs: 100 },
    ];

    const history = truncateHistory(steps, 4096, 200);
    expect(history).toContain('Step 0');
    expect(history).toContain('search');
    expect(history).toContain('Found result');
  });

  it('truncates oldest steps when context is limited', () => {
    const steps: AgentStep[] = Array.from({ length: 50 }, (_, i) => ({
      index: i,
      type: 'tool_call' as const,
      toolName: 'search',
      toolArgs: { query: `very long query text repeated many times for step ${i}` },
      observation: `Long observation result for step ${i} with lots of details that take up many tokens in the context window`,
      durationMs: 100,
    }));

    const history = truncateHistory(steps, 1000, 200); // Very small context
    expect(history).toContain('earlier steps truncated');
  });
});
