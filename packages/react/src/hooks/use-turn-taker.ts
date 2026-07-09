/**
 * @file use-turn-taker.ts
 * @description React hook wrapping createTurnTaker() with auto-dispose on unmount
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TurnTaker, TurnTakerOptions, TurnTakerState } from '@localmode/core';

const IS_SERVER = typeof window === 'undefined';

/** A single conversational turn accumulated by {@link useTurnTaker}. */
export interface TurnEntry {
  /** Who produced this turn. */
  role: 'user' | 'agent';
  /** The utterance / response text. */
  text: string;
  /** When the turn was observed by the hook. */
  timestamp: Date;
}

/**
 * Options accepted by {@link useTurnTaker}.
 *
 * Mirrors {@link TurnTakerOptions} but excludes `abortSignal` — the hook
 * owns abort lifecycle via unmount cleanup.
 */
export interface UseTurnTakerOptions extends Omit<TurnTakerOptions, 'abortSignal'> {
  /**
   * Fired when the user barges in (by voice or programmatic `interrupt()`).
   * Also mirrored on the `lastBargeIn` state field.
   */
  onBargeIn?: () => void;
}

/**
 * Return shape of {@link useTurnTaker}.
 */
export interface UseTurnTakerReturn {
  /** Current state of the orchestrator. */
  state: TurnTakerState;
  /** The most recent user utterance text, or null. */
  lastUserUtterance: string | null;
  /** The most recent agent response text, or null. */
  lastAgentResponse: string | null;
  /** Accumulated conversation turns (user + agent, oldest first). */
  turns: TurnEntry[];
  /** When the most recent barge-in fired, or null. */
  lastBargeIn: Date | null;
  /** Latest error, or null. */
  error: Error | null;
  /** True when state === 'listening'. */
  isListening: boolean;
  /** True when state === 'planning'. */
  isPlanning: boolean;
  /** True when state === 'speaking'. */
  isSpeaking: boolean;
  /** Begin the voice loop. Lazily constructs on first call. */
  start: () => Promise<void>;
  /** Stop the voice loop. */
  stop: () => Promise<void>;
  /** Programmatic barge-in. */
  interrupt: () => void;
  /** Dispose. */
  dispose: () => Promise<void>;
  /** Clear the accumulated `turns` list. */
  clearTurns: () => void;
}

/**
 * Hook wrapping {@link createTurnTaker} for React components.
 *
 * Lazy-constructs the orchestrator on the first `start()` call so the
 * underlying transcriber's `getUserMedia` prompt happens during a user
 * gesture. Auto-disposes on unmount. Accumulates both sides of the
 * conversation in `turns` for transcript rendering.
 *
 * @example
 * ```tsx
 * const turn = useTurnTaker({ transcriber, planner, voice, systemPrompt: 'Be concise.' });
 *
 * return (
 *   <>
 *     <button onClick={turn.start}>
 *       {turn.isListening ? 'Listening…' : 'Start'}
 *     </button>
 *     <ul>{turn.turns.map((t, i) => <li key={i}>{t.role}: {t.text}</li>)}</ul>
 *   </>
 * );
 * ```
 */
export function useTurnTaker(options: UseTurnTakerOptions): UseTurnTakerReturn {
  const [state, setState] = useState<TurnTakerState>('idle');
  const [lastUserUtterance, setLastUserUtterance] = useState<string | null>(null);
  const [lastAgentResponse, setLastAgentResponse] = useState<string | null>(null);
  const [turns, setTurns] = useState<TurnEntry[]>([]);
  const [lastBargeIn, setLastBargeIn] = useState<Date | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const orchestratorRef = useRef<TurnTaker | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const t = orchestratorRef.current;
      orchestratorRef.current = null;
      if (t) {
        t.dispose().catch(() => {});
      }
    };
  }, []);

  const ensureOrchestrator = useCallback(async (): Promise<TurnTaker | null> => {
    if (IS_SERVER) return null;
    if (orchestratorRef.current) return orchestratorRef.current;

    const { createTurnTaker } = await import('@localmode/core');
    // Strip the hook-level onBargeIn callback — it is wired through the
    // orchestrator's listener below, not through the core options.
    const { onBargeIn, ...coreOptions } = optionsRef.current;
    const orchestrator = await createTurnTaker(coreOptions);
    if (!mountedRef.current) {
      orchestrator.dispose().catch(() => {});
      return null;
    }
    orchestratorRef.current = orchestrator;

    orchestrator.onStateTransition((event) => {
      if (!mountedRef.current) return;
      setState(event.to);
    });

    orchestrator.onUserUtterance((text) => {
      if (!mountedRef.current) return;
      setLastUserUtterance(text);
      setTurns((prev) => [...prev, { role: 'user', text, timestamp: new Date() }]);
    });

    orchestrator.onAgentResponse((text) => {
      if (!mountedRef.current) return;
      setLastAgentResponse(text);
      setTurns((prev) => [...prev, { role: 'agent', text, timestamp: new Date() }]);
    });

    orchestrator.onBargeIn(() => {
      if (!mountedRef.current) return;
      setLastBargeIn(new Date());
      // Read through the ref so callers can pass inline lambdas.
      optionsRef.current.onBargeIn?.();
    });

    orchestrator.onError((err) => {
      if (!mountedRef.current) return;
      setError(err);
    });

    return orchestrator;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    const t = await ensureOrchestrator();
    if (!t) return;
    await t.start();
  }, [ensureOrchestrator]);

  const stop = useCallback(async () => {
    const t = orchestratorRef.current;
    if (!t) return;
    await t.stop();
  }, []);

  const interrupt = useCallback(() => {
    orchestratorRef.current?.interrupt();
  }, []);

  const dispose = useCallback(async () => {
    const t = orchestratorRef.current;
    orchestratorRef.current = null;
    if (!t) return;
    await t.dispose();
  }, []);

  const clearTurns = useCallback(() => {
    setTurns([]);
  }, []);

  if (IS_SERVER) {
    return {
      state: 'idle',
      lastUserUtterance: null,
      lastAgentResponse: null,
      turns: [],
      lastBargeIn: null,
      error: null,
      isListening: false,
      isPlanning: false,
      isSpeaking: false,
      start: async () => {},
      stop: async () => {},
      interrupt: () => {},
      dispose: async () => {},
      clearTurns: () => {},
    };
  }

  return {
    state,
    lastUserUtterance,
    lastAgentResponse,
    turns,
    lastBargeIn,
    error,
    isListening: state === 'listening',
    isPlanning: state === 'planning',
    isSpeaking: state === 'speaking',
    start,
    stop,
    interrupt,
    dispose,
    clearTurns,
  };
}
