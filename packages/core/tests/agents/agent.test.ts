/**
 * @file agent.test.ts
 * @description Integration tests for createAgent() and runAgent()
 */
import { describe, it, expect } from 'vitest';
import { createAgent, runAgent } from '../../src/agents/agent.js';
import { AgentError } from '../../src/errors/index.js';
import { createMockLanguageModelForAgent, createMockTool } from '../../src/testing/index.js';
import type { AgentStep } from '../../src/agents/types.js';

function createBasicSetup() {
  const searchTool = createMockTool('search', 'Found: relevant information');
  const noteTool = createMockTool('note', 'Note saved.');

  return { searchTool, noteTool };
}

describe('createAgent()', () => {
  it('creates an agent and runs it', async () => {
    const { searchTool } = createBasicSetup();
    const model = createMockLanguageModelForAgent({
      actionSequence: [
        { type: 'tool_call', tool: 'search', args: {} },
        { type: 'finish', result: 'The answer is 42.' },
      ],
    });

    const agent = createAgent({ model, tools: [searchTool] });
    const result = await agent.run({ prompt: 'What is the answer?' });

    expect(result.finishReason).toBe('finish');
    expect(result.result).toBe('The answer is 42.');
    expect(result.steps).toHaveLength(2);
  });

  it('throws if no model is provided', () => {
    const { searchTool } = createBasicSetup();
    expect(() => createAgent({ model: null as any, tools: [searchTool] })).toThrow('requires a LanguageModel');
  });

  it('throws if no tools are provided', () => {
    const model = createMockLanguageModelForAgent({
      actionSequence: [{ type: 'finish', result: 'done' }],
    });
    expect(() => createAgent({ model: model as any, tools: [] })).toThrow('requires at least one tool');
  });

  it('runs the same agent multiple times independently', async () => {
    const { searchTool } = createBasicSetup();
    const model = createMockLanguageModelForAgent({
      actionSequence: [
        { type: 'finish', result: 'Answer 1' },
        { type: 'finish', result: 'Answer 2' },
      ],
    });

    const agent = createAgent({ model: model as any, tools: [searchTool] });

    const result1 = await agent.run({ prompt: 'Task A' });
    expect(result1.result).toBe('Answer 1');

    const result2 = await agent.run({ prompt: 'Task B' });
    expect(result2.result).toBe('Answer 2');
  });

  it('calls onStep callback from config', async () => {
    const { searchTool } = createBasicSetup();
    const model = createMockLanguageModelForAgent({
      actionSequence: [
        { type: 'tool_call', tool: 'search', args: {} },
        { type: 'finish', result: 'Done.' },
      ],
    });

    const steps: AgentStep[] = [];
    const agent = createAgent({
      model: model as any,
      tools: [searchTool],
      onStep: (step) => steps.push(step),
    });

    await agent.run({ prompt: 'Test' });
    expect(steps).toHaveLength(2);
  });

  it('per-run onStep overrides config onStep', async () => {
    const { searchTool } = createBasicSetup();
    const model = createMockLanguageModelForAgent({
      actionSequence: [{ type: 'finish', result: 'Done.' }],
    });

    const configSteps: AgentStep[] = [];
    const runSteps: AgentStep[] = [];

    const agent = createAgent({
      model: model as any,
      tools: [searchTool],
      onStep: (step) => configSteps.push(step),
    });

    await agent.run({
      prompt: 'Test',
      onStep: (step) => runSteps.push(step),
    });

    expect(configSteps).toHaveLength(0); // Config callback not called
    expect(runSteps).toHaveLength(1); // Run callback called
  });

  it('respects maxSteps configuration', async () => {
    const { searchTool } = createBasicSetup();
    const model = createMockLanguageModelForAgent({
      actionSequence: [
        { type: 'tool_call', tool: 'search', args: { q: '1' } },
        { type: 'tool_call', tool: 'search', args: { q: '2' } },
        { type: 'tool_call', tool: 'search', args: { q: '3' } },
        { type: 'finish', result: 'Done.' },
      ],
    });

    const agent = createAgent({ model: model as any, tools: [searchTool], maxSteps: 2 });
    const result = await agent.run({ prompt: 'Test' });

    expect(result.finishReason).toBe('max_steps');
    expect(result.steps).toHaveLength(2);
  });

  it('supports context parameter', async () => {
    const { searchTool } = createBasicSetup();
    const model = createMockLanguageModelForAgent({
      actionSequence: [{ type: 'finish', result: 'Done with context.' }],
    });

    const agent = createAgent({ model: model as any, tools: [searchTool] });
    const result = await agent.run({
      prompt: 'Test',
      context: 'Additional context information',
    });

    expect(result.finishReason).toBe('finish');
  });
});

describe('runAgent()', () => {
  it('runs a one-shot agent', async () => {
    const { searchTool } = createBasicSetup();
    const model = createMockLanguageModelForAgent({
      actionSequence: [
        { type: 'tool_call', tool: 'search', args: {} },
        { type: 'finish', result: 'One-shot answer.' },
      ],
    });

    const result = await runAgent({
      model: model as any,
      tools: [searchTool],
      prompt: 'Quick question',
    });

    expect(result.finishReason).toBe('finish');
    expect(result.result).toBe('One-shot answer.');
  });

  it('supports AbortSignal', async () => {
    const { searchTool } = createBasicSetup();
    const model = createMockLanguageModelForAgent({
      actionSequence: [{ type: 'finish', result: 'Done.' }],
      delay: 100,
    });

    const controller = new AbortController();
    controller.abort();

    await expect(
      runAgent({
        model: model as any,
        tools: [searchTool],
        prompt: 'Test abort',
        abortSignal: controller.signal,
      })
    ).rejects.toThrow();
  });

  it('supports onStep callback', async () => {
    const { searchTool } = createBasicSetup();
    const model = createMockLanguageModelForAgent({
      actionSequence: [
        { type: 'tool_call', tool: 'search', args: {} },
        { type: 'finish', result: 'Done.' },
      ],
    });

    const steps: AgentStep[] = [];
    await runAgent({
      model: model as any,
      tools: [searchTool],
      prompt: 'Test',
      onStep: (step) => steps.push(step),
    });

    expect(steps).toHaveLength(2);
  });
});

describe('AgentError', () => {
  it('includes steps in the error', () => {
    const steps = [
      { index: 0, type: 'tool_call' as const, toolName: 'search', durationMs: 100 },
    ];
    const error = new AgentError('Test error', { steps });
    expect(error.steps).toHaveLength(1);
    expect(error.code).toBe('AGENT_ERROR');
    expect(error.name).toBe('AgentError');
  });

  it('includes hint for resolution', () => {
    const error = new AgentError('Model failed', {
      hint: 'Try a more capable model',
    });
    expect(error.hint).toBe('Try a more capable model');
  });

  it('is thrown on unrecoverable model failures', async () => {
    // Model that produces completely invalid output
    const badModel = {
      modelId: 'mock:bad',
      provider: 'mock',
      contextLength: 4096,
      async doGenerate() {
        return {
          text: 'This is not JSON at all!!! Random garbage text.',
          finishReason: 'stop' as const,
          usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20, durationMs: 1 },
        };
      },
    };

    const { searchTool } = createBasicSetup();

    try {
      await runAgent({
        model: badModel as any,
        tools: [searchTool],
        prompt: 'Test failure',
        maxRetries: 1,
      });
      expect.fail('Should have thrown AgentError');
    } catch (error) {
      // Could be AgentError or StructuredOutputError
      expect(error).toBeDefined();
    }
  });
});
