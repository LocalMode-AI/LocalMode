/**
 * @file use-hand-tracker.ts
 * @description Hook for real-time hand landmark tracking
 */
'use client';

import { type RefObject } from 'react';
import type { HandLandmarkResultItem } from '@localmode/core';
import { mediapipe } from '../_services/mediapipe.service';
import { useTracker } from './use-tracker';

/**
 * Hook for real-time hand tracking over a video element.
 *
 * @param videoRef - Ref to the video element to track
 */
export function useHandTracker(videoRef: RefObject<HTMLVideoElement | null>) {
  return useTracker<HandLandmarkResultItem>(videoRef, (options) =>
    mediapipe.createHandTracker(options)
  );
}
