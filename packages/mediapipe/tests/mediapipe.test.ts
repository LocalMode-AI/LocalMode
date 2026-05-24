/**
 * @localmode/mediapipe tests
 *
 * Exercises the provider, model implementations, and streaming trackers
 * through mocked `@mediapipe/tasks-*` packages. The mocks stand in for the
 * WASM runtime boundary; all provider code (factories, lazy loading, result
 * mapping, lifecycle, error wrapping) runs unmodified.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Hoisted mock state shared with the vi.mock factories ──────────
const h = vi.hoisted(() => {
  const landmarks = (n: number) =>
    Array.from({ length: n }, () => ({ x: 0.5, y: 0.5, z: 0.01, visibility: 0.9 }));
  const category = (name: string, score: number) => ({
    categoryName: name,
    displayName: '',
    score,
    index: 0,
  });

  const state = {
    closed: [] as string[],
    visionCreateCalls: 0,
    audioCreateCalls: 0,
    textCreateCalls: 0,
    /** Force the next vision task creation to throw. */
    failVisionLoad: false,
  };

  return { landmarks, category, state };
});

vi.mock('@mediapipe/tasks-vision', () => {
  const mkTask = (name: string, methods: Record<string, unknown>) => ({
    close: vi.fn(() => h.state.closed.push(name)),
    setOptions: vi.fn(),
    ...methods,
  });
  const guardCreate = async <T>(factory: () => T): Promise<T> => {
    h.state.visionCreateCalls++;
    if (h.state.failVisionLoad) {
      throw new Error('mock vision WASM load failure');
    }
    return factory();
  };

  return {
    FilesetResolver: { forVisionTasks: vi.fn(async () => ({})) },
    HandLandmarker: {
      createFromOptions: vi.fn(() =>
        guardCreate(() => {
          const result = {
            landmarks: [h.landmarks(21)],
            worldLandmarks: [h.landmarks(21)],
            handedness: [[h.category('Right', 0.96)]],
            handednesses: [[h.category('Right', 0.96)]],
          };
          return mkTask('hand', {
            detect: vi.fn(() => result),
            detectForVideo: vi.fn(() => result),
          });
        })
      ),
    },
    PoseLandmarker: {
      createFromOptions: vi.fn(() =>
        guardCreate(() => {
          const result = {
            landmarks: [h.landmarks(33)],
            worldLandmarks: [h.landmarks(33)],
          };
          return mkTask('pose', {
            detect: vi.fn(() => result),
            detectForVideo: vi.fn(() => result),
          });
        })
      ),
    },
    FaceDetector: {
      createFromOptions: vi.fn(() =>
        guardCreate(() =>
          mkTask('face-detector', {
            detect: vi.fn(() => ({
              detections: [
                {
                  categories: [h.category('face', 0.99)],
                  boundingBox: { originX: 10, originY: 20, width: 100, height: 120 },
                  keypoints: [
                    { x: 0.3, y: 0.3 },
                    { x: 0.7, y: 0.3 },
                  ],
                },
              ],
            })),
          })
        )
      ),
    },
    FaceLandmarker: {
      createFromOptions: vi.fn(() =>
        guardCreate(() => {
          const result = {
            faceLandmarks: [h.landmarks(478)],
            faceBlendshapes: [{ categories: [h.category('jawOpen', 0.4)] }],
            facialTransformationMatrixes: [],
          };
          return mkTask('face-landmarker', {
            detect: vi.fn(() => result),
            detectForVideo: vi.fn(() => result),
          });
        })
      ),
    },
    GestureRecognizer: {
      createFromOptions: vi.fn(() =>
        guardCreate(() =>
          mkTask('gesture', {
            recognize: vi.fn(() => ({
              landmarks: [h.landmarks(21)],
              worldLandmarks: [h.landmarks(21)],
              handedness: [[h.category('Right', 0.95)]],
              handednesses: [[h.category('Right', 0.95)]],
              gestures: [[h.category('Thumb_Up', 0.93)]],
            })),
          })
        )
      ),
    },
    ImageClassifier: {
      createFromOptions: vi.fn(() =>
        guardCreate(() =>
          mkTask('image-classifier', {
            classify: vi.fn(() => ({
              classifications: [
                { categories: [h.category('cat', 0.9), h.category('dog', 0.1)] },
              ],
            })),
          })
        )
      ),
    },
    ObjectDetector: {
      createFromOptions: vi.fn(() =>
        guardCreate(() =>
          mkTask('object-detector', {
            detect: vi.fn(() => ({
              detections: [
                {
                  categories: [h.category('person', 0.88)],
                  boundingBox: { originX: 5, originY: 5, width: 50, height: 90 },
                  keypoints: [],
                },
              ],
            })),
          })
        )
      ),
    },
    ImageSegmenter: {
      createFromOptions: vi.fn(() =>
        guardCreate(() =>
          mkTask('segmenter', {
            segment: vi.fn(() => ({
              categoryMask: { getAsUint8Array: () => new Uint8Array([0, 1, 1, 0]) },
              confidenceMasks: [{ getAsFloat32Array: () => new Float32Array([0, 0.5, 1, 0.2]) }],
              close: vi.fn(),
            })),
          })
        )
      ),
    },
    ImageEmbedder: {
      createFromOptions: vi.fn(() =>
        guardCreate(() =>
          mkTask('image-embedder', {
            embed: vi.fn(() => ({
              embeddings: [{ floatEmbedding: [0.1, 0.2, 0.3] }],
            })),
          })
        )
      ),
    },
  };
});

vi.mock('@mediapipe/tasks-audio', () => {
  return {
    FilesetResolver: { forAudioTasks: vi.fn(async () => ({})) },
    AudioClassifier: {
      createFromOptions: vi.fn(async () => {
        h.state.audioCreateCalls++;
        return {
          close: vi.fn(() => h.state.closed.push('audio-classifier')),
          classify: vi.fn(() => [
            { classifications: [{ categories: [h.category('Speech', 0.9)] }] },
            { classifications: [{ categories: [h.category('Speech', 0.8)] }] },
          ]),
        };
      }),
    },
  };
});

vi.mock('@mediapipe/tasks-text', () => {
  return {
    FilesetResolver: { forTextTasks: vi.fn(async () => ({})) },
    LanguageDetector: {
      createFromOptions: vi.fn(async () => {
        h.state.textCreateCalls++;
        return {
          close: vi.fn(() => h.state.closed.push('language-detector')),
          detect: vi.fn(() => ({
            languages: [
              { languageCode: 'fr', probability: 0.98 },
              { languageCode: 'en', probability: 0.02 },
            ],
          })),
        };
      }),
    },
    TextEmbedder: {
      createFromOptions: vi.fn(async () => {
        h.state.textCreateCalls++;
        return {
          close: vi.fn(() => h.state.closed.push('text-embedder')),
          embed: vi.fn(() => ({ embeddings: [{ floatEmbedding: [0.4, 0.5, 0.6] }] })),
        };
      }),
    },
    TextClassifier: {
      createFromOptions: vi.fn(async () => {
        h.state.textCreateCalls++;
        return {
          close: vi.fn(() => h.state.closed.push('text-classifier')),
          classify: vi.fn(() => ({
            classifications: [
              { categories: [h.category('positive', 0.7), h.category('negative', 0.3)] },
            ],
          })),
        };
      }),
    },
  };
});

import { createMediaPipe, mediapipe, MEDIAPIPE_MODELS, DEFAULT_MODELS } from '../src/index.js';
import { MediaPipeHandLandmarker } from '../src/implementations/index.js';
import { ModelLoadError, ValidationError } from '@localmode/core';

// jsdom does not implement the `ImageData` global. Provide a minimal stand-in
// so `toImageSource()` takes its pass-through branch (no `createImageBitmap`).
class FakeImageData {
  constructor(
    public readonly width: number,
    public readonly height: number
  ) {}
}
(globalThis as { ImageData?: unknown }).ImageData ??= FakeImageData;

/** An ImageData passes straight through `toImageSource` (no createImageBitmap). */
const testImage = new (globalThis as { ImageData: typeof FakeImageData }).ImageData(
  1,
  1
) as unknown as ImageData;

beforeEach(() => {
  h.state.closed = [];
  h.state.visionCreateCalls = 0;
  h.state.audioCreateCalls = 0;
  h.state.textCreateCalls = 0;
  h.state.failVisionLoad = false;
  vi.clearAllMocks();
});

describe('MEDIAPIPE_MODELS catalog', () => {
  it('has an entry for every supported task type', () => {
    const tasks = new Set(Object.values(MEDIAPIPE_MODELS).map((m) => m.task));
    for (const t of [
      'hand_landmarker',
      'pose_landmarker',
      'face_landmarker',
      'face_detector',
      'gesture_recognizer',
      'image_classifier',
      'object_detector',
      'image_segmenter',
      'image_embedder',
      'audio_classifier',
      'language_detector',
      'text_embedder',
    ]) {
      expect(tasks.has(t)).toBe(true);
    }
  });

  it('all model URLs point to the Google CDN', () => {
    for (const entry of Object.values(MEDIAPIPE_MODELS)) {
      expect(entry.url).toMatch(/^https:\/\/storage\.googleapis\.com\//);
      expect(entry.sizeBytes).toBeGreaterThan(0);
      expect(entry.name.length).toBeGreaterThan(0);
    }
  });

  it('has no text_classifier entry (requires a custom model)', () => {
    expect('text_classifier' in MEDIAPIPE_MODELS).toBe(false);
  });

  it('DEFAULT_MODELS values are valid catalog IDs', () => {
    for (const id of Object.values(DEFAULT_MODELS)) {
      expect(id in MEDIAPIPE_MODELS).toBe(true);
    }
  });
});

describe('provider factory', () => {
  it('exposes all factory methods', () => {
    const p = createMediaPipe();
    for (const m of [
      'handLandmarker',
      'poseLandmarker',
      'faceLandmarker',
      'faceDetector',
      'gestureRecognizer',
      'imageClassifier',
      'objectDetector',
      'imageSegmenter',
      'imageEmbedder',
      'audioClassifier',
      'textClassifier',
      'textEmbedder',
      'languageDetector',
      'createHandTracker',
      'createPoseTracker',
      'createFaceTracker',
    ]) {
      expect(typeof (p as Record<string, unknown>)[m]).toBe('function');
    }
  });

  it('default singleton is a usable provider', () => {
    expect(typeof mediapipe.handLandmarker).toBe('function');
  });

  it('models carry a mediapipe-prefixed modelId', () => {
    expect(mediapipe.handLandmarker().modelId).toBe('mediapipe:hand_landmarker');
    expect(mediapipe.handLandmarker().provider).toBe('mediapipe');
  });
});

describe('hand landmarker', () => {
  it('maps detection output to 21-landmark hands', async () => {
    const model = mediapipe.handLandmarker();
    const result = await model.doDetect({ images: [testImage] });
    expect(result.results[0]).toHaveLength(1);
    expect(result.results[0][0].landmarks).toHaveLength(21);
    expect(result.results[0][0].worldLandmarks).toHaveLength(21);
    expect(result.results[0][0].handedness).toBe('Right');
    expect(result.results[0][0].score).toBeCloseTo(0.96);
  });

  it('lazily loads — no task created before first detect', () => {
    mediapipe.handLandmarker();
    expect(h.state.visionCreateCalls).toBe(0);
  });

  it('deduplicates concurrent loads', async () => {
    const model = mediapipe.handLandmarker();
    await Promise.all([
      model.doDetect({ images: [testImage] }),
      model.doDetect({ images: [testImage] }),
    ]);
    expect(h.state.visionCreateCalls).toBe(1);
  });

  it('close() disposes the underlying task', async () => {
    const model = mediapipe.handLandmarker() as MediaPipeHandLandmarker;
    await model.doDetect({ images: [testImage] });
    model.close();
    expect(h.state.closed).toContain('hand');
  });

  it('wraps load failures in ModelLoadError', async () => {
    h.state.failVisionLoad = true;
    const model = mediapipe.handLandmarker();
    await expect(model.doDetect({ images: [testImage] })).rejects.toBeInstanceOf(
      ModelLoadError
    );
  });

  it('rejects a pre-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      mediapipe.handLandmarker().doDetect({ images: [testImage], abortSignal: controller.signal })
    ).rejects.toThrow();
  });
});

describe('pose landmarker', () => {
  it('maps detection output to 33-landmark poses', async () => {
    const result = await mediapipe.poseLandmarker().doDetect({ images: [testImage] });
    expect(result.results[0][0].landmarks).toHaveLength(33);
    expect(result.results[0][0].score).toBeGreaterThan(0);
  });
});

describe('face detector', () => {
  it('maps detections to boxes, scores, and keypoints', async () => {
    const result = await mediapipe.faceDetector().doDetect({ images: [testImage] });
    const face = result.results[0][0];
    expect(face.box).toEqual({ x: 10, y: 20, width: 100, height: 120 });
    expect(face.score).toBeCloseTo(0.99);
    expect(face.keypoints.length).toBe(2);
    expect(face.keypoints[0].name).toBe('rightEye');
  });
});

describe('face landmarker', () => {
  it('returns 478-point mesh and no blendshapes by default', async () => {
    const result = await mediapipe.faceLandmarker().doDetect({ images: [testImage] });
    expect(result.results[0][0].landmarks).toHaveLength(478);
    expect(result.results[0][0].blendshapes).toBeUndefined();
  });

  it('returns blendshapes when requested', async () => {
    const result = await mediapipe
      .faceLandmarker()
      .doDetect({ images: [testImage], outputBlendshapes: true });
    expect(result.results[0][0].blendshapes).toBeDefined();
    expect(result.results[0][0].blendshapes![0].categoryName).toBe('jawOpen');
  });
});

describe('gesture recognizer', () => {
  it('maps recognition output to gesture category strings', async () => {
    const result = await mediapipe.gestureRecognizer().doRecognize({ images: [testImage] });
    const g = result.results[0][0];
    expect(g.gesture).toBe('Thumb_Up');
    expect(g.score).toBeCloseTo(0.93);
    expect(g.handedness).toBe('Right');
    expect(g.landmarks).toHaveLength(21);
  });
});

describe('existing vision interfaces', () => {
  it('image classifier returns ranked categories', async () => {
    const result = await mediapipe.imageClassifier().doClassify({ images: [testImage] });
    expect(result.results[0][0]).toEqual({ label: 'cat', score: 0.9 });
  });

  it('object detector returns labelled boxes', async () => {
    const result = await mediapipe.objectDetector().doDetect({ images: [testImage] });
    expect(result.results[0].objects[0].label).toBe('person');
    expect(result.results[0].objects[0].box.width).toBe(50);
  });

  it('image segmenter returns masks', async () => {
    const result = await mediapipe.imageSegmenter().doSegment({ images: [testImage] });
    expect(result.results[0].masks.length).toBeGreaterThan(0);
    expect(result.results[0].masks[0].mask).toBeInstanceOf(Uint8Array);
  });

  it('image embedder returns a feature vector', async () => {
    const result = await mediapipe.imageEmbedder().doExtract({ images: [testImage] });
    expect(result.features[0]).toBeInstanceOf(Float32Array);
    expect(Array.from(result.features[0])).toEqual([
      expect.closeTo(0.1),
      expect.closeTo(0.2),
      expect.closeTo(0.3),
    ]);
  });
});

describe('audio classifier', () => {
  it('averages frame scores into ranked predictions', async () => {
    const result = await mediapipe
      .audioClassifier()
      .doClassify({ audio: [new Float32Array(16000)] });
    expect(result.results[0][0].label).toBe('Speech');
    // Average of 0.9 and 0.8.
    expect(result.results[0][0].score).toBeCloseTo(0.85);
  });

  it('uses the audio WASM runtime', async () => {
    await mediapipe.audioClassifier().doClassify({ audio: [new Float32Array(16000)] });
    expect(h.state.audioCreateCalls).toBe(1);
  });
});

describe('text tasks', () => {
  it('language detector maps probabilities to confidences', async () => {
    const result = await mediapipe.languageDetector().doDetect({ text: 'Bonjour' });
    expect(result.languages[0]).toEqual({ languageCode: 'fr', confidence: 0.98 });
  });

  it('text embedder returns embedding vectors', async () => {
    const result = await mediapipe.textEmbedder().doEmbed({ values: ['hello'] });
    expect(result.embeddings[0]).toBeInstanceOf(Float32Array);
    expect(result.response.modelId).toBe('mediapipe:text_embedder');
  });

  it('text classifier returns the top category', async () => {
    const model = mediapipe.textClassifier('https://example.com/custom.tflite');
    const result = await model.doClassify({ texts: ['great movie'] });
    expect(result.results[0].label).toBe('positive');
    expect(result.results[0].score).toBeCloseTo(0.7);
  });

  it('text classifier requires an explicit model path', () => {
    expect(() => mediapipe.textClassifier('')).toThrow(ValidationError);
  });
});

describe('streaming trackers', () => {
  /** Minimal video-element stub the tracker loop reads from. */
  function videoStub(): HTMLVideoElement {
    return { readyState: 4, currentTime: 0 } as HTMLVideoElement;
  }

  it('hand tracker start/stop/close lifecycle', async () => {
    const tracker = mediapipe.createHandTracker({
      video: videoStub(),
      onResults: () => {},
    });
    expect(tracker.isRunning).toBe(false);
    await tracker.start();
    expect(tracker.isRunning).toBe(true);
    tracker.stop();
    expect(tracker.isRunning).toBe(false);
    await tracker.close();
    expect(h.state.closed).toContain('hand');
  });

  it('pose tracker and face tracker can be created and started', async () => {
    const pose = mediapipe.createPoseTracker({ video: videoStub(), onResults: () => {} });
    const face = mediapipe.createFaceTracker({ video: videoStub(), onResults: () => {} });
    await pose.start();
    await face.start();
    expect(pose.isRunning).toBe(true);
    expect(face.isRunning).toBe(true);
    await pose.close();
    await face.close();
  });
});
