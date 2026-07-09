/**
 * @file use-agent.test.ts
 * @description Tests for the useAgent hook — run lifecycle plus the
 * tool-approval surface (pendingApproval/approve/deny). Runs against the
 * real runAgent() from @localmode/core with core mock model/tools; only the
 * model + tool boundaries are mocked (below the hook's claimed boundary).
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { createMockLanguageModelForAgent, createMockTool } from '@localmode/core';
import type { AgentResult, LanguageModel, ToolDefinition } from '@localmode/core';
import { useAgent } from '../src/hooks/use-agent.js';

/** A core mock tool flagged requiresApproval: true. */
function createGatedTool(name = 'search', result: string = 'Found: data') {
  return Object.assign(createMockTool(name, result), { requiresApproval: true });
}

function createModel(
  actionSequence: Array<
    | { type: 'tool_call'; tool: string; args: Record<string, unknown> }
    | { type: 'finish'; result: string }
  >
) {
  return createMockLanguageModelForAgent({ actionSequence });
}

describe('useAgent', () => {
  it('returns initial state with pendingApproval null and no-op approve/deny', () => {
    const tool = createMockTool('search');
    const model = createModel([{ type: 'finish', result: 'x' }]);

    const { result } = renderHook(() =>
      useAgent({
        model: model as unknown as LanguageModel,
        tools: [tool as unknown as ToolDefinition],
      })
    );

    expect(result.current.steps).toEqual([]);
    expect(result.current.result).toBeNull();
    expect(result.current.isRunning).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.pendingApproval).toBeNull();

    // approve/deny are safe no-ops when nothing is pending
    act(() => {
      result.current.approve();
      result.current.deny('nothing pending');
    });
    expect(result.current.pendingApproval).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('runs an ungated agent: pendingApproval stays null, result matches pre-approval behavior', async () => {
    const tool = createMockTool('search', 'Found: info');
    const model = createModel([
      { type: 'tool_call', tool: 'search', args: { query: 'a' } },
      { type: 'finish', result: 'Answer' },
    ]);

    const { result } = renderHook(() =>
      useAgent({
        model: model as unknown as LanguageModel,
        tools: [tool as unknown as ToolDefinition],
      })
    );

    let agentResult: AgentResult | null = null;
    await act(async () => {
      agentResult = await result.current.run('Q');
    });

    expect(agentResult?.finishReason).toBe('finish');
    expect(agentResult?.result).toBe('Answer');
    expect(result.current.result?.result).toBe('Answer');
    expect(result.current.steps).toHaveLength(2);
    expect(result.current.steps[0].approval).toBeUndefined();
    expect(result.current.pendingApproval).toBeNull();
    expect(result.current.isRunning).toBe(false);
    expect(tool.callCount).toBe(1);
  });

  it('exposes pendingApproval (toolName/args/stepIndex) while isRunning on a gated call', async () => {
    const tool = createGatedTool('search', 'Found: quantum article');
    const model = createModel([
      { type: 'tool_call', tool: 'search', args: { query: 'quantum' } },
      { type: 'finish', result: 'The answer.' },
    ]);

    const { result } = renderHook(() =>
      useAgent({
        model: model as unknown as LanguageModel,
        tools: [tool as unknown as ToolDefinition],
      })
    );

    let runPromise: Promise<AgentResult | null>;
    act(() => {
      runPromise = result.current.run('Research quantum computing');
    });

    await waitFor(() => expect(result.current.pendingApproval).not.toBeNull());
    expect(result.current.pendingApproval).toEqual({
      toolName: 'search',
      args: { query: 'quantum' },
      stepIndex: 0,
    });
    expect(result.current.isRunning).toBe(true);
    expect(tool.callCount).toBe(0); // paused — tool not executed

    // approve() resumes the run and clears pendingApproval
    act(() => {
      result.current.approve();
    });
    expect(result.current.pendingApproval).toBeNull();

    let agentResult: AgentResult | null = null;
    await act(async () => {
      agentResult = await runPromise!;
    });
    expect(tool.callCount).toBe(1);
    expect(agentResult?.finishReason).toBe('finish');
    expect(agentResult?.result).toBe('The answer.');
    expect(result.current.steps[0].approval).toEqual({ decision: 'approved' });
    expect(result.current.isRunning).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('deny(reason) records the denied step with the reason and no tool execution', async () => {
    const tool = createGatedTool('deleteFile');
    const model = createModel([
      { type: 'tool_call', tool: 'deleteFile', args: { path: '/tmp/x' } },
      { type: 'finish', result: 'Stopped: denied.' },
    ]);

    const { result } = renderHook(() =>
      useAgent({
        model: model as unknown as LanguageModel,
        tools: [tool as unknown as ToolDefinition],
      })
    );

    let runPromise: Promise<AgentResult | null>;
    act(() => {
      runPromise = result.current.run('Delete the file');
    });

    await waitFor(() => expect(result.current.pendingApproval).not.toBeNull());

    act(() => {
      result.current.deny('not allowed');
    });
    expect(result.current.pendingApproval).toBeNull();

    await act(async () => {
      await runPromise!;
    });

    expect(tool.callCount).toBe(0); // execute never invoked
    const deniedStep = result.current.steps[0];
    expect(deniedStep.approval).toEqual({ decision: 'denied', reason: 'not allowed' });
    expect(deniedStep.observation).toContain('Tool call denied by user: not allowed');
    expect(result.current.result?.finishReason).toBe('finish');
    expect(result.current.isRunning).toBe(false);
  });

  it('cancel() while pending aborts cleanly (no unhandled rejection) and clears pendingApproval', async () => {
    const tool = createGatedTool();
    const model = createModel([
      { type: 'tool_call', tool: 'search', args: { query: 'x' } },
      { type: 'finish', result: 'never' },
    ]);

    const { result } = renderHook(() =>
      useAgent({
        model: model as unknown as LanguageModel,
        tools: [tool as unknown as ToolDefinition],
      })
    );

    let runPromise: Promise<AgentResult | null>;
    act(() => {
      runPromise = result.current.run('Test');
    });

    await waitFor(() => expect(result.current.pendingApproval).not.toBeNull());

    act(() => {
      result.current.cancel();
    });

    // The hook swallows the abort — run() resolves null; awaiting it would
    // surface any unhandled rejection as a test failure
    let settled: AgentResult | null = new Object() as AgentResult;
    await act(async () => {
      settled = await runPromise!;
    });
    expect(settled).toBeNull();
    expect(result.current.pendingApproval).toBeNull();
    expect(result.current.isRunning).toBe(false);
    expect(result.current.error).toBeNull(); // abort is not an error
    expect(tool.callCount).toBe(0); // tool never executed

    // A late approve after cancel is a no-op
    act(() => {
      result.current.approve();
    });
    await new Promise((r) => setTimeout(r, 25));
    expect(tool.callCount).toBe(0);
  });

  it('unmount while pending aborts the run without executing the tool', async () => {
    const tool = createGatedTool();
    const model = createModel([
      { type: 'tool_call', tool: 'search', args: { query: 'x' } },
      { type: 'finish', result: 'never' },
    ]);

    const { result, unmount } = renderHook(() =>
      useAgent({
        model: model as unknown as LanguageModel,
        tools: [tool as unknown as ToolDefinition],
      })
    );

    let runPromise: Promise<AgentResult | null>;
    act(() => {
      runPromise = result.current.run('Test');
    });

    await waitFor(() => expect(result.current.pendingApproval).not.toBeNull());

    unmount();

    // run() resolves null after the unmount-triggered abort — no unhandled rejection
    const settled = await runPromise!;
    expect(settled).toBeNull();
    expect(tool.callCount).toBe(0);
  });

  it('reset() clears steps, result, error, and pending approval', async () => {
    const tool = createGatedTool();
    const model = createModel([
      { type: 'tool_call', tool: 'search', args: { query: 'x' } },
      { type: 'finish', result: 'never' },
    ]);

    const { result } = renderHook(() =>
      useAgent({
        model: model as unknown as LanguageModel,
        tools: [tool as unknown as ToolDefinition],
      })
    );

    let runPromise: Promise<AgentResult | null>;
    act(() => {
      runPromise = result.current.run('Test');
    });

    await waitFor(() => expect(result.current.pendingApproval).not.toBeNull());

    act(() => {
      result.current.reset();
    });

    await act(async () => {
      await runPromise!;
    });

    expect(result.current.steps).toEqual([]);
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.pendingApproval).toBeNull();
    expect(result.current.isRunning).toBe(false);
    expect(tool.callCount).toBe(0);
  });

  it('starting a new run() clears a pending approval from the aborted previous run', async () => {
    const tool = createGatedTool('search', 'Found: data');
    const model = createModel([
      // First run pauses here
      { type: 'tool_call', tool: 'search', args: { query: 'first' } },
      // Second run consumes the rest of the sequence
      { type: 'finish', result: 'Second run answer' },
    ]);

    const { result } = renderHook(() =>
      useAgent({
        model: model as unknown as LanguageModel,
        tools: [tool as unknown as ToolDefinition],
      })
    );

    let firstRun: Promise<AgentResult | null>;
    act(() => {
      firstRun = result.current.run('First');
    });
    await waitFor(() => expect(result.current.pendingApproval).not.toBeNull());

    let secondRun: Promise<AgentResult | null>;
    act(() => {
      secondRun = result.current.run('Second');
    });
    // The stale pending approval is gone immediately after the new run starts
    expect(result.current.pendingApproval).toBeNull();

    let firstSettled: AgentResult | null = new Object() as AgentResult;
    let secondSettled: AgentResult | null = null;
    await act(async () => {
      [firstSettled, secondSettled] = await Promise.all([firstRun!, secondRun!]);
    });

    expect(firstSettled).toBeNull(); // aborted by the new run
    expect(secondSettled?.finishReason).toBe('finish');
    expect(secondSettled?.result).toBe('Second run answer');
    expect(tool.callCount).toBe(0); // first run's gated call never executed
  });
});
