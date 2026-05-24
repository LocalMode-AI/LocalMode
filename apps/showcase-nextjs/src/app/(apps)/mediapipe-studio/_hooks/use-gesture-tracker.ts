/**
 * @file use-gesture-tracker.ts
 * @description Hook for real-time hand gesture recognition
 */
'use client';

import { type RefObject } from 'react';
import type { GestureResultItem } from '@localmode/core';
import { mediapipe } from '../_services/mediapipe.service';
import { useTracker } from './use-tracker';

/**
 * Hook for real-time gesture recognition over a video element.
 *
 * @param videoRef - Ref to the video element to track
 */
export function useGestureTracker(videoRef: RefObject<HTMLVideoElement | null>) {
  return useTracker<GestureResultItem>(videoRef, (options) =>
    mediapipe.createGestureTracker(options)
  );
}
