/**
 * @file types.ts
 * @description Type definitions for the voice-notes application
 */

/** A voice note with audio and transcription */
export interface VoiceNote {
  /** Unique identifier */
  id: string;
  /** Blob URL of the recorded audio */
  audioUrl: string;
  /** Transcribed text content */
  text: string;
  /** When the note was created */
  timestamp: Date;
}

/** Application error for UI display */
export interface AppError {
  /** Error message for display */
  message: string;
  /** Error code for programmatic handling */
  code?: string;
  /** Whether the error is recoverable */
  recoverable?: boolean;
}
