/**
 * @file types.ts
 * @description Type definitions for the meeting-assistant application
 */

/** A single segment of a meeting transcript */
export interface TranscriptSegment {
  /** Unique identifier */
  id: string;
  /** Transcribed text content */
  text: string;
  /** Timestamp label like "00:15" */
  timestamp: string;
}

/** An action item extracted from the meeting */
export interface ActionItem {
  /** Unique identifier */
  id: string;
  /** Action item text */
  text: string;
  /** Whether the action item has been completed */
  completed: boolean;
  /** Priority level */
  priority: 'high' | 'medium' | 'low';
}

/** A complete meeting record */
export interface Meeting {
  /** Unique identifier */
  id: string;
  /** Meeting title */
  title: string;
  /** Transcript segments */
  transcript: TranscriptSegment[];
  /** Generated summary */
  summary: string;
  /** Extracted action items */
  actionItems: ActionItem[];
  /** Blob URL of the uploaded audio */
  audioUrl: string;
  /** When the meeting was created */
  createdAt: Date;
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
