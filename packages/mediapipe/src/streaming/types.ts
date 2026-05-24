/**
 * MediaPipe Streaming Tracker Types
 *
 * Types for the provider-specific real-time video tracking API. Trackers run
 * MediaPipe vision tasks in VIDEO mode over a `<video>` element, invoking a
 * results callback once per processed frame (up to ~60fps).
 *
 * @packageDocumentation
 */

import type {
  HandLandmarkResultItem,
  PoseLandmarkResultItem,
  FaceLandmarkResultItem,
  GestureResultItem,
} from '@localmode/core';
import type { MediaPipeDelegate } from '../types.js';

/**
 * A running real-time tracker over a video element.
 */
export interface TrackerInstance {
  /** Load the model (if needed) and begin the frame-processing loop. */
  start(): Promise<void>;

  /** Pause the frame-processing loop. The model stays loaded. */
  stop(): void;

  /** Stop processing and dispose the underlying MediaPipe task. */
  close(): Promise<void>;

  /** Whether the frame-processing loop is currently running. */
  readonly isRunning: boolean;
}

/** Options common to all streaming trackers. */
export interface BaseTrackerOptions {
  /** The video element to read frames from. */
  video: HTMLVideoElement;

  /** Custom model file URL, overriding the catalog default. */
  modelPath?: string;

  /** Base path for the vision WASM runtime. */
  wasmBasePath?: string;

  /** Inference delegate (default: 'GPU'). */
  delegate?: MediaPipeDelegate;

  /** Called when a frame-processing error occurs. */
  onError?: (error: Error) => void;
}

/** Options for {@link TrackerInstance} hand tracking. */
export interface HandTrackerOptions extends BaseTrackerOptions {
  /** Maximum number of hands to track (default: 2). */
  numHands?: number;

  /** Called once per processed frame with the detected hands. */
  onResults: (hands: HandLandmarkResultItem[], timestampMs: number) => void;
}

/** Options for {@link TrackerInstance} pose tracking. */
export interface PoseTrackerOptions extends BaseTrackerOptions {
  /** Maximum number of poses to track (default: 1). */
  numPoses?: number;

  /** Called once per processed frame with the detected poses. */
  onResults: (poses: PoseLandmarkResultItem[], timestampMs: number) => void;
}

/** Options for {@link TrackerInstance} face mesh tracking. */
export interface FaceTrackerOptions extends BaseTrackerOptions {
  /** Maximum number of faces to track (default: 1). */
  numFaces?: number;

  /** Whether to output facial expression blendshapes. */
  outputBlendshapes?: boolean;

  /** Called once per processed frame with the detected faces. */
  onResults: (faces: FaceLandmarkResultItem[], timestampMs: number) => void;
}

/** Options for {@link TrackerInstance} gesture tracking. */
export interface GestureTrackerOptions extends BaseTrackerOptions {
  /** Maximum number of hands to track (default: 2). */
  numHands?: number;

  /** Called once per processed frame with the recognized gestures. */
  onResults: (gestures: GestureResultItem[], timestampMs: number) => void;
}

/** A real-time hand tracker. */
export type HandTracker = TrackerInstance;

/** A real-time pose tracker. */
export type PoseTracker = TrackerInstance;

/** A real-time face mesh tracker. */
export type FaceTracker = TrackerInstance;

/** A real-time gesture tracker. */
export type GestureTracker = TrackerInstance;
