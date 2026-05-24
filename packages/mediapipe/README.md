# @localmode/mediapipe

MediaPipe Tasks provider for [LocalMode](https://localmode.dev) -- run Google's on-device perception models in the browser. Hand, pose, and face landmark detection, gesture recognition, audio classification, language detection, and more, all entirely on-device via WebAssembly.

[![npm](https://img.shields.io/npm/v/@localmode/mediapipe)](https://www.npmjs.com/package/@localmode/mediapipe)
[![license](https://img.shields.io/npm/l/@localmode/mediapipe)](../../LICENSE)

[![Docs](https://img.shields.io/badge/Docs-LocalMode.dev-red)](https://localmode.dev/docs/mediapipe)
[![Demo](https://img.shields.io/badge/Demo-LocalMode.ai-purple)](https://localmode.ai)

Wraps `@mediapipe/tasks-vision`, `@mediapipe/tasks-audio`, and `@mediapipe/tasks-text` as a single unified LocalMode provider. The privacy-first part is the point: the camera, microphone, and text never leave the browser -- the only network requests are the one-time model and WASM downloads.

## Features

- **13 curated models** -- landmarks, gestures, classification, detection, segmentation, embeddings, and language detection, all verified against Google's CDN
- **Real-time streaming** -- hand, pose, face, and gesture trackers run live over a `<video>` element at 30-60fps
- **Universal browser support** -- pure WebAssembly + WebGL; no WebGPU required
- **Tiny models** -- most under 10MB; face detection and selfie segmentation are ~250KB
- **Unified LocalMode interface** -- landmark tasks use `detectHands()`, `detectPose()`, etc.; classification/detection/embedding tasks reuse the existing core functions
- **AbortSignal cancellation** on every single-frame function
- **GPU or CPU delegate**, configurable per provider or per model

## Installation

```bash
pnpm install @localmode/mediapipe @localmode/core
```

The `@mediapipe/tasks-*` dependencies are installed automatically. The WASM runtime loads from the jsDelivr CDN by default -- set `wasmBasePath` to self-host it for fully offline apps.

## Quick Start

### Single-frame detection

```typescript
import { detectHands } from '@localmode/core';
import { mediapipe } from '@localmode/mediapipe';

const { hands } = await detectHands({
  model: mediapipe.handLandmarker(),
  image: imageBlob,
  numHands: 2,
});

for (const hand of hands) {
  console.log(`${hand.handedness} hand -- ${hand.landmarks.length} landmarks`);
}
```

### Real-time streaming

```typescript
import { mediapipe } from '@localmode/mediapipe';

const tracker = mediapipe.createHandTracker({
  video: videoElement,
  numHands: 2,
  onResults: (hands, timestampMs) => drawHands(hands),
});

await tracker.start();
// later
tracker.stop();
await tracker.close();
```

## Tasks

The provider exposes a factory method per task. Landmark and gesture tasks use new core functions; the rest reuse standard LocalMode interfaces.

| Method                          | Interface                  | Core function             |
| ------------------------------- | -------------------------- | ------------------------- |
| `mediapipe.handLandmarker()`    | `HandLandmarkModel`        | `detectHands()`           |
| `mediapipe.poseLandmarker()`    | `PoseLandmarkModel`        | `detectPose()`            |
| `mediapipe.faceLandmarker()`    | `FaceLandmarkModel`        | `detectFaceLandmarks()`   |
| `mediapipe.faceDetector()`      | `FaceDetectionModel`       | `detectFace()`            |
| `mediapipe.gestureRecognizer()` | `GestureRecognitionModel`  | `recognizeGesture()`      |
| `mediapipe.imageClassifier()`   | `ImageClassificationModel` | `classifyImage()`         |
| `mediapipe.objectDetector()`    | `ObjectDetectionModel`     | `detectObjects()`         |
| `mediapipe.imageSegmenter()`    | `SegmentationModel`        | `segmentImage()`          |
| `mediapipe.imageEmbedder()`     | `ImageFeatureModel`        | `extractImageFeatures()`  |
| `mediapipe.audioClassifier()`   | `AudioClassificationModel` | `classifyAudio()`         |
| `mediapipe.textEmbedder()`      | `EmbeddingModel`           | `embed()` / `embedMany()` |
| `mediapipe.languageDetector()`  | `LanguageDetectionModel`   | `detectLanguage()`        |
| `mediapipe.textClassifier(modelPath)` | `ClassificationModel` | `classify()`             |

`mediapipe.textClassifier()` **requires** an explicit custom-trained `.tflite` model URL (built with [MediaPipe Model Maker](https://ai.google.dev/edge/mediapipe/solutions/customization/text_classifier)) -- MediaPipe ships no default text classifier. Calling it without a path throws a `ValidationError`.

### Disposing Model Instances

Individual model instances have a `close()` method for releasing WASM resources when you are done with them:

```typescript
const model = mediapipe.handLandmarker();
// ... use model ...
model.close(); // Release WASM resources
```

This applies to all model instances created via factory methods (not just streaming trackers). Call `close()` when the model is no longer needed to free memory.

## Model Catalog

`MEDIAPIPE_MODELS` ships 13 curated models, all verified against `storage.googleapis.com`.

| Catalog ID             | Model                                      | Domain | Size   |
| ---------------------- | ------------------------------------------ | ------ | ------ |
| `hand_landmarker`      | Hand Landmarker                            | vision | 7.8MB  |
| `pose_landmarker`      | Pose Landmarker (Lite)                     | vision | 5.8MB  |
| `pose_landmarker_full` | Pose Landmarker (Full)                     | vision | 9.4MB  |
| `face_landmarker`      | Face Landmarker (478-point mesh)           | vision | 3.8MB  |
| `face_detector`        | Face Detector (BlazeFace)                  | vision | 230KB  |
| `gesture_recognizer`   | Gesture Recognizer                         | vision | 8.4MB  |
| `image_classifier`     | Image Classifier (EfficientNet-Lite0)      | vision | 18.6MB |
| `object_detector`      | Object Detector (EfficientDet-Lite0)       | vision | 7.3MB  |
| `image_segmenter`      | Image Segmenter (Selfie)                   | vision | 250KB  |
| `image_embedder`       | Image Embedder (MobileNet-V3 Small)        | vision | 4.1MB  |
| `audio_classifier`     | Audio Classifier (YAMNet, 521 categories)  | audio  | 4.1MB  |
| `language_detector`    | Language Detector (110 languages)          | text   | 315KB  |
| `text_embedder`        | Text Embedder (Universal Sentence Encoder) | text   | 6.1MB  |

Each factory uses its catalog default. Pass a catalog ID, a direct URL, or a `modelPath` setting to override:

```typescript
const full = mediapipe.poseLandmarker('pose_landmarker_full');
const custom = mediapipe.handLandmarker('https://your-cdn.com/hand_landmarker.task');
```

## Streaming API

Four streaming trackers run MediaPipe vision tasks in VIDEO mode over a `<video>` element, invoking a callback once per processed frame (up to ~60fps):

| Factory                            | `onResults` payload                                |
| ---------------------------------- | -------------------------------------------------- |
| `mediapipe.createHandTracker()`    | `(hands: HandLandmarkResultItem[], timestampMs)`   |
| `mediapipe.createPoseTracker()`    | `(poses: PoseLandmarkResultItem[], timestampMs)`   |
| `mediapipe.createFaceTracker()`    | `(faces: FaceLandmarkResultItem[], timestampMs)`   |
| `mediapipe.createGestureTracker()` | `(gestures: GestureResultItem[], timestampMs)`     |

Each returns a `TrackerInstance`:

```typescript
interface TrackerInstance {
  start(): Promise<void>;   // load model + begin frame loop
  stop(): void;             // pause loop, keep model loaded
  close(): Promise<void>;   // stop and dispose the MediaPipe task
  readonly isRunning: boolean;
}
```

```typescript
const tracker = mediapipe.createFaceTracker({
  video: videoElement,
  numFaces: 1,
  outputBlendshapes: true,
  onResults: (faces) => updateAvatar(faces[0]?.blendshapes),
  onError: (err) => console.error(err),
});

await tracker.start();
```

Streaming trackers report per-frame errors through `onError` instead of throwing.

## Provider Configuration

```typescript
import { createMediaPipe } from '@localmode/mediapipe';

const myMediaPipe = createMediaPipe({
  delegate: 'CPU',                     // 'GPU' (default) | 'CPU'
  wasmBasePath: '/wasm/mediapipe',     // self-host the WASM runtime
});
```

`wasmBasePath` also accepts an object to set the vision / audio / text runtime paths individually:

```typescript
createMediaPipe({
  wasmBasePath: {
    vision: '/wasm/tasks-vision',
    audio: '/wasm/tasks-audio',
    text: '/wasm/tasks-text',
  },
});
```

Per-model settings (`modelPath`, `delegate`, `wasmBasePath`) override provider defaults for a single model.

## Browser Compatibility

MediaPipe Tasks runs on pure WebAssembly with a WebGL GPU delegate -- it does **not** require WebGPU.

| Browser     | WASM | WebGL (GPU delegate) |
| ----------- | ---- | -------------------- |
| Chrome 80+  | Yes  | Yes                  |
| Edge 80+    | Yes  | Yes                  |
| Firefox 75+ | Yes  | Yes                  |
| Safari 14+  | Yes  | Yes                  |

If the WebGL GPU delegate is unavailable, set `delegate: 'CPU'` to fall back to CPU inference.

> **Concurrent audio + vision.** The MediaPipe audio and vision WASM runtimes can conflict if run **concurrently in the same thread** ([mediapipe#4737](https://github.com/google-ai-edge/mediapipe/issues/4737)). If your app uses audio classification and a vision task at the same time, run one of them in a **Web Worker** so each runtime has its own thread. Sequential use is unaffected.

## Choosing a LocalMode Vision/Perception Provider

| Provider                  | When to use                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `@localmode/mediapipe`    | Real-time human perception -- hand/pose/face landmarks, gestures, live video trackers        |
| `@localmode/transformers` | Broader catalog of pre-trained ONNX models -- captioning, OCR, summarization, classification |
| `@localmode/webllm`       | WebGPU LLM inference for text generation                                                     |
| `@localmode/wllama`       | GGUF LLM inference on pure WASM                                                              |
| `@localmode/litert`       | First-party Google `.litertlm` LLM runtime                                                   |

## Utility Exports

| Function | Description |
|----------|-------------|
| `getModelEntry(id)` | Look up a `MediaPipeModelEntry` from the built-in catalog by its `MediaPipeModelId` |
| `resolveModelUrl(idOrUrl)` | Resolve a catalog ID or direct URL to the final model download URL |

```typescript
import { getModelEntry, resolveModelUrl } from '@localmode/mediapipe';

const entry = getModelEntry('hand_landmarker');
console.log(entry.url, entry.sizeBytes);

const url = resolveModelUrl('pose_landmarker_full');
```

## Implementation Classes

For advanced use or custom wiring, all implementation classes are exported directly:

| Class | Implements |
|-------|------------|
| `MediaPipeHandLandmarker` | `HandLandmarkModel` |
| `MediaPipePoseLandmarker` | `PoseLandmarkModel` |
| `MediaPipeFaceDetector` | `FaceDetectionModel` |
| `MediaPipeFaceLandmarker` | `FaceLandmarkModel` |
| `MediaPipeGestureRecognizer` | `GestureRecognitionModel` |
| `MediaPipeImageClassifier` | `ImageClassificationModel` |
| `MediaPipeObjectDetector` | `ObjectDetectionModel` |
| `MediaPipeImageSegmenter` | `SegmentationModel` |
| `MediaPipeImageEmbedder` | `ImageFeatureModel` |
| `MediaPipeAudioClassifier` | `AudioClassificationModel` |
| `MediaPipeTextClassifier` | `ClassificationModel` |
| `MediaPipeTextEmbedder` | `EmbeddingModel` |
| `MediaPipeLanguageDetector` | `LanguageDetectionModel` |

## Documentation

Full documentation at [localmode.dev/docs/mediapipe](https://localmode.dev/docs/mediapipe).

## Acknowledgments

Built on Google's [MediaPipe Tasks](https://ai.google.dev/edge/mediapipe/solutions/guide) -- on-device perception models compiled to WebAssembly. Catalog models are published by Google on `storage.googleapis.com`.

## License

MIT (this package). The underlying `@mediapipe/tasks-*` packages are licensed by Google under Apache-2.0.
