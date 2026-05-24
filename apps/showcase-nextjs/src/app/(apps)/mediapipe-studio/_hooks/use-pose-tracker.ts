/**
 * @file use-pose-tracker.ts
 * @description Hook for real-time pose landmark tracking
 */
'use client';

import { type RefObject } from 'react';
import type { PoseLandmarkResultItem } from '@localmode/core';
import { mediapipe } from '../_services/mediapipe.service';
import { useTracker } from './use-tracker';

/**
 * Hook for real-time pose tracking over a video element.
 *
 * @param videoRef - Ref to the video element to track
 */
export function usePoseTracker(videoRef: RefObject<HTMLVideoElement | null>) {
  return useTracker<PoseLandmarkResultItem>(videoRef, (options) =>
    mediapipe.createPoseTracker(options)
  );
}
