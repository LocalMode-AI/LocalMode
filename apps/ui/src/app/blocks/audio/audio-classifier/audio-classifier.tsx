'use client';

/**
 * @file audio-classifier.tsx
 * @description Audio — Audio Classifier: MediaPipe YAMNet (521 categories) top-8 sound classification from a microphone recording or an uploaded audio file, fully on-device.
 */

import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Upload } from 'lucide-react';
import {
  classifyAudio,
  type AudioClassificationModel,
  type AudioClassificationResultItem,
} from '@localmode/core';
import { mediapipe } from '@localmode/mediapipe';

import { CapabilityGate } from '@/components/capability-gate';
import { ErrorAlert } from '@/components/error-alert';
import { ScoredResultBarList } from '@/components/scored-result-bar-list';
import { WaveformActivityBars } from '@/components/waveform-activity-bars';

/** Lazy YAMNet singleton (creation is cheap; the task/model loads on first use). */
let audioModel: AudioClassificationModel | null = null;
const getAudioClassifier = () => (audioModel ??= mediapipe.audioClassifier());

/** Lifecycle of the classify pipeline. */
export type AudioClassifierStatus = 'idle' | 'recording' | 'classifying' | 'done' | 'error';

/** A recoverable audio error. */
export interface AudioClassifierError {
  kind: 'permission' | 'classify';
  message: string;
}

/**
 * Own the record → classify pipeline: microphone capture via MediaRecorder
 * (stop triggers automatic classification of the captured blob), direct file
 * classification for uploads, abort support, and a retry that re-classifies
 * the last audio input.
 */
export function useAudioClassifier() {
  const [predictions, setPredictions] = useState<AudioClassificationResultItem[]>([]);
  const [status, setStatus] = useState<AudioClassifierStatus>('idle');
  const [error, setError] = useState<AudioClassifierError | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const lastAudioRef = useRef<Blob | null>(null);

  // Abort in-flight work and release the microphone on unmount (tab switch).
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      recorder?.stream.getTracks().forEach((t) => t.stop());
      recorderRef.current = null;
    };
  }, []);

  /** Classify a recorded or uploaded audio blob (YAMNet top-8). */
  const classify = async (audio: Blob) => {
    lastAudioRef.current = audio;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('classifying');
    setError(null);
    try {
      const result = await classifyAudio({
        model: getAudioClassifier(),
        audio,
        topK: 8,
        abortSignal: controller.signal,
      });
      setPredictions(result.predictions);
      setStatus('done');
    } catch (err) {
      if (controller.signal.aborted) {
        setStatus('idle');
        return;
      }
      setError({
        kind: 'classify',
        message: err instanceof Error ? err.message : String(err),
      });
      setStatus('error');
    }
  };

  const startRecording = async () => {
    if (recorderRef.current) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        recorderRef.current = null;
        void classify(blob);
      };
      recorder.start();
      recorderRef.current = recorder;
      setStatus('recording');
    } catch {
      setError({
        kind: 'permission',
        message: 'Microphone access was denied. Grant microphone permission and try again.',
      });
      setStatus('error');
    }
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    // `onstop` releases the tracks and kicks off classification.
    recorder.stop();
  };

  const cancel = () => {
    abortRef.current?.abort();
  };

  /** Re-run classification on the last recorded/uploaded audio. */
  const retry = () => {
    if (lastAudioRef.current) void classify(lastAudioRef.current);
  };

  const clearError = () => {
    setError(null);
    if (status === 'error') setStatus(predictions.length > 0 ? 'done' : 'idle');
  };

  return {
    predictions,
    status,
    error,
    isRecording: status === 'recording',
    classify,
    startRecording,
    stopRecording,
    cancel,
    retry,
    clearError,
  };
}

export function AudioClassifierBlock() {
  const audio = useAudioClassifier();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const statusText =
    audio.status === 'recording'
      ? 'Recording…'
      : audio.status === 'classifying'
        ? 'Classifying…'
        : audio.status === 'done'
          ? `Done - top: ${audio.predictions[0]?.label ?? ''}`
          : audio.status === 'error'
            ? 'Error'
            : 'Idle - record or upload audio to classify';

  return (
    <div className="flex flex-col gap-3 p-4">
      <p
        data-status={audio.status}
        role="status"
        aria-live="polite"
        aria-label="Status"
        className="text-xs text-muted-foreground"
      >
        {statusText}
      </p>

      {audio.error && (
        <ErrorAlert
          message={audio.error.message}
          onRetry={() => {
            if (audio.error?.kind === 'permission') {
              audio.clearError();
              void audio.startRecording();
            } else {
              audio.retry();
            }
          }}
          onDismiss={audio.clearError}
        />
      )}

      <CapabilityGate requires="wasm">
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
          {/* ── input card ── */}
          <section
            aria-label="Classify a sound"
            className="flex flex-col gap-3 rounded-lg border border-border p-4"
          >
            <div>
              <p className="text-sm font-medium">Classify a sound</p>
              <p className="text-xs text-muted-foreground">
                MediaPipe YAMNet - 521 environmental sound categories, fully on-device. The model
                downloads on your first classification.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <CapabilityGate requires="microphone">
                <button
                  type="button"
                  data-recording={audio.isRecording}
                  onClick={() =>
                    audio.isRecording ? audio.stopRecording() : void audio.startRecording()
                  }
                  disabled={audio.status === 'classifying'}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
                >
                  {audio.isRecording ? (
                    <Square className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <Mic className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {audio.isRecording ? 'Stop & classify' : 'Record'}
                </button>
              </CapabilityGate>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={audio.isRecording || audio.status === 'classifying'}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
              >
                <Upload className="h-3.5 w-3.5" aria-hidden />
                Upload audio
              </button>
              <input
                ref={fileInputRef}
                aria-label="Upload audio file"
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void audio.classify(file);
                  e.target.value = '';
                }}
              />
            </div>

            {audio.isRecording && (
              <div className="flex items-center gap-3">
                <WaveformActivityBars state="record" label="recording activity" />
                <span className="text-xs font-medium text-destructive">Recording…</span>
              </div>
            )}
          </section>

          {/* ── results card ── */}
          <section
            aria-label="Top predictions"
            className="flex flex-col gap-3 rounded-lg border border-border p-4"
          >
            <p className="text-sm font-medium">Top predictions</p>
            <ScoredResultBarList
              results={audio.predictions.map((p) => ({ label: p.label, score: p.score }))}
              isLoading={audio.status === 'classifying'}
              limit={8}
              emptyState="No classification yet - record or upload a sound."
            />
          </section>
        </div>
      </CapabilityGate>
    </div>
  );
}
