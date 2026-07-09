/**
 * @file use-turn-taker.test.ts
 * @description Tests for the useTurnTaker React hook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTurnTaker } from '../src/hooks/use-turn-taker.js';

vi.mock('@localmode/core', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@localmode/core');

  class FakeTurnTaker {
    state: 'idle' | 'listening' | 'planning' | 'speaking' | 'error' = 'idle';
    private userListeners = new Set<(s: string) => void>();
    private agentListeners = new Set<(s: string) => void>();
    private stateListeners = new Set<(e: { from: string; to: string }) => void>();
    private bargeInListeners = new Set<() => void>();
    private errorListeners = new Set<(e: Error) => void>();
    interruptCalls = 0;

    async start() {
      const prev = this.state;
      this.state = 'listening';
      for (const l of this.stateListeners) l({ from: prev, to: 'listening' });
    }
    async stop() {
      const prev = this.state;
      this.state = 'idle';
      for (const l of this.stateListeners) l({ from: prev, to: 'idle' });
    }
    interrupt() {
      this.interruptCalls++;
      const prev = this.state;
      this.state = 'listening';
      for (const l of this.stateListeners) l({ from: prev, to: 'listening' });
    }
    async dispose() {
      this.state = 'idle';
    }
    onUserUtterance(l: (s: string) => void) {
      this.userListeners.add(l);
      return () => this.userListeners.delete(l);
    }
    onAgentResponse(l: (s: string) => void) {
      this.agentListeners.add(l);
      return () => this.agentListeners.delete(l);
    }
    onStateTransition(l: (e: { from: string; to: string }) => void) {
      this.stateListeners.add(l);
      return () => this.stateListeners.delete(l);
    }
    onBargeIn(l: () => void) {
      this.bargeInListeners.add(l);
      return () => this.bargeInListeners.delete(l);
    }
    onError(l: (e: Error) => void) {
      this.errorListeners.add(l);
      return () => this.errorListeners.delete(l);
    }

    fireUserUtterance(text: string) {
      for (const l of this.userListeners) l(text);
    }
    fireAgentResponse(text: string) {
      for (const l of this.agentListeners) l(text);
    }
    fireState(from: string, to: string) {
      this.state = to as typeof this.state;
      for (const l of this.stateListeners) l({ from, to });
    }
    fireBargeIn() {
      for (const l of this.bargeInListeners) l();
    }
  }

  const created: FakeTurnTaker[] = [];
  (globalThis as unknown as { __lastFakeTT__?: () => FakeTurnTaker }).__lastFakeTT__ = () =>
    created[created.length - 1];

  return {
    ...actual,
    createTurnTaker: vi.fn(async () => {
      const t = new FakeTurnTaker();
      created.push(t);
      return t;
    }),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const dummyOptions = () => ({
  // The mock ignores these — they only need to be type-acceptable.
  transcriber: {} as never,
  planner: {} as never,
  voice: {} as never,
});

describe('useTurnTaker', () => {
  it('does NOT auto-construct on mount', async () => {
    const { createTurnTaker } = await import('@localmode/core');
    renderHook(() => useTurnTaker(dummyOptions()));
    expect(createTurnTaker).not.toHaveBeenCalled();
  });

  it('boolean fields derive from state', async () => {
    const { result } = renderHook(() => useTurnTaker(dummyOptions()));

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe('listening');
    expect(result.current.isListening).toBe(true);
    expect(result.current.isPlanning).toBe(false);
    expect(result.current.isSpeaking).toBe(false);

    const fake = (globalThis as unknown as { __lastFakeTT__: () => { fireState(f: string, t: string): void } }).__lastFakeTT__();

    await act(async () => {
      fake.fireState('listening', 'planning');
    });
    expect(result.current.isPlanning).toBe(true);
    expect(result.current.isListening).toBe(false);

    await act(async () => {
      fake.fireState('planning', 'speaking');
    });
    expect(result.current.isSpeaking).toBe(true);
  });

  it('lastUserUtterance / lastAgentResponse update on events', async () => {
    const { result } = renderHook(() => useTurnTaker(dummyOptions()));

    await act(async () => {
      await result.current.start();
    });

    const fake = (globalThis as unknown as { __lastFakeTT__: () => { fireUserUtterance(s: string): void; fireAgentResponse(s: string): void } }).__lastFakeTT__();

    await act(async () => {
      fake.fireUserUtterance('first user');
    });
    expect(result.current.lastUserUtterance).toBe('first user');

    await act(async () => {
      fake.fireUserUtterance('second user');
    });
    expect(result.current.lastUserUtterance).toBe('second user');

    await act(async () => {
      fake.fireAgentResponse('agent reply');
    });
    expect(result.current.lastAgentResponse).toBe('agent reply');
  });

  it('interrupt() forwards to the orchestrator', async () => {
    const { result } = renderHook(() => useTurnTaker(dummyOptions()));

    await act(async () => {
      await result.current.start();
    });

    const fake = (globalThis as unknown as { __lastFakeTT__: () => { interruptCalls: number; state: string; fireState(f: string, t: string): void } }).__lastFakeTT__();

    // Move to planning so interrupt has effect.
    await act(async () => {
      fake.fireState('listening', 'planning');
    });

    await act(async () => {
      result.current.interrupt();
    });

    expect(fake.interruptCalls).toBe(1);
    expect(result.current.state).toBe('listening');
  });

  it('disposes on unmount', async () => {
    const { result, unmount } = renderHook(() => useTurnTaker(dummyOptions()));

    await act(async () => {
      await result.current.start();
    });

    const fake = (globalThis as unknown as { __lastFakeTT__: () => { state: string } }).__lastFakeTT__();
    expect(fake.state).toBe('listening');

    unmount();
    await new Promise((r) => setTimeout(r, 0));
    // After dispose() the FakeTurnTaker resets to 'idle'.
    expect(fake.state).toBe('idle');
  });

  it('accumulates user + agent turns in order and clears via clearTurns()', async () => {
    const { result } = renderHook(() => useTurnTaker(dummyOptions()));

    expect(result.current.turns).toEqual([]);

    await act(async () => {
      await result.current.start();
    });

    const fake = (globalThis as unknown as { __lastFakeTT__: () => { fireUserUtterance(s: string): void; fireAgentResponse(s: string): void } }).__lastFakeTT__();

    await act(async () => {
      fake.fireUserUtterance('hello agent');
    });
    await act(async () => {
      fake.fireAgentResponse('hello user');
    });
    await act(async () => {
      fake.fireUserUtterance('follow-up');
    });

    expect(result.current.turns.length).toBe(3);
    expect(result.current.turns[0]).toMatchObject({ role: 'user', text: 'hello agent' });
    expect(result.current.turns[1]).toMatchObject({ role: 'agent', text: 'hello user' });
    expect(result.current.turns[2]).toMatchObject({ role: 'user', text: 'follow-up' });
    for (const turn of result.current.turns) {
      expect(turn.timestamp).toBeInstanceOf(Date);
    }

    // Existing last* behavior unchanged.
    expect(result.current.lastUserUtterance).toBe('follow-up');
    expect(result.current.lastAgentResponse).toBe('hello user');

    act(() => {
      result.current.clearTurns();
    });

    expect(result.current.turns).toEqual([]);
    // clearTurns does NOT clear the last* fields.
    expect(result.current.lastUserUtterance).toBe('follow-up');
  });

  it('surfaces barge-in via lastBargeIn state and the onBargeIn option', async () => {
    const onBargeIn = vi.fn();
    const { result } = renderHook(() => useTurnTaker({ ...dummyOptions(), onBargeIn }));

    expect(result.current.lastBargeIn).toBeNull();

    await act(async () => {
      await result.current.start();
    });

    const fake = (globalThis as unknown as { __lastFakeTT__: () => { fireBargeIn(): void } }).__lastFakeTT__();

    await act(async () => {
      fake.fireBargeIn();
    });

    expect(result.current.lastBargeIn).toBeInstanceOf(Date);
    expect(onBargeIn).toHaveBeenCalledTimes(1);

    const first = result.current.lastBargeIn;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
      fake.fireBargeIn();
    });
    expect(onBargeIn).toHaveBeenCalledTimes(2);
    expect(result.current.lastBargeIn!.getTime()).toBeGreaterThanOrEqual(first!.getTime());
  });
});
