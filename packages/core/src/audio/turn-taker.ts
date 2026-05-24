/**
 * createTurnTaker()
 *
 * Higher-level voice-loop orchestrator that ties:
 *
 *     user-speech → planner → agent-voice → user-speech
 *
 * into a single state machine. Built on top of {@link createLiveTranscriber}
 * — composes a `LiveTranscriber`, a `LanguageModel`, and a `TextToSpeechModel`.
 *
 * Barge-in semantics: when the user starts speaking while the agent is
 * planning or speaking, the planner and TTS playback are aborted and the
 * orchestrator returns to `'listening'` for the new user utterance.
 *
 * @packageDocumentation
 */

import type {
  AudioPlaybackHandle,
  LiveUtterance,
} from './live-transcribe-types.js';
import type {
  TurnTaker,
  TurnTakerAgentResponseListener,
  TurnTakerBargeInListener,
  TurnTakerErrorListener,
  TurnTakerOptions,
  TurnTakerState,
  TurnTakerStateListener,
  TurnTakerStateTransition,
  TurnTakerUnsubscribe,
  TurnTakerUserUtteranceListener,
} from './turn-taker-types.js';

/**
 * Construct a voice-loop orchestrator.
 *
 * The orchestrator does NOT auto-start. Call `start()` to enter the loop.
 *
 * @example
 * ```ts
 * const transcriber = await createLiveTranscriber({ model: stt, mode: 'open-mic' });
 *
 * const turn = await createTurnTaker({
 *   transcriber,
 *   planner: transformers.languageModel('onnx-community/Qwen3-0.6B-ONNX'),
 *   voice: transformers.textToSpeech('onnx-community/Kokoro-82M-v1.0-ONNX'),
 *   systemPrompt: 'You are a concise assistant.',
 * });
 *
 * turn.onUserUtterance(t => console.log('user:', t));
 * turn.onAgentResponse(t => console.log('agent:', t));
 *
 * await turn.start();
 * ```
 */
export async function createTurnTaker(options: TurnTakerOptions): Promise<TurnTaker> {
  const { transcriber, planner, voice, systemPrompt, onAgentText, abortSignal } = options;

  abortSignal?.throwIfAborted();

  // ── Listener registries ────────────────────────────────────────
  const userUtteranceListeners = new Set<TurnTakerUserUtteranceListener>();
  const agentResponseListeners = new Set<TurnTakerAgentResponseListener>();
  const stateListeners = new Set<TurnTakerStateListener>();
  const bargeInListeners = new Set<TurnTakerBargeInListener>();
  const errorListeners = new Set<TurnTakerErrorListener>();

  // ── Core state ─────────────────────────────────────────────────
  let state: TurnTakerState = 'idle';
  let isDisposed = false;

  // Helper to read state without TypeScript narrowing in async closures
  // (state is mutated from inside transition()).
  const getState = (): TurnTakerState => state;

  let plannerAbort: AbortController | null = null;
  let voicePlayback: AudioPlaybackHandle | null = null;
  let voiceAudioElement: HTMLAudioElement | null = null;
  let voiceObjectUrl: string | null = null;

  // Wired transcriber unsubscribe handles.
  const transcriberUnsubs: Array<() => void> = [];

  const transition = (next: TurnTakerState): void => {
    if (state === next) return;
    const event: TurnTakerStateTransition = {
      from: state,
      to: next,
      timestamp: new Date(),
    };
    state = next;
    for (const listener of stateListeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors.
      }
    }
  };

  const emit = <T>(set: Set<(arg: T) => void>, arg: T): void => {
    for (const listener of set) {
      try {
        listener(arg);
      } catch {
        // Ignore listener errors.
      }
    }
  };

  const emitBargeIn = (): void => {
    for (const listener of bargeInListeners) {
      try {
        listener();
      } catch {
        // Ignore listener errors.
      }
    }
  };

  const stopVoicePlayback = (): void => {
    if (voicePlayback) {
      try {
        const result = voicePlayback.stop();
        if (result instanceof Promise) result.catch(() => {});
      } catch {
        // Ignore.
      }
      voicePlayback = null;
    }
    if (voiceAudioElement) {
      try {
        voiceAudioElement.pause();
        voiceAudioElement.src = '';
      } catch {
        // Ignore.
      }
      voiceAudioElement = null;
    }
    if (voiceObjectUrl) {
      try {
        URL.revokeObjectURL(voiceObjectUrl);
      } catch {
        // Ignore.
      }
      voiceObjectUrl = null;
    }
  };

  const abortPlanner = (): void => {
    plannerAbort?.abort();
    plannerAbort = null;
  };

  const handleBargeIn = (): void => {
    if (state === 'planning' || state === 'speaking') {
      abortPlanner();
      stopVoicePlayback();
      emitBargeIn();
      transition('listening');
    }
  };

  const handleUtterance = async (utterance: LiveUtterance): Promise<void> => {
    if (isDisposed) return;
    if (state !== 'listening') return;

    const transcript = utterance.text.trim();
    if (!transcript) {
      return; // Empty transcript — wait for the next utterance.
    }

    emit(userUtteranceListeners, transcript);
    transition('planning');

    plannerAbort = new AbortController();
    const ctrl = plannerAbort;

    let agentText: string;
    try {
      const result = await planner.doGenerate({
        prompt: transcript,
        systemPrompt,
        abortSignal: ctrl.signal,
      });
      agentText = result.text;
    } catch (err) {
      if (ctrl.signal.aborted) {
        // Aborted — barge-in path already transitioned us.
        return;
      }
      emit(errorListeners, err as Error);
      transition('error');
      return;
    }

    if (ctrl.signal.aborted || getState() !== 'planning') return;

    emit(agentResponseListeners, agentText);
    onAgentText?.(agentText);

    transition('speaking');

    let synthesized;
    try {
      synthesized = await voice.doSynthesize({
        text: agentText,
        abortSignal: ctrl.signal,
      });
    } catch (err) {
      if (ctrl.signal.aborted) return;
      emit(errorListeners, err as Error);
      transition('error');
      return;
    }

    if (ctrl.signal.aborted || getState() !== 'speaking') return;

    // Construct an HTMLAudioElement playback if the environment supports it.
    if (typeof Audio !== 'undefined' && typeof URL !== 'undefined') {
      try {
        const url = URL.createObjectURL(synthesized.audio);
        voiceObjectUrl = url;
        const audioEl = new Audio(url);
        voiceAudioElement = audioEl;

        const handle: AudioPlaybackHandle = {
          isPlaying: () => !audioEl.paused && !audioEl.ended,
          stop: () => {
            try {
              audioEl.pause();
            } catch {
              // Ignore.
            }
          },
        };
        voicePlayback = handle;
        // Wire the playback handle into the transcriber via the existing barge-in path.
        // Since `LiveTranscriberOptions.bargeInWhilePlaying` is set at construction,
        // we monkey-patch by exposing the handle via a dynamic getter the
        // transcriber already polls. Instead, we surface barge-in by invoking the
        // transcriber's `onBargeIn` listeners through a manual interrupt path:
        // we listen for the next utterance start and abort if mid-speak.
        // (See note in design.md decision 5.)

        await new Promise<void>((resolve) => {
          const onEnded = () => {
            audioEl.removeEventListener('ended', onEnded);
            audioEl.removeEventListener('error', onEnded);
            resolve();
          };
          audioEl.addEventListener('ended', onEnded);
          audioEl.addEventListener('error', onEnded);

          // If aborted, resolve immediately so we exit the speaking state.
          if (ctrl.signal.aborted) {
            onEnded();
            return;
          }
          ctrl.signal.addEventListener('abort', onEnded, { once: true });

          audioEl.play().catch(() => {
            // Autoplay block / play failure — resolve so we don't deadlock.
            onEnded();
          });
        });
      } catch (err) {
        emit(errorListeners, err as Error);
      } finally {
        stopVoicePlayback();
      }
    }

    if (getState() === 'speaking') {
      transition('listening');
    }
  };

  // Wire transcriber listeners.
  transcriberUnsubs.push(
    transcriber.onUtteranceEnd((u) => {
      void handleUtterance(u);
    })
  );

  transcriberUnsubs.push(
    transcriber.onBargeIn(() => {
      handleBargeIn();
    })
  );

  transcriberUnsubs.push(
    transcriber.onError((err) => {
      emit(errorListeners, err);
      if (state !== 'idle') transition('error');
    })
  );

  // ── External abort ─────────────────────────────────────────────
  const onExternalAbort = (): void => {
    if (isDisposed) return;
    void disposeImpl();
  };

  if (abortSignal) {
    abortSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  // ── Public API ─────────────────────────────────────────────────
  const start = async (): Promise<void> => {
    if (isDisposed) throw new Error('TurnTaker has been disposed');
    if (state !== 'idle') return;
    transition('listening');
    await transcriber.start();
  };

  const stop = async (): Promise<void> => {
    if (isDisposed) return;
    abortPlanner();
    stopVoicePlayback();
    try {
      await transcriber.stop();
    } catch {
      // Ignore.
    }
    transition('idle');
  };

  const interrupt = (): void => {
    if (isDisposed) return;
    if (state === 'planning' || state === 'speaking') {
      abortPlanner();
      stopVoicePlayback();
      emitBargeIn();
      transition('listening');
    }
  };

  const disposeImpl = async (): Promise<void> => {
    if (isDisposed) return;
    isDisposed = true;
    abortPlanner();
    stopVoicePlayback();
    for (const unsub of transcriberUnsubs) {
      try {
        unsub();
      } catch {
        // Ignore.
      }
    }
    transcriberUnsubs.length = 0;
    try {
      await transcriber.dispose();
    } catch {
      // Ignore.
    }
    if (abortSignal) {
      abortSignal.removeEventListener('abort', onExternalAbort);
    }
    if (state !== 'idle') transition('idle');
    userUtteranceListeners.clear();
    agentResponseListeners.clear();
    bargeInListeners.clear();
    errorListeners.clear();
    stateListeners.clear();
  };

  const dispose = (): Promise<void> => disposeImpl();

  const makeRegister =
    <T>(set: Set<T>) =>
    (listener: T): TurnTakerUnsubscribe => {
      if (isDisposed) return () => {};
      set.add(listener);
      return () => {
        set.delete(listener);
      };
    };

  return {
    get state() {
      return state;
    },
    start,
    stop,
    interrupt,
    dispose,
    onUserUtterance: makeRegister(userUtteranceListeners),
    onAgentResponse: makeRegister(agentResponseListeners),
    onStateTransition: makeRegister(stateListeners),
    onBargeIn: makeRegister(bargeInListeners),
    onError: makeRegister(errorListeners),
  };
}
