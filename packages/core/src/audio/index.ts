/**
 * Audio Domain
 *
 * Audio functions and types for speech and audio processing.
 *
 * @packageDocumentation
 */

// ═══════════════════════════════════════════════════════════════
// FUNCTIONS
// ═══════════════════════════════════════════════════════════════

// Speech-to-Text
export { transcribe, setGlobalSTTProvider } from './transcribe.js';

// Text-to-Speech
export { synthesizeSpeech, setGlobalTTSProvider } from './synthesize-speech.js';

// Streaming Text-to-Speech
export { streamSynthesizeSpeech } from './stream-synthesize-speech.js';
export { splitIntoClauses, DEFAULT_ABBREVIATIONS } from './clause-splitter.js';
export { playStreamedSpeech } from './play-streamed-speech.js';
export type { ClauseSplitOptions } from './clause-splitter.js';

// Audio Classification
export {
  classifyAudio,
  classifyAudioZeroShot,
  setGlobalAudioClassificationProvider,
} from './classify-audio.js';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export * from './types.js';

// ═══════════════════════════════════════════════════════════════
// LIVE TRANSCRIPTION (Streaming STT with VAD)
// ═══════════════════════════════════════════════════════════════

export { createLiveTranscriber } from './live-transcribe.js';
export { createTurnTaker } from './turn-taker.js';

export { EnergyVADProvider } from './vad/energy.js';
export { SileroVADProvider } from './vad/silero.js';
export {
  registerEnergyVADWorklet,
  ENERGY_VAD_PROCESSOR_NAME,
  ENERGY_VAD_WORKLET_SOURCE,
} from './vad/worklet.js';
export { createScriptProcessorVADNode } from './vad/script-processor-fallback.js';

export type {
  // live-transcribe types
  LiveTranscriber,
  LiveTranscriberOptions,
  LiveTranscriberState,
  LiveTranscriberStateChangeEvent,
  LiveTranscriberMode,
  LiveTranscriberVADOption,
  LiveTranscriberUnsubscribe,
  LiveChunk,
  LiveChunkListener,
  LiveUtterance,
  LiveUtteranceListener,
  BargeInEvent,
  LiveBargeInListener,
  LiveErrorListener,
  LiveStateChangeListener,
  AudioPlaybackHandle,
} from './live-transcribe-types.js';

export type {
  // VAD types
  VADProvider,
  VADFrame,
  VADEvent,
  VADStartOptions,
} from './vad/types.js';

export type { EnergyVADProviderOptions } from './vad/energy.js';
export type { SileroVADProviderOptions } from './vad/silero.js';
export type { RegisterEnergyVADWorkletOptions } from './vad/worklet.js';
export type {
  ScriptProcessorVADNode,
  ScriptProcessorVADNodeOptions,
} from './vad/script-processor-fallback.js';

export type {
  // turn-taker types
  TurnTaker,
  TurnTakerOptions,
  TurnTakerState,
  TurnTakerStateTransition,
  TurnTakerUnsubscribe,
  TurnTakerUserUtteranceListener,
  TurnTakerAgentResponseListener,
  TurnTakerStateListener,
  TurnTakerBargeInListener,
  TurnTakerErrorListener,
} from './turn-taker-types.js';
