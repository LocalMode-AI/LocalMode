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
