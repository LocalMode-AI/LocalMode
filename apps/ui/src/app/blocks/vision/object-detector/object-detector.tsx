'use client';

/**
 * @file object-detector.tsx
 * @description Vision — Object Detector: one-shot DETR (Xenova/detr-resnet-50) object detection on upload/sample/webcam-still plus a live BlazeFace webcam face loop, fully on-device.
 */

import { useEffect, useRef, useState } from 'react';
import { Camera, RotateCcw, X } from 'lucide-react';
import { useDetectObjects, useModelLoad, type UseModelLoadReturn } from '@localmode/react';
import {
  detectFace,
  type FaceDetectionResultItem,
  type ObjectDetectionModel,
} from '@localmode/core';
import { transformers } from '@localmode/transformers';
import { mediapipe } from '@localmode/mediapipe';

import { VideoCanvas, type VideoCanvasHandle } from '@/components/video-canvas';
import {
  BoundingBoxOverlay,
  DetectionLabelLegend,
} from '@/components/bounding-box-overlay';
import { ImageProcessingOverlay } from '@/components/image-processing-overlay';
import { MediaDropzone } from '@/components/media-dropzone';
import { ScoredResultBarList } from '@/components/scored-result-bar-list';
import { CapabilityGate } from '@/components/capability-gate';
import { readFileAsDataUrl } from '@/lib/browser-utils';

import { useWebcam } from '@/hooks/use-webcam';

/** Proven object-detection model from the showcase object-detector app. */
const DETR_MODEL_ID = 'Xenova/detr-resnet-50';
/** Bundled sample image (football-match scene — COCO `person` / `sports ball`). */
const SAMPLE_SRC = '/test-assets/portrait.jpg';
/** Accepted upload types (object-detector parity). */
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const FACE_DETECT_INTERVAL_MS = 1500;

/**
 * MediaPipe face-detector singleton, kept module-level: `useModelLoad`'s
 * default warmup only knows LanguageModel/EmbeddingModel — the 1.5s detect
 * loop loads the model on its first real frame instead.
 */
let faceModel: ReturnType<typeof mediapipe.faceDetector> | null = null;
const getFaceModel = () => (faceModel ??= mediapipe.faceDetector());

/** The current DETR subject image. */
interface SubjectImage {
  src: string;
  width: number;
  height: number;
  origin: 'sample' | 'upload' | 'webcam';
  name: string;
}

interface CapturedStill {
  src: string;
  width: number;
  height: number;
}

/** Resolve an image URL/data-URL's natural dimensions. */
function getImageDimensions(src: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Failed to load the image.'));
    img.src = src;
  });
}

export function ObjectDetectorBlock() {
  // DETR singleton + real download-progress source. `load()` is never called —
  // the first detection triggers the provider's lazy download, streamed into
  // `detr.progress` by the create-bound onProgress.
  const detr = useModelLoad<ObjectDetectionModel>({
    key: DETR_MODEL_ID,
    create: (onProgress) => transformers.objectDetector(DETR_MODEL_ID, { onProgress }),
  });

  // The model instance is created in a client mount effect — null for exactly
  // one tick, after which the block renders with a real ObjectDetectionModel.
  if (!detr.model) return null;
  return <DetectSurface detr={detr} detrModel={detr.model} />;
}

function DetectSurface({
  detr,
  detrModel,
}: {
  detr: UseModelLoadReturn<ObjectDetectionModel>;
  detrModel: ObjectDetectionModel;
}) {
  const [subject, setSubject] = useState<SubjectImage | null>(null);
  const [faces, setFaces] = useState<FaceDetectionResultItem[] | null>(null);
  const [still, setStill] = useState<CapturedStill | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const webcam = useWebcam({ width: 640, height: 480 });
  const videoCanvasRef = useRef<VideoCanvasHandle>(null);
  const detectBusyRef = useRef(false);

  const objects = useDetectObjects({ model: detrModel });

  const startCamera = async () => {
    if (webcam.isActive) return;
    setLocalError(null);
    await webcam.start();
  };

  // Live face-detection loop: grab a real frame every interval, run
  // MediaPipe BlazeFace on it, draw boxes on the overlay canvas + the still.
  useEffect(() => {
    const stream = webcam.stream;
    if (!stream) return;

    const detectOnFrame = async () => {
      if (detectBusyRef.current) return;
      const video = videoCanvasRef.current?.video;
      const overlay = videoCanvasRef.current?.canvas;
      if (!video || !overlay || video.videoWidth === 0) return;

      detectBusyRef.current = true;
      try {
        const frame = document.createElement('canvas');
        frame.width = video.videoWidth;
        frame.height = video.videoHeight;
        const frameCtx = frame.getContext('2d');
        if (!frameCtx) return;
        frameCtx.drawImage(video, 0, 0);
        const imageData = frameCtx.getImageData(0, 0, frame.width, frame.height);

        const result = await detectFace({ model: getFaceModel(), image: imageData });
        setFaces(result.faces);
        setStill({
          src: frame.toDataURL('image/jpeg', 0.85),
          width: frame.width,
          height: frame.height,
        });

        // Draw the same detections on the VideoCanvas overlay canvas.
        const ctx = overlay.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, overlay.width, overlay.height);
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#10b981';
          ctx.fillStyle = '#10b981';
          ctx.font = '14px sans-serif';
          for (const face of result.faces) {
            ctx.strokeRect(face.box.x, face.box.y, face.box.width, face.box.height);
            ctx.fillText(
              `face ${(face.score * 100).toFixed(0)}%`,
              face.box.x,
              Math.max(14, face.box.y - 4),
            );
            for (const kp of face.keypoints) {
              ctx.beginPath();
              // MediaPipe keypoints are normalized [0,1] coordinates.
              ctx.arc(kp.x * overlay.width, kp.y * overlay.height, 3, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : String(err));
      } finally {
        detectBusyRef.current = false;
      }
    };

    const id = window.setInterval(() => void detectOnFrame(), FACE_DETECT_INTERVAL_MS);
    void detectOnFrame();
    return () => window.clearInterval(id);
  }, [webcam.stream]);

  /** Run DETR on a subject image (already sized). */
  const detectOn = async (next: SubjectImage) => {
    setLocalError(null);
    setSubject(next);
    await objects.execute(next.src);
  };

  /** `detect-objects`: current subject, else the sample. */
  const detectObjects = async () => {
    setLocalError(null);
    try {
      if (subject) {
        await objects.execute(subject.src);
        return;
      }
      const url = new URL(SAMPLE_SRC, window.location.origin).toString();
      const dims = await getImageDimensions(url);
      await detectOn({ ...dims, src: url, origin: 'sample', name: 'sample image' });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleFiles = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setLocalError(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const dims = await getImageDimensions(dataUrl);
      await detectOn({ ...dims, src: dataUrl, origin: 'upload', name: file.name });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    }
  };

  /** Capture the current webcam frame as the DETR subject (growth surface). */
  const captureStill = async () => {
    const video = videoCanvasRef.current?.video;
    if (!video || video.videoWidth === 0) return;
    setLocalError(null);
    const frame = document.createElement('canvas');
    frame.width = video.videoWidth;
    frame.height = video.videoHeight;
    frame.getContext('2d')?.drawImage(video, 0, 0);
    await detectOn({
      src: frame.toDataURL('image/jpeg', 0.9),
      width: frame.width,
      height: frame.height,
      origin: 'webcam',
      name: 'webcam capture',
    });
  };

  const clear = () => {
    setSubject(null);
    setLocalError(null);
    objects.reset();
  };

  const detections = objects.data?.objects ?? [];
  const objectsError = objects.error?.message ?? null;
  const errorText = localError ?? webcam.error?.message ?? objectsError;

  // Real download progress (0–1) streamed by useModelLoad's create-bound
  // onProgress while the first detection pulls the DETR weights.
  const detrDownloading = objects.isLoading && detr.progress > 0 && detr.progress < 1;

  const statusText = objects.isLoading
    ? 'detecting objects'
    : errorText
      ? 'error'
      : webcam.isActive
        ? faces
          ? `camera on - ${faces.length} face(s)`
          : 'camera on - detecting faces'
        : objects.data
          ? 'objects detected'
          : 'idle';

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Single consolidated, user-facing status region (the raw
          "camera: X · objects: Y" debug line was removed). */}
      <p role="status" aria-live="polite" aria-label="Detector status" className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Status:</span> {statusText}
      </p>
      {errorText && (
        <div role="alert" className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-destructive">{errorText}</p>
          <button
            type="button"
            onClick={() => {
              webcam.clearError();
              objects.reset();
              if (webcam.error) void startCamera();
              else void detectObjects();
            }}
            className="inline-flex h-6 items-center gap-1 rounded-md border border-border px-2 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RotateCcw className="h-3 w-3" aria-hidden />
            Retry
          </button>
        </div>
      )}

      {/* ── (a) one-shot DETR object detection ── */}
      <section aria-labelledby="od-detect-heading" className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h2 id="od-detect-heading" className="sr-only">
          Object detection
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void detectObjects()}
            disabled={objects.isLoading}
            className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {objects.isLoading
              ? 'Detecting…'
              : subject
                ? 'Detect objects'
                : 'Detect objects (sample image)'}
          </button>
          <span className="text-sm">
            Objects found: <span className="tabular-nums">{objects.data ? detections.length : '-'}</span>
          </span>
          {subject && (
            <button
              type="button"
              onClick={clear}
              disabled={objects.isLoading}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              Clear
            </button>
          )}
        </div>

        {!subject && (
          <div className="max-w-xl">
            <MediaDropzone
              accept={ACCEPTED_IMAGE_TYPES}
              multiple={false}
              processing={objects.isLoading}
              processingLabel="Detecting objects…"
              title="Drop an image to detect objects"
              subtitle="or click to browse: PNG, JPEG, WebP, GIF"
              onFiles={(files) => void handleFiles(files)}
              onReject={(rejections) =>
                setLocalError(rejections[0]?.reason ?? 'That file type is not supported.')
              }
            />
          </div>
        )}

        {subject && (
          <div className="flex flex-col gap-3">
            <div
              role="group"
              aria-label="Detection subject"
              data-origin={subject.origin}
              className="relative max-w-xl"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={subject.src} alt={`Detection subject (${subject.name})`} className="w-full rounded-md" />
              <BoundingBoxOverlay
                detections={detections}
                naturalWidth={subject.width}
                naturalHeight={subject.height}
              />
              <ImageProcessingOverlay
                processing={objects.isLoading}
                variant="scan"
                status={
                  detrDownloading
                    ? `Downloading model… ${(detr.progress * 100).toFixed(0)}%`
                    : 'Detecting objects…'
                }
                detail={DETR_MODEL_ID}
                onCancel={objects.cancel}
              />
            </div>

            {objects.data && detections.length > 0 && (
              <div role="group" aria-label="Detected object labels">
                <DetectionLabelLegend labels={detections.map((d) => d.label)} />
              </div>
            )}

            {objects.data && (
              <div role="group" aria-label="Detection results" className="max-w-xl">
                <ScoredResultBarList
                  results={detections.map((d) => ({ label: d.label, score: d.score }))}
                  emptyState="No objects detected"
                />
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── (b) live webcam + MediaPipe BlazeFace loop (wasm + camera gated) ── */}
      <CapabilityGate requires="wasm">
        <CapabilityGate requires="camera">
          <section aria-labelledby="od-camera-heading" className="flex flex-col gap-3 rounded-lg border border-border p-4">
            <h2 id="od-camera-heading" className="sr-only">
              Live webcam face tracking
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void startCamera()}
                disabled={webcam.isActive}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Camera className="h-3.5 w-3.5" aria-hidden />
                {webcam.isActive ? 'Camera running' : 'Start camera'}
              </button>
              <span className="text-sm">
                Faces detected: <span className="tabular-nums">{faces ? faces.length : '-'}</span>
              </span>
              {webcam.isActive && (
                <button
                  type="button"
                  onClick={() => void captureStill()}
                  disabled={objects.isLoading}
                  className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Capture still → detect objects
                </button>
              )}
            </div>

            <div className="max-w-xl">
              <VideoCanvas ref={videoCanvasRef} stream={webcam.stream} mirrored={false} hideFps />
            </div>

            {still && faces && (
              <div>
                <p className="mb-1 text-xs text-muted-foreground">
                  Captured still + BoundingBoxOverlay (same detections)
                </p>
                <div className="relative w-80">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={still.src} alt="Captured webcam still" className="w-full rounded-md" />
                  <BoundingBoxOverlay
                    detections={faces.map((f) => ({
                      label: 'face',
                      score: f.score,
                      box: f.box,
                    }))}
                    naturalWidth={still.width}
                    naturalHeight={still.height}
                  />
                </div>
              </div>
            )}
          </section>
        </CapabilityGate>
      </CapabilityGate>
    </div>
  );
}
