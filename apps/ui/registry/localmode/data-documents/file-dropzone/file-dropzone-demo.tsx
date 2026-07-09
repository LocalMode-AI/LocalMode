'use client';

import * as React from 'react';
import { FileDropzone, type RejectedFile } from './file-dropzone';

/**
 * Demo for the FileDropzone component, used by the docs live preview.
 * Accepts PDF/CSV/JSON up to 10MB. Shows accepted + rejected files and a
 * "processing" toggle so the disabled overlay is visible. No model download —
 * validation runs entirely in the browser.
 */
export default function FileDropzoneDemo() {
  const [accepted, setAccepted] = React.useState<File[]>([]);
  const [rejected, setRejected] = React.useState<RejectedFile[]>([]);
  const [processing, setProcessing] = React.useState(false);

  return (
    <div className="w-full max-w-md space-y-3">
      <FileDropzone
        accept={['application/pdf', 'text/csv', 'application/json']}
        maxSize={10_000_000}
        processing={processing}
        onUpload={(files) => {
          setRejected([]);
          setAccepted(files);
        }}
        onReject={setRejected}
      />

      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={processing}
          onChange={(e) => setProcessing(e.target.checked)}
        />
        Simulate processing overlay
      </label>

      {accepted.length > 0 && (
        <ul className="space-y-1 text-xs text-foreground">
          {accepted.map((f) => (
            <li key={f.name}>
              ✓ {f.name} ({(f.size / 1000).toFixed(0)}KB)
            </li>
          ))}
        </ul>
      )}

      {rejected.length > 0 && (
        <ul className="space-y-1 text-xs text-destructive">
          {rejected.map((r) => (
            <li key={r.file.name}>✕ {r.reason}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
