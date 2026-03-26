/**
 * @file constants.ts
 * @description App constants and configuration for meeting-assistant
 */

/** Moonshine model configuration for transcription */
export const WHISPER_MODEL_ID = 'onnx-community/moonshine-base-ONNX';
export const WHISPER_MODEL_SIZE = '~237MB';

/** Summarizer model configuration */
export const SUMMARIZER_MODEL_ID = 'Xenova/distilbart-cnn-6-6';
export const SUMMARIZER_MODEL_SIZE = '~200MB';

/** Accepted audio MIME types for upload */
export const ACCEPTED_AUDIO_TYPES = [
  'audio/mp3',
  'audio/wav',
  'audio/mpeg',
  'audio/webm',
  'audio/x-m4a',
  'audio/mp4',
] as const;

/** File extensions for display */
export const ACCEPTED_EXTENSIONS = '.mp3, .wav, .webm, .m4a, .mp4';

/** Regex patterns for extracting action items from text */
export const ACTION_VERB_PATTERNS = [
  /(?:we |i |they |you |he |she )?need(?:s)? to\s+(.+?)(?:\.|$)/gim,
  /(?:we |i |they |you |he |she )?should\s+(.+?)(?:\.|$)/gim,
  /(?:we |i |they |you |he |she )?will\s+(.+?)(?:\.|$)/gim,
  /(?:we |i |they |you |he |she )?must\s+(.+?)(?:\.|$)/gim,
  /action item[:\s]+(.+?)(?:\.|$)/gim,
  /todo[:\s]+(.+?)(?:\.|$)/gim,
  /follow(?:\s|-)?up[:\s]+(.+?)(?:\.|$)/gim,
  /(?:we |i |they |you |he |she )?have to\s+(.+?)(?:\.|$)/gim,
  /(?:let'?s|let us)\s+(.+?)(?:\.|$)/gim,
  /(?:make sure|ensure)\s+(?:to\s+)?(.+?)(?:\.|$)/gim,
] as const;

/** Priority keywords for action item scoring */
export const PRIORITY_KEYWORDS = {
  high: ['urgent', 'asap', 'immediately', 'critical', 'must', 'deadline', 'blocker'],
  medium: ['should', 'need', 'important', 'soon', 'follow up', 'follow-up'],
  low: ['could', 'nice to have', 'eventually', 'consider', 'maybe', 'might'],
} as const;
