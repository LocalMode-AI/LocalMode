/**
 * @file constants.ts
 * @description Constants for the MediaPipe Studio application
 */
import type { TabInfo } from './types';

/** All studio tabs, grouped by domain */
export const TABS: TabInfo[] = [
  { id: 'hands', label: 'Hands', domain: 'Vision' },
  { id: 'pose', label: 'Pose', domain: 'Vision' },
  { id: 'face', label: 'Face', domain: 'Vision' },
  { id: 'gestures', label: 'Gestures', domain: 'Vision' },
  { id: 'audio', label: 'Audio', domain: 'Audio' },
  { id: 'language', label: 'Language', domain: 'Text' },
  { id: 'text', label: 'Classify & Embed', domain: 'Text' },
];

/** Per-finger colors for hand landmark rendering */
export const FINGER_COLORS = {
  thumb: '#ef4444',
  index: '#f59e0b',
  middle: '#22c55e',
  ring: '#3b82f6',
  pinky: '#a855f7',
  palm: '#e5e7eb',
} as const;

/** Hand landmark index ranges per finger (MediaPipe 21-point topology) */
export const FINGER_RANGES: Array<{ color: string; indices: number[] }> = [
  { color: FINGER_COLORS.thumb, indices: [1, 2, 3, 4] },
  { color: FINGER_COLORS.index, indices: [5, 6, 7, 8] },
  { color: FINGER_COLORS.middle, indices: [9, 10, 11, 12] },
  { color: FINGER_COLORS.ring, indices: [13, 14, 15, 16] },
  { color: FINGER_COLORS.pinky, indices: [17, 18, 19, 20] },
  { color: FINGER_COLORS.palm, indices: [0] },
];

/** Canvas overlay styling */
export const OVERLAY = {
  pointRadius: 4,
  lineWidth: 2,
  poseColor: '#22d3ee',
  faceColor: '#f472b6',
  boxColor: '#22c55e',
} as const;

/** Human-readable gesture labels */
export const GESTURE_LABELS: Record<string, string> = {
  None: 'No gesture',
  Closed_Fist: 'Closed Fist',
  Open_Palm: 'Open Palm',
  Pointing_Up: 'Pointing Up',
  Thumb_Down: 'Thumbs Down',
  Thumb_Up: 'Thumbs Up',
  Victory: 'Victory',
  ILoveYou: 'I Love You',
};

/** Debounce delay (ms) for live language detection */
export const LANGUAGE_DEBOUNCE_MS = 400;

/** Minimum text length before language auto-detection runs */
export const LANGUAGE_MIN_LENGTH = 10;
