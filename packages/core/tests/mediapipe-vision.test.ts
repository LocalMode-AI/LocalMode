/**
 * MediaPipe Vision Function Tests
 *
 * Tests for detectHands(), detectPose(), detectFace(), detectFaceLandmarks(),
 * recognizeGesture(), and landmark topology constants.
 */

import { describe, it, expect } from 'vitest';
import {
  detectHands,
  detectPose,
  detectFace,
  detectFaceLandmarks,
  recognizeGesture,
  HAND_CONNECTIONS,
  POSE_CONNECTIONS,
  FACE_CONNECTIONS,
  GESTURE_CATEGORIES,
} from '../src/index.js';
import {
  createMockHandLandmarkModel,
  createMockPoseLandmarkModel,
  createMockFaceDetectionModel,
  createMockFaceLandmarkModel,
  createMockGestureRecognitionModel,
} from '../src/testing/index.js';

const testImage = 'https://example.com/test.jpg';

describe('detectHands()', () => {
  it('returns hands with 21 landmarks, handedness, score, usage, response', async () => {
    const result = await detectHands({
      model: createMockHandLandmarkModel({ handCount: 2 }),
      image: testImage,
    });

    expect(result.hands).toHaveLength(2);
    expect(result.hands[0].landmarks).toHaveLength(21);
    expect(result.hands[0].worldLandmarks).toHaveLength(21);
    expect(['Left', 'Right']).toContain(result.hands[0].handedness);
    expect(result.hands[0].score).toBeGreaterThan(0);
    expect(result.usage.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.response.modelId).toBe('mock:hand-landmarker');
    expect(result.response.timestamp).toBeInstanceOf(Date);
  });

  it('respects numHands limit', async () => {
    const result = await detectHands({
      model: createMockHandLandmarkModel({ handCount: 2 }),
      image: testImage,
      numHands: 1,
    });
    expect(result.hands).toHaveLength(1);
  });

  it('returns empty array when no hands detected', async () => {
    const result = await detectHands({
      model: createMockHandLandmarkModel({ handCount: 0 }),
      image: testImage,
    });
    expect(result.hands).toEqual([]);
    expect(result.usage.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('rejects immediately with a pre-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      detectHands({
        model: createMockHandLandmarkModel(),
        image: testImage,
        abortSignal: controller.signal,
      })
    ).rejects.toThrow();
  });
});

describe('detectPose()', () => {
  it('returns poses with 33 landmarks', async () => {
    const result = await detectPose({
      model: createMockPoseLandmarkModel(),
      image: testImage,
    });
    expect(result.poses).toHaveLength(1);
    expect(result.poses[0].landmarks).toHaveLength(33);
    expect(result.poses[0].worldLandmarks).toHaveLength(33);
    expect(result.response.modelId).toBe('mock:pose-landmarker');
  });

  it('returns empty array when no pose detected', async () => {
    const result = await detectPose({
      model: createMockPoseLandmarkModel({ poseCount: 0 }),
      image: testImage,
    });
    expect(result.poses).toEqual([]);
  });

  it('rejects immediately with a pre-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      detectPose({
        model: createMockPoseLandmarkModel(),
        image: testImage,
        abortSignal: controller.signal,
      })
    ).rejects.toThrow();
  });
});

describe('detectFace()', () => {
  it('returns faces with box, score, and 6 keypoints', async () => {
    const result = await detectFace({
      model: createMockFaceDetectionModel(),
      image: testImage,
    });
    expect(result.faces).toHaveLength(1);
    expect(result.faces[0].box).toMatchObject({
      x: expect.any(Number),
      y: expect.any(Number),
      width: expect.any(Number),
      height: expect.any(Number),
    });
    expect(result.faces[0].keypoints).toHaveLength(6);
    expect(result.faces[0].score).toBeGreaterThan(0);
  });

  it('returns multiple faces', async () => {
    const result = await detectFace({
      model: createMockFaceDetectionModel({ faceCount: 3 }),
      image: testImage,
    });
    expect(result.faces).toHaveLength(3);
  });

  it('rejects immediately with a pre-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      detectFace({
        model: createMockFaceDetectionModel(),
        image: testImage,
        abortSignal: controller.signal,
      })
    ).rejects.toThrow();
  });
});

describe('detectFaceLandmarks()', () => {
  it('returns faces with 478 mesh landmarks', async () => {
    const result = await detectFaceLandmarks({
      model: createMockFaceLandmarkModel(),
      image: testImage,
    });
    expect(result.faces).toHaveLength(1);
    expect(result.faces[0].landmarks).toHaveLength(478);
    expect(result.faces[0].blendshapes).toBeUndefined();
  });

  it('returns blendshapes when outputBlendshapes is true', async () => {
    const result = await detectFaceLandmarks({
      model: createMockFaceLandmarkModel(),
      image: testImage,
      outputBlendshapes: true,
    });
    expect(result.faces[0].blendshapes).toBeDefined();
    expect(result.faces[0].blendshapes!.length).toBeGreaterThan(0);
    expect(result.faces[0].blendshapes![0]).toMatchObject({
      categoryName: expect.any(String),
      score: expect.any(Number),
    });
  });

  it('rejects immediately with a pre-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      detectFaceLandmarks({
        model: createMockFaceLandmarkModel(),
        image: testImage,
        abortSignal: controller.signal,
      })
    ).rejects.toThrow();
  });
});

describe('recognizeGesture()', () => {
  it('returns gestures with category, score, handedness, landmarks', async () => {
    const result = await recognizeGesture({
      model: createMockGestureRecognitionModel({ gesture: 'Victory' }),
      image: testImage,
    });
    expect(result.gestures).toHaveLength(1);
    expect(result.gestures[0].gesture).toBe('Victory');
    expect(result.gestures[0].score).toBeGreaterThan(0);
    expect(['Left', 'Right']).toContain(result.gestures[0].handedness);
    expect(result.gestures[0].landmarks).toHaveLength(21);
  });

  it('rejects immediately with a pre-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      recognizeGesture({
        model: createMockGestureRecognitionModel(),
        image: testImage,
        abortSignal: controller.signal,
      })
    ).rejects.toThrow();
  });
});

describe('landmark topology constants', () => {
  it('HAND_CONNECTIONS has 21 connection pairs', () => {
    expect(HAND_CONNECTIONS).toHaveLength(21);
    for (const [a, b] of HAND_CONNECTIONS) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(20);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(20);
    }
  });

  it('POSE_CONNECTIONS references valid 33-point landmark indices', () => {
    expect(POSE_CONNECTIONS.length).toBeGreaterThan(0);
    for (const [a, b] of POSE_CONNECTIONS) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(32);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(32);
    }
  });

  it('FACE_CONNECTIONS references valid 478-point mesh indices', () => {
    expect(FACE_CONNECTIONS.length).toBeGreaterThan(0);
    for (const [a, b] of FACE_CONNECTIONS) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(478);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(478);
    }
  });

  it('GESTURE_CATEGORIES contains the 8 standard MediaPipe gestures', () => {
    expect(GESTURE_CATEGORIES).toEqual([
      'None',
      'Closed_Fist',
      'Open_Palm',
      'Pointing_Up',
      'Thumb_Down',
      'Thumb_Up',
      'Victory',
      'ILoveYou',
    ]);
  });
});
