# @localmode/mediapipe

## 2.0.2

### Patch Changes

- docs: replace the README "Demo" badge with "UI Components" (localmode.ai) and add a "Blocks & Apps" badge linking to the localmode.ai/blocks gallery

## 2.0.1

### Fixed

- `@localmode/core` peer range corrected from `>=2.0.0` to `>=2.2.0`. The provider implements `FaceDetectionModel`, `HandLandmarkModel`, `PoseLandmarkModel`, `FaceLandmarkModel`, `GestureRecognitionModel`, and `LanguageDetectionModel` — all added in core 2.2.0 — so installing it against core 2.0.x or 2.1.x resolved cleanly but failed to typecheck. No runtime or API change.

## 2.0.0

### Major Changes

- New package: Google MediaPipe Tasks provider — wraps `@mediapipe/tasks-vision`,
  `@mediapipe/tasks-audio`, and `@mediapipe/tasks-text` as a single unified
  provider. WASM + WebGL runtime; works in every target browser (no WebGPU
  required). Each task domain loads its WASM runtime independently from the
  jsDelivr CDN.
- Implements new core landmark and gesture interfaces — `HandLandmarkModel`,
  `PoseLandmarkModel`, `FaceDetectionModel`, `FaceLandmarkModel`,
  `GestureRecognitionModel` — plus the new `LanguageDetectionModel` interface.
- Implements existing core interfaces — `ImageClassificationModel`,
  `ObjectDetectionModel`, `SegmentationModel`, `ImageFeatureModel` (vision),
  `AudioClassificationModel` (YAMNet, 521 categories), and `ClassificationModel`
  - `EmbeddingModel` (text).
- Provider factory methods: `handLandmarker()`, `poseLandmarker()`,
  `faceLandmarker()`, `faceDetector()`, `gestureRecognizer()`,
  `imageClassifier()`, `objectDetector()`, `imageSegmenter()`,
  `imageEmbedder()`, `audioClassifier()`, `textClassifier()`, `textEmbedder()`,
  `languageDetector()`.
- Provider-specific streaming API — `createHandTracker()`, `createPoseTracker()`,
  `createFaceTracker()`, `createGestureTracker()` run MediaPipe vision tasks in
  VIDEO mode over a `<video>` element at 30-60fps with a results callback and a
  `start` / `stop` / `close` lifecycle.
- Curated model catalog (`MEDIAPIPE_MODELS`) — 13 verified entries from Google's
  CDN spanning 12 task types, ranging from 230 KB (face detector) to 18.6 MB
  (image classifier).
- Lazy task loading with concurrent-load deduplication; every model instance
  exposes `close()` to dispose its WASM task.

### Status

- `@mediapipe/tasks-*` is pinned to `^0.10.22`.
- Audio embeddings are not available — the `@mediapipe/tasks-audio` JS package
  ships only `AudioClassifier`, not an `AudioEmbedder` class. Audio coverage is
  limited to classification.
- `@mediapipe/tasks-genai` (LLM inference) is deliberately not wrapped — it
  duplicates `@localmode/litert`.
- MediaPipe text classification requires a custom-trained model (MediaPipe
  Model Maker) — `textClassifier()` requires an explicit model path.
- Audio and vision WASM runtimes can conflict if run concurrently in the same
  thread (MediaPipe GitHub #4737) — use Web Worker isolation for concurrent
  audio + vision usage.

### Patch Changes

- Updated dependencies
  - @localmode/core@2.0.1
