'use client';

/**
 * @file live-tracker.tsx
 * @description Vision — Live Tracker: one block, a 4-mode picker (Hands 21-pt / Pose 33-pt / Face 478-pt mesh + blendshapes / Gestures) over real-time MediaPipe streaming trackers on live webcam video.
 * @constraint Exactly one tracker/WASM task alive at a time — each sub-mode is exclusively mounted (React key per mode) and useStreamingTracker.close()s the previous on unmount, sidestepping the MediaPipe audio↔vision WASM concurrency conflict (mediapipe#4737).
 */

import { useRef, useState, type ReactNode } from 'react';
import { RotateCcw, Video, VideoOff } from 'lucide-react';
import { useStreamingTracker } from '@localmode/react';
import {
  FACE_CONNECTIONS,
  HAND_CONNECTIONS,
  POSE_CONNECTIONS,
  type FaceLandmarkResultItem,
  type GestureResultItem,
  type HandLandmarkResultItem,
  type PoseLandmarkResultItem,
} from '@localmode/core';
import {
  createFaceTracker,
  createGestureTracker,
  createHandTracker,
  createPoseTracker,
  type TrackerInstance,
} from '@localmode/mediapipe';

import { VideoCanvas, type VideoCanvasHandle } from '@/components/video-canvas';
import { CapabilityGate } from '@/components/capability-gate';
import { ConfidenceScoreBadge } from '@/components/confidence-score-badge';
import { ScoredResultBarList } from '@/components/scored-result-bar-list';
import { SegmentedModePicker } from '@/components/segmented-mode-picker';

import { useWebcam } from '@/hooks/use-webcam';

/** The minimal landmark shape the drawing helpers need (normalized [0,1]). */
interface DrawableLandmark {
  x: number;
  y: number;
}

/** Per-finger colors for the 21-point hand skeleton (mediapipe-studio parity). */
const FINGER_COLORS = {
  palm: '#e5e7eb',
  thumb: '#ef4444',
  index: '#f59e0b',
  middle: '#22c55e',
  ring: '#3b82f6',
  pinky: '#a855f7',
} as const;

/** Landmark-index groups of the MediaPipe 21-point hand topology. */
const FINGER_RANGES: ReadonlyArray<{ color: string; indices: readonly number[] }> = [
  { color: FINGER_COLORS.palm, indices: [0] },
  { color: FINGER_COLORS.thumb, indices: [1, 2, 3, 4] },
  { color: FINGER_COLORS.index, indices: [5, 6, 7, 8] },
  { color: FINGER_COLORS.middle, indices: [9, 10, 11, 12] },
  { color: FINGER_COLORS.ring, indices: [13, 14, 15, 16] },
  { color: FINGER_COLORS.pinky, indices: [17, 18, 19, 20] },
];

/** Clear the full overlay canvas. */
function clearCanvas(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

/**
 * Stroke landmark-pair connection lines (skeleton edges). `connections` is a
 * `[fromIndex, toIndex][]` topology (e.g. core `POSE_CONNECTIONS`).
 */
function drawConnections(
  ctx: CanvasRenderingContext2D,
  landmarks: readonly DrawableLandmark[],
  connections: ReadonlyArray<readonly [number, number]>,
  color: string,
  lineWidth = 2,
): void {
  const { width, height } = ctx.canvas;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  for (const [from, to] of connections) {
    const a = landmarks[from];
    const b = landmarks[to];
    if (!a || !b) continue;
    ctx.moveTo(a.x * width, a.y * height);
    ctx.lineTo(b.x * width, b.y * height);
  }
  ctx.stroke();
}

/** Fill a dot per landmark. */
function drawPoints(
  ctx: CanvasRenderingContext2D,
  landmarks: readonly DrawableLandmark[],
  color: string,
  radius = 4,
): void {
  const { width, height } = ctx.canvas;
  ctx.fillStyle = color;
  for (const landmark of landmarks) {
    ctx.beginPath();
    ctx.arc(landmark.x * width, landmark.y * height, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Draw one 21-point hand: white connection skeleton (`HAND_CONNECTIONS`) plus
 * per-finger colored landmark dots (mediapipe-studio parity).
 */
function drawHand(
  ctx: CanvasRenderingContext2D,
  landmarks: readonly DrawableLandmark[],
): void {
  drawConnections(ctx, landmarks, HAND_CONNECTIONS, '#ffffff');
  for (const { color, indices } of FINGER_RANGES) {
    drawPoints(
      ctx,
      indices.map((i) => landmarks[i]).filter((l): l is DrawableLandmark => l != null),
      color,
    );
  }
}

/** The four tracker sub-modes (mediapipe-studio vision-tab parity). */
type TrackMode = 'hands' | 'pose' | 'face' | 'gestures';

const MODES: Array<{ id: TrackMode; label: string }> = [
  { id: 'hands', label: 'Hands' },
  { id: 'pose', label: 'Pose' },
  { id: 'face', label: 'Face' },
  { id: 'gestures', label: 'Gestures' },
];

/** Raw MediaPipe gesture category → human-readable label (8 categories). */
const GESTURE_LABELS: Record<string, string> = {
  None: 'No gesture',
  Closed_Fist: 'Closed Fist',
  Open_Palm: 'Open Palm',
  Pointing_Up: 'Pointing Up',
  Thumb_Down: 'Thumbs Down',
  Thumb_Up: 'Thumbs Up',
  Victory: 'Victory',
  ILoveYou: 'I Love You',
};

/** Overlay colors (mediapipe-studio parity). */
const POSE_COLOR = '#22d3ee';
const FACE_COLOR = '#f472b6';

export function LiveTrackerBlock() {
  const [mode, setMode] = useState<TrackMode>('hands');
  // Face blendshapes toggle (default on) — lifted so it survives remounts.
  const [showBlendshapes, setShowBlendshapes] = useState(true);

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Block-root live status — announces the active tracker sub-mode. */}
      <p role="status" aria-live="polite" className="sr-only">
        {mode} tracker selected
      </p>

      <SegmentedModePicker<TrackMode>
        items={MODES}
        selectedId={mode}
        onSelect={setMode}
        aria-label="Streaming tracker"
      />

      <CapabilityGate requires="wasm">
        <CapabilityGate requires="camera">
          {/* Exclusive mounting per sub-mode: the key remounts the surface,
              and useStreamingTracker close()s the previous tracker on
              unmount — one tracker/WASM task alive at a time. */}
          {mode === 'hands' && (
            <TrackerSurface<HandLandmarkResultItem>
              key="hands"
              create={({ video, onResults, onError }) =>
                createHandTracker({ video, onResults, onError })
              }
              draw={(ctx, hands) => {
                for (const hand of hands) drawHand(ctx, hand.landmarks);
              }}
              landmarkCount={(hands) => hands[0]?.landmarks.length ?? 0}
              idleHint="Start the camera and hold up a hand: 21 landmarks per hand, up to 2 hands."
              panel={(hands) => (
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium">Detected hands</p>
                  {hands.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No hands detected yet.</p>
                  ) : (
                    hands.map((hand, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                      >
                        <span className="text-sm">{hand.handedness} hand</span>
                        <ConfidenceScoreBadge score={hand.score} />
                      </div>
                    ))
                  )}
                </div>
              )}
            />
          )}

          {mode === 'pose' && (
            <TrackerSurface<PoseLandmarkResultItem>
              key="pose"
              create={({ video, onResults, onError }) =>
                createPoseTracker({ video, onResults, onError })
              }
              draw={(ctx, poses) => {
                for (const pose of poses) {
                  drawConnections(ctx, pose.landmarks, POSE_CONNECTIONS, POSE_COLOR);
                  drawPoints(ctx, pose.landmarks, '#ffffff', 3);
                }
              }}
              landmarkCount={(poses) => poses[0]?.landmarks.length ?? 0}
              idleHint="Start the camera and step back until your upper body is in frame."
              panel={(poses) => (
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium">Pose tracking</p>
                  <p className="text-sm text-muted-foreground">
                    {poses.length > 0
                      ? `Tracking ${poses.length} person(s): 33 body landmarks each.`
                      : 'No pose detected yet, stand back so more of your body is visible.'}
                  </p>
                </div>
              )}
            />
          )}

          {mode === 'face' && (
            <TrackerSurface<FaceLandmarkResultItem>
              key="face"
              create={({ video, onResults, onError }) =>
                // Blendshapes always computed; the toggle gates the panel so
                // flipping it mid-run needs no tracker rebuild.
                createFaceTracker({ video, onResults, onError, outputBlendshapes: true })
              }
              draw={(ctx, faces) => {
                for (const face of faces) {
                  drawConnections(ctx, face.landmarks, FACE_CONNECTIONS, FACE_COLOR);
                  drawPoints(ctx, face.landmarks, 'rgba(255,255,255,0.5)', 1);
                }
              }}
              landmarkCount={(faces) => faces[0]?.landmarks.length ?? 0}
              idleHint="Start the camera and face it: a 478-point mesh with optional expression blendshapes."
              panel={(faces) => {
                const blendshapes = faces[0]?.blendshapes ?? [];
                return (
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={showBlendshapes}
                        onChange={(e) => setShowBlendshapes(e.target.checked)}
                        className="h-4 w-4 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                      Show expression blendshapes
                    </label>
                    {showBlendshapes && (
                      <div role="group" aria-label="Expression blendshapes">
                        <ScoredResultBarList
                          results={blendshapes.map((b) => ({
                            label: b.categoryName,
                            score: b.score,
                          }))}
                          limit={8}
                          emptyState="No face in view yet."
                        />
                      </div>
                    )}
                  </div>
                );
              }}
            />
          )}

          {mode === 'gestures' && (
            <TrackerSurface<GestureResultItem>
              key="gestures"
              create={({ video, onResults, onError }) =>
                createGestureTracker({ video, onResults, onError })
              }
              draw={(ctx, gestures) => {
                for (const gesture of gestures) drawHand(ctx, gesture.landmarks);
              }}
              landmarkCount={(gestures) => gestures[0]?.landmarks.length ?? 0}
              idleHint="Start the camera and make a gesture: thumbs up, victory, open palm, fist…"
              badge={(gestures) => {
                const top = topGesture(gestures);
                return (
                  <span
                    role="status"
                    aria-label="Recognized gesture"
                    data-gesture={top?.gesture ?? ''}
                    className="rounded-md bg-black/70 px-2 py-1 text-xs font-medium text-white"
                  >
                    {top ? (GESTURE_LABELS[top.gesture] ?? top.gesture) : 'No gesture yet'}
                  </span>
                );
              }}
              panel={(gestures) => {
                const top = topGesture(gestures);
                return (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium">Recognized gesture</p>
                    {top ? (
                      <div className="flex flex-col gap-1 rounded-md border border-border px-3 py-2">
                        <span className="text-xl font-semibold">
                          {GESTURE_LABELS[top.gesture] ?? top.gesture}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {(top.score * 100).toFixed(1)}% confidence · {top.handedness} hand
                        </span>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Make a gesture: thumbs up, victory, open palm, fist…
                      </p>
                    )}
                  </div>
                );
              }}
            />
          )}
        </CapabilityGate>
      </CapabilityGate>
    </div>
  );
}

/** Prefer the first non-`None` gesture (mediapipe-studio parity). */
function topGesture(gestures: GestureResultItem[]) {
  return gestures.find((g) => g.gesture !== 'None') ?? gestures[0] ?? null;
}

/* ───────────────────────────── TrackerSurface ───────────────────────────── */

interface TrackerCreateContext<T> {
  video: HTMLVideoElement;
  onResults: (results: T[], timestampMs: number) => void;
  onError: (error: Error) => void;
}

interface TrackerSurfaceProps<T> {
  /** Build the provider tracker for this sub-mode. */
  create: (ctx: TrackerCreateContext<T>) => TrackerInstance;
  /** Per-frame overlay drawing (called from the tracker's results callback). */
  draw: (ctx: CanvasRenderingContext2D, results: T[]) => void;
  /** Landmark count of the first result (drives `data-points`). */
  landmarkCount: (results: T[]) => number;
  /** Sidebar result panel for the latest results. */
  panel: (results: T[]) => ReactNode;
  /** Optional badge-slot content over the video (e.g. the gesture chip). */
  badge?: (results: T[]) => ReactNode;
  /** Hint shown while the camera is off. */
  idleHint: string;
}

/**
 * Shared per-sub-mode surface: webcam (1280×720) + `useStreamingTracker` +
 * `VideoCanvas` drawing/FPS + result panel. Per-frame drawing happens inside
 * the tracker's `onResults` callback (imperative canvas work); the
 * hook's throttled `results` state feeds the sidebar panel.
 */
function TrackerSurface<T>({
  create,
  draw,
  landmarkCount,
  panel,
  badge,
  idleHint,
}: TrackerSurfaceProps<T>) {
  const videoCanvasRef = useRef<VideoCanvasHandle>(null);
  const webcam = useWebcam({ width: 1280, height: 720 });

  const tracker = useStreamingTracker<T[]>({
    video: () => videoCanvasRef.current?.video ?? null,
    create: (ctx) => create(ctx),
    onResults: (results) => {
      const canvas = videoCanvasRef.current?.canvas;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      clearCanvas(ctx);
      draw(ctx, results);
    },
  });

  const running = tracker.status === 'running';
  const starting = tracker.status === 'starting';
  const results = tracker.results ?? [];

  const toggle = async () => {
    if (webcam.isActive || running || starting) {
      tracker.stop();
      webcam.stop();
      const ctx = videoCanvasRef.current?.canvas?.getContext('2d');
      if (ctx) clearCanvas(ctx);
      return;
    }
    webcam.clearError();
    const stream = await webcam.start();
    if (!stream) return;
    await tracker.start();
  };

  const errorText = webcam.error?.message ?? tracker.error?.message ?? null;
  const statusValue = errorText
    ? 'error'
    : starting
      ? 'loading'
      : running
        ? tracker.results
          ? 'running'
          : 'waiting'
        : 'idle';

  return (
    <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void toggle()}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {webcam.isActive ? (
              <VideoOff className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Video className="h-3.5 w-3.5" aria-hidden />
            )}
            {webcam.isActive ? 'Stop camera' : 'Start camera'}
          </button>
          <p
            role="status"
            aria-live="polite"
            aria-label="Tracker status"
            data-status={statusValue}
            className="text-xs text-muted-foreground"
          >
            {errorText
              ? 'error'
              : starting
                ? 'loading tracker model…'
                : running
                  ? tracker.results
                    ? 'tracking'
                    : 'waiting for first results…'
                  : 'idle'}
          </p>
          <span
            role="status"
            aria-label="Tracker frames per second"
            data-fps={tracker.fps}
            className="text-xs tabular-nums text-muted-foreground"
          >
            {running ? `${tracker.fps} fps` : ''}
          </span>
          <span role="status" aria-label="Tracked item count" data-count={results.length} className="sr-only">
            {results.length}
          </span>
          <span role="status" aria-label="Landmark count" data-points={landmarkCount(results)} className="sr-only">
            {landmarkCount(results)}
          </span>
        </div>

        {errorText && (
          <div role="alert" className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-destructive">{errorText}</p>
            <button
              type="button"
              onClick={() => void toggle()}
              className="inline-flex h-6 items-center gap-1 rounded-md border border-border px-2 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <RotateCcw className="h-3 w-3" aria-hidden />
              Retry
            </button>
          </div>
        )}

        <VideoCanvas
          ref={videoCanvasRef}
          stream={webcam.stream}
          fps={running ? tracker.fps : undefined}
        >
          {badge && webcam.isActive ? badge(results) : null}
        </VideoCanvas>

        {!webcam.isActive && <p className="text-xs text-muted-foreground">{idleHint}</p>}
        {starting && (
          <p className="text-xs text-muted-foreground">
            Loading the tracker model… it downloads once, then runs fully on-device.
          </p>
        )}
      </div>

      <div role="group" aria-label="Tracker output" className="rounded-lg border border-border p-3">
        {panel(results)}
      </div>
    </div>
  );
}
