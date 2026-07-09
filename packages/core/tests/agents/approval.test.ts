/**
 * @file approval.test.ts
 * @description Tests for human-in-the-loop tool approval gating
 * (agent-tool-approval capability). Exercises the public runAgent()/
 * createAgent() exports — the ReAct loop runs unmodified; mocks sit below
 * the claimed boundary (model + tools only).
 */
import { describe, it, expect, vi } from 'vitest';
import { createAgent, runAgent } from '../../src/agents/agent.js';
import { AgentError } from '../../src/errors/index.js';
import { createMockLanguageModelForAgent, createMockTool } from '../../src/testing/index.js';
import type { ToolApprovalRequest, ToolApprovalDecision } from '../../src/agents/types.js';

/** Deferred approval decision the test resolves manually. */
function createDeferredDecision() {
  let resolve!: (decision: ToolApprovalDecision) => void;
  const promise = new Promise<ToolApprovalDecision>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** A mock tool flagged requiresApproval: true. */
function createGatedTool(name = 'search', result: string = 'Found: data') {
  const tool = createMockTool(name, result);
  return Object.assign(tool, { requiresApproval: true });
}

describe('agent tool approval — gating', () => {
  it('pauses a flagged tool call: execute is not called while the decision is pending', async () => {
    const tool = createGatedTool('search', 'Found: quantum article');
    const model = createMockLanguageModelForAgent({
      actionSequence: [
        { type: 'tool_call', tool: 'search', args: { query: 'quantum' } },
        { type: 'finish', result: 'Done.' },
      ],
    });
    const deferred = createDeferredDecision();
    const requests: ToolApprovalRequest[] = [];

    const runPromise = runAgent({
      model: model as never,
      tools: [tool as never],
      prompt: 'Research quantum computing',
      onToolApproval: (request) => {
        requests.push(request);
        return deferred.promise;
      },
    });

    // Wait until the loop reaches the gate
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toEqual({
      toolName: 'search',
      args: { query: 'quantum' },
      stepIndex: 0,
    });

    // Give a (hypothetically broken) loop time to execute anyway — it must not
    await new Promise((r) => setTimeout(r, 25));
    expect(tool.callCount).toBe(0);

    deferred.resolve({ approved: true });
    const result = await runPromise;
    expect(tool.callCount).toBe(1);
    expect(result.finishReason).toBe('finish');
  });

  it('never consults the callback for unflagged tools', async () => {
    const tool = createMockTool('search', 'Found: info');
    const model = createMockLanguageModelForAgent({
      actionSequence: [
        { type: 'tool_call', tool: 'search', args: { query: 'x' } },
        { type: 'finish', result: 'Done.' },
      ],
    });
    let approvalCalls = 0;

    const result = await runAgent({
      model: model as never,
      tools: [tool as never],
      prompt: 'Test',
      onToolApproval: () => {
        approvalCalls++;
        return { approved: true };
      },
    });

    expect(approvalCalls).toBe(0);
    expect(tool.callCount).toBe(1);
    expect(result.finishReason).toBe('finish');
    expect(result.steps[0].approval).toBeUndefined();
  });

  it('run-level onToolApproval overrides config-level', async () => {
    const tool = createGatedTool();
    const model = createMockLanguageModelForAgent({
      actionSequence: [
        { type: 'tool_call', tool: 'search', args: {} },
        { type: 'finish', result: 'Done.' },
      ],
    });
    let configCalls = 0;
    let runCalls = 0;

    const agent = createAgent({
      model: model as never,
      tools: [tool as never],
      onToolApproval: () => {
        configCalls++;
        return { approved: true };
      },
    });

    const result = await agent.run({
      prompt: 'Test',
      onToolApproval: () => {
        runCalls++;
        return { approved: true };
      },
    });

    expect(configCalls).toBe(0); // config callback not consulted
    expect(runCalls).toBe(1); // run-level callback wins
    expect(result.finishReason).toBe('finish');
  });
});

describe('agent tool approval — approve path', () => {
  it('approve resumes: tool executes with model-proposed args, observation + approval recorded', async () => {
    const tool = createGatedTool('search', 'Found: quantum article');
    const model = createMockLanguageModelForAgent({
      actionSequence: [
        { type: 'tool_call', tool: 'search', args: { query: 'quantum' } },
        { type: 'finish', result: 'The answer.' },
      ],
    });

    const result = await runAgent({
      model: model as never,
      tools: [tool as never],
      prompt: 'Q',
      onToolApproval: async () => ({ approved: true }),
    });

    expect(tool.callCount).toBe(1);
    expect(tool.calls[0].args).toEqual({ query: 'quantum' });

    const toolStep = result.steps[0];
    expect(toolStep.type).toBe('tool_call');
    expect(toolStep.observation).toBe('Found: quantum article');
    expect(toolStep.approval).toEqual({ decision: 'approved' });

    expect(result.finishReason).toBe('finish');
    expect(result.result).toBe('The answer.');
  });
});

describe('agent tool approval — deny path', () => {
  it('deny skips execution, records the reason, and the denial observation reaches the next model prompt', async () => {
    const tool = createGatedTool('deleteFile');
    const model = createMockLanguageModelForAgent({
      actionSequence: [
        { type: 'tool_call', tool: 'deleteFile', args: { path: '/tmp/x' } },
        { type: 'finish', result: 'Stopped: deletion was denied.' },
      ],
    });

    // Capture the exact prompts the model receives (mutate in place to keep getters)
    const prompts: string[] = [];
    const originalDoGenerate = model.doGenerate;
    model.doGenerate = async (opts: { prompt: string; abortSignal?: AbortSignal }) => {
      prompts.push(opts.prompt);
      return originalDoGenerate(opts);
    };

    const result = await runAgent({
      model: model as never,
      tools: [tool as never],
      prompt: 'Delete the file',
      onToolApproval: () => ({ approved: false, reason: 'wrong file' }),
    });

    // Tool execute never invoked
    expect(tool.callCount).toBe(0);

    // Denied step recorded with reason and denial observation
    const deniedStep = result.steps[0];
    expect(deniedStep.type).toBe('tool_call');
    expect(deniedStep.approval).toEqual({ decision: 'denied', reason: 'wrong file' });
    expect(deniedStep.observation).toContain('Tool call denied by user: wrong file');
    expect(deniedStep.observation).toContain('Do not repeat this exact call');

    // The denial observation appears in the NEXT model prompt
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain('Tool call denied by user: wrong file');

    // Loop continued to finish with the denied step preserved
    expect(result.finishReason).toBe('finish');
    expect(result.result).toBe('Stopped: deletion was denied.');
    expect(result.steps).toHaveLength(2);
  });

  it('deny without a reason records a plain denial observation', async () => {
    const tool = createGatedTool('deleteFile');
    const model = createMockLanguageModelForAgent({
      actionSequence: [
        { type: 'tool_call', tool: 'deleteFile', args: { path: '/tmp/x' } },
        { type: 'finish', result: 'OK.' },
      ],
    });

    const result = await runAgent({
      model: model as never,
      tools: [tool as never],
      prompt: 'Delete the file',
      onToolApproval: () => ({ approved: false }),
    });

    expect(tool.callCount).toBe(0);
    expect(result.steps[0].approval).toEqual({ decision: 'denied' });
    expect(result.steps[0].observation).toContain('Tool call denied by user.');
  });

  it('repeated identical denied calls terminate via loop_detected', async () => {
    const tool = createGatedTool('deleteFile');
    const model = createMockLanguageModelForAgent({
      actionSequence: [
        { type: 'tool_call', tool: 'deleteFile', args: { path: '/tmp/x' } },
        { type: 'tool_call', tool: 'deleteFile', args: { path: '/tmp/x' } },
        { type: 'tool_call', tool: 'deleteFile', args: { path: '/tmp/x' } },
      ],
    });
    let denials = 0;

    const result = await runAgent({
      model: model as never,
      tools: [tool as never],
      prompt: 'Delete the file',
      onToolApproval: () => {
        denials++;
        return { approved: false, reason: 'not allowed' };
      },
    });

    expect(result.finishReason).toBe('loop_detected');
    expect(tool.callCount).toBe(0);
    // Third identical call trips the duplicate guard before the gate
    expect(denials).toBe(2);
  });
});

describe('agent tool approval — abort while pending', () => {
  it('abort rejects with the abort error, tool never executes, late approve is ignored', async () => {
    const tool = createGatedTool();
    const model = createMockLanguageModelForAgent({
      actionSequence: [
        { type: 'tool_call', tool: 'search', args: { query: 'x' } },
        { type: 'finish', result: 'Done.' },
      ],
    });
    const deferred = createDeferredDecision();
    const requests: ToolApprovalRequest[] = [];
    const controller = new AbortController();

    const runPromise = runAgent({
      model: model as never,
      tools: [tool as never],
      prompt: 'Test',
      abortSignal: controller.signal,
      onToolApproval: (request) => {
        requests.push(request);
        return deferred.promise;
      },
    });

    await vi.waitFor(() => expect(requests).toHaveLength(1));
    const modelCallsAtAbort = model.callCount;
    controller.abort();

    const error = await runPromise.then(
      () => {
        throw new Error('runAgent should have rejected on abort');
      },
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe('AbortError');
    expect(tool.callCount).toBe(0);

    // Late approval is ignored — the run already settled, tool never runs
    deferred.resolve({ approved: true });
    await new Promise((r) => setTimeout(r, 25));
    expect(tool.callCount).toBe(0);
    expect(model.callCount).toBe(modelCallsAtAbort); // no further model calls
  });
});

describe('agent tool approval — timeout exclusion', () => {
  it('a decision pending past maxDurationMs does not terminate with timeout; totalDurationMs stays wall clock', async () => {
    const tool = createGatedTool('search', 'Found: data');
    const model = createMockLanguageModelForAgent({
      actionSequence: [
        { type: 'tool_call', tool: 'search', args: { query: 'x' } },
        { type: 'finish', result: 'Finished after approval.' },
      ],
    });

    const start = Date.now();
    const result = await runAgent({
      model: model as never,
      tools: [tool as never],
      prompt: 'Test',
      maxDurationMs: 50,
      onToolApproval: async () => {
        // Pend well past the 50ms budget before approving
        await new Promise((r) => setTimeout(r, 150));
        return { approved: true };
      },
    });
    const wallClock = Date.now() - start;

    expect(result.finishReason).toBe('finish'); // NOT 'timeout'
    expect(tool.callCount).toBe(1);
    expect(result.result).toBe('Finished after approval.');
    // totalDurationMs reports reality (includes the ~150ms approval wait)
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(140);
    expect(result.totalDurationMs).toBeLessThanOrEqual(wallClock + 5);
  });
});

describe('agent tool approval — fail-fast + backward compat', () => {
  it('rejects with AgentError before any model call when a gated tool has no callback', async () => {
    const tool = createGatedTool();
    const model = createMockLanguageModelForAgent({
      actionSequence: [{ type: 'finish', result: 'never reached' }],
    });

    const error = await runAgent({
      model: model as never,
      tools: [tool as never],
      prompt: 'Test',
    }).then(
      () => {
        throw new Error('runAgent should have rejected (fail-fast)');
      },
      (e: unknown) => e
    );

    expect(error).toBeInstanceOf(AgentError);
    expect((error as AgentError).message).toContain('requiresApproval');
    expect((error as AgentError).hint).toContain('onToolApproval');
    expect((error as AgentError).hint).toContain('useAgent');
    expect(model.callCount).toBe(0); // zero model calls
    expect(tool.callCount).toBe(0); // zero tool executions
  });

  it('createAgent().run() also fails fast when config- and run-level callbacks are both absent', async () => {
    const tool = createGatedTool();
    const model = createMockLanguageModelForAgent({
      actionSequence: [{ type: 'finish', result: 'never reached' }],
    });

    const agent = createAgent({ model: model as never, tools: [tool as never] });
    await expect(agent.run({ prompt: 'Test' })).rejects.toBeInstanceOf(AgentError);
    expect(model.callCount).toBe(0);
  });

  it('ungated config runs identically to pre-change behavior with no approval field', async () => {
    const tool = createMockTool('search', 'Found: info');
    const model = createMockLanguageModelForAgent({
      actionSequence: [
        { type: 'tool_call', tool: 'search', args: { query: 'a' } },
        { type: 'finish', result: 'Answer' },
      ],
    });

    const result = await runAgent({
      model: model as never,
      tools: [tool as never],
      prompt: 'Q',
    });

    expect(result.finishReason).toBe('finish');
    expect(result.result).toBe('Answer');
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].toolName).toBe('search');
    expect(result.steps[0].toolArgs).toEqual({ query: 'a' });
    expect(result.steps[0].observation).toBe('Found: info');
    expect(tool.callCount).toBe(1);
    // The approval field is entirely absent (not just undefined)
    for (const step of result.steps) {
      expect('approval' in step).toBe(false);
      expect(step.approval).toBeUndefined();
    }
  });
});
