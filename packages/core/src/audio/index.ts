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

// Text-to-Speech (P2)
export { synthesizeSpeech, setGlobalTTSProvider } from './synthesize-speech.js';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export * from './types.js';
