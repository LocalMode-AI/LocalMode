/**
 * @file use-face-tracker.ts
 * @description Hook for real-time face mesh tracking
 */
'use client';

import { type RefObject } from 'react';
import type { FaceLandmarkResultItem } from '@localmode/core';
import { mediapipe } from '../_services/mediapipe.service';
import { useTracker } from './use-tracker';

/**
 * Hook for real-time face mesh tracking over a video element.
 *
 * @param videoRef - Ref to the video element to track
 * @param outputBlendshapes - Whether to compute facial expression blendshapes
 */
export function useFaceTracker(
  videoRef: RefObject<HTMLVideoElement | null>,
  outputBlendshapes: boolean
) {
  return useTracker<FaceLandmarkResultItem>(videoRef, (options) =>
    mediapipe.createFaceTracker({ ...options, outputBlendshapes })
  );
}
