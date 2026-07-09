'use client';

import * as React from 'react';
import { MediaDropzone } from './media-dropzone';

/**
 * Demo for the MediaDropzone component, used by the docs live preview.
 * Exercises the idle / drag-over / processing states and the "add another"
 * variant with no model download — selected files are listed locally.
 */
export default function MediaDropzoneDemo() {
  const [files, setFiles] = React.useState<File[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [processing, setProcessing] = React.useState(false);

  function handleFiles(next: File[]) {
    setError(null);
    setFiles((prev) => [...prev, ...next]);
    // Simulate a short "processing" pass so the overlay is visible.
    setProcessing(true);
    setTimeout(() => setProcessing(false), 1200);
  }

  return (
    <div className="w-full max-w-md space-y-3">
      {files.length === 0 ? (
        <MediaDropzone
          accept={['image/png', 'image/jpeg', 'image/webp']}
          maxSize={5_000_000}
          processing={processing}
          onFiles={handleFiles}
          onReject={(r) => setError(r[0]?.reason ?? 'Rejected')}
        />
      ) : (
        <>
          <ul className="space-y-1 text-sm text-foreground">
            {files.map((file, i) => (
              <li
                key={`${file.name}-${i}`}
                className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2"
              >
                <span className="truncate">{file.name}</span>
                <span className="text-xs text-muted-foreground">
                  {(file.size / 1000).toFixed(0)} KB
                </span>
              </li>
            ))}
          </ul>
          <MediaDropzone
            addAnother
            accept={['image/png', 'image/jpeg', 'image/webp']}
            maxSize={5_000_000}
            processing={processing}
            onFiles={handleFiles}
            onReject={(r) => setError(r[0]?.reason ?? 'Rejected')}
          />
        </>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
