/**
 * MediaPipe Streaming Trackers
 *
 * Barrel export for the provider-specific real-time video tracking API.
 *
 * @packageDocumentation
 */

export { createHandTracker } from './hand-tracker.js';
export { createPoseTracker } from './pose-tracker.js';
export { createFaceTracker } from './face-tracker.js';
export { createGestureTracker } from './gesture-tracker.js';

export type {
  TrackerInstance,
  BaseTrackerOptions,
  HandTrackerOptions,
  PoseTrackerOptions,
  FaceTrackerOptions,
  GestureTrackerOptions,
  HandTracker,
  PoseTracker,
  FaceTracker,
  GestureTracker,
} from './types.js';
