/**
 * @file audio-tab.tsx
 * @description Audio classification tab (microphone + file upload)
 */
'use client';

import { useRef } from 'react';
import { Mic, Square, Upload } from 'lucide-react';
import { useAudioClassifier } from '../_hooks';
import { Button, Spinner, Badge } from './ui';
import { ErrorAlert } from './error-boundary';
import { formatPercent } from '../_lib/utils';

/** Audio classification tab — classifies sounds with MediaPipe YAMNet. */
export function AudioTab() {
  const {
    predictions,
    isClassifying,
    isRecording,
    error,
    classify,
    startRecording,
    stopRecording,
    clearError,
  } = useAudioClassifier();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void classify(file);
    event.target.value = '';
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <div className="card space-y-4 bg-poster-surface p-5">
        <div>
          <h3 className="text-sm font-semibold text-poster-text-main">Input</h3>
          <p className="mt-1 text-xs text-poster-text-sub">
            Record a sound or upload an audio file. YAMNet classifies it into 521
            environmental sound categories.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {isRecording ? (
            <Button variant="primary" onClick={stopRecording}>
              <Square className="mr-2 h-4 w-4" />
              Stop &amp; Classify
            </Button>
          ) : (
            <Button variant="primary" onClick={startRecording} disabled={isClassifying}>
              <Mic className="mr-2 h-4 w-4" />
              Record
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => fileInputRef.current?.click()}
            disabled={isClassifying || isRecording}
          >
            <Upload className="mr-2 h-4 w-4" />
            Upload Audio
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={handleFile}
          />
        </div>

        {isRecording && (
          <div className="flex items-center gap-2 text-sm text-poster-primary">
            <span className="h-2 w-2 animate-pulse rounded-full bg-error" />
            Recording…
          </div>
        )}

        {error && <ErrorAlert message={error.message} onDismiss={clearError} />}
      </div>

      <div className="card bg-poster-surface p-5">
        <h3 className="mb-3 text-sm font-semibold text-poster-text-main">
          Top Predictions
        </h3>
        {isClassifying ? (
          <div className="flex items-center gap-2 text-sm text-poster-text-sub">
            <Spinner size="sm" />
            Classifying…
          </div>
        ) : predictions.length === 0 ? (
          <p className="text-sm text-poster-text-sub">
            No results yet — record or upload audio to classify it.
          </p>
        ) : (
          <div className="space-y-2">
            {predictions.map((prediction, i) => (
              <div key={prediction.label}>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-poster-text-main">
                    {i === 0 && <Badge variant="success">Top</Badge>}
                    {prediction.label}
                  </span>
                  <span className="text-poster-text-sub">
                    {formatPercent(prediction.score)}
                  </span>
                </div>
                <progress
                  className="progress progress-primary h-1.5"
                  value={prediction.score}
                  max={1}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
