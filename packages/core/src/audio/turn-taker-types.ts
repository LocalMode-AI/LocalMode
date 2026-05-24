/**
 * Turn-Taker Orchestrator Types
 *
 * Types for the higher-level voice loop (user → planner → agent → user)
 * orchestrator built on top of {@link LiveTranscriber}.
 *
 * @packageDocumentation
 */

import type { LanguageModel } from '../generation/types.js';
import type { TextToSpeechModel } from './types.js';
import type { LiveTranscriber } from './live-transcribe-types.js';

/**
 * Lifecycle state of a {@link TurnTaker}.
 */
export type TurnTakerState =
  | 'idle'
  | 'listening'
  | 'planning'
  | 'speaking'
  | 'error';

/**
 * Event payload describing a state machine transition inside a {@link TurnTaker}.
 */
export interface TurnTakerStateTransition {
  from: TurnTakerState;
  to: TurnTakerState;
  timestamp: Date;
}

/**
 * Options for {@link createTurnTaker}.
 *
 * @example
 * ```ts
 * const turn = await createTurnTaker({
 *   transcriber,
 *   planner: transformers.languageModel('onnx-community/Qwen3.5-0.8B-ONNX'),
 *   voice: transformers.textToSpeech('onnx-community/Kokoro-82M-v1.0-ONNX'),
 *   systemPrompt: 'Be concise.',
 * });
 *
 * turn.onUserUtterance(t => console.log('user:', t));
 * turn.onAgentResponse(t => console.log('agent:', t));
 * await turn.start();
 * ```
 */
export interface TurnTakerOptions {
  /** The live transcriber that drives user-speech capture. */
  transcriber: LiveTranscriber;

  /** Language model that turns user utterances into agent responses. */
  planner: LanguageModel;

  /** Text-to-speech model that voices the agent response. */
  voice: TextToSpeechModel;

  /** System prompt for the planner. Applied on every user utterance. */
  systemPrompt?: string;

  /** Optional callback fired with the agent's text before TTS playback begins. */
  onAgentText?: (text: string) => void;

  /** AbortSignal that, when aborted, halts the loop and disposes resources. */
  abortSignal?: AbortSignal;
}

/** Unsubscribe function for {@link TurnTaker} listeners. */
export type TurnTakerUnsubscribe = () => void;

/** Listener for user utterance ends. */
export type TurnTakerUserUtteranceListener = (transcript: string) => void;

/** Listener for completed agent responses. */
export type TurnTakerAgentResponseListener = (text: string) => void;

/** Listener for state transitions. */
export type TurnTakerStateListener = (event: TurnTakerStateTransition) => void;

/** Listener for barge-in events (voice or programmatic interrupt). */
export type TurnTakerBargeInListener = () => void;

/** Listener for unrecoverable errors. */
export type TurnTakerErrorListener = (error: Error) => void;

/**
 * The voice-loop orchestrator returned by {@link createTurnTaker}.
 */
export interface TurnTaker {
  /** Current state of the orchestrator. */
  readonly state: TurnTakerState;

  /** Begin the voice loop (transitions `idle → listening`). */
  start(): Promise<void>;

  /** Stop the voice loop. Aborts in-flight planner / TTS / capture. */
  stop(): Promise<void>;

  /** Programmatic equivalent of barge-in: aborts planner + TTS, returns to listening. */
  interrupt(): void;

  /** Release all resources. Idempotent. Disposes the underlying transcriber too. */
  dispose(): Promise<void>;

  onUserUtterance(listener: TurnTakerUserUtteranceListener): TurnTakerUnsubscribe;
  onAgentResponse(listener: TurnTakerAgentResponseListener): TurnTakerUnsubscribe;
  onStateTransition(listener: TurnTakerStateListener): TurnTakerUnsubscribe;
  onBargeIn(listener: TurnTakerBargeInListener): TurnTakerUnsubscribe;
  onError(listener: TurnTakerErrorListener): TurnTakerUnsubscribe;
}
