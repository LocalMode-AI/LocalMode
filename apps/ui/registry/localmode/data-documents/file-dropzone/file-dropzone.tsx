'use client';

import * as React from 'react';
import { validateFile } from '@/lib/browser-utils';
import { UploadCloud, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** A file that failed `validateFile`, paired with the reason. */
export interface RejectedFile {
  /** The rejected file. */
  file: File;
  /** Human-readable validation message from `validateFile`. */
  reason: string;
}

/** Props for {@link FileDropzone}. */
export interface FileDropzoneProps {
  /**
   * Called with the files that passed validation (accept-list + max-size).
   * Only valid files are included.
   */
  onUpload: (files: File[]) => void;
  /**
   * Called when one or more dropped/selected files fail validation. Optional —
   * use it to surface per-file errors.
   */
  onReject?: (rejected: RejectedFile[]) => void;
  /**
   * Accepted MIME types, e.g. `['application/pdf', 'text/csv', 'application/json']`.
   * Passed to the native input's `accept` attribute (as a comma-joined list)
   * and enforced by `validateFile`. When omitted, all types are accepted.
   */
  accept?: string[];
  /** Maximum file size in bytes. Files larger than this are rejected. */
  maxSize?: number;
  /**
   * Allow selecting more than one file at a time.
   * @default true
   */
  multiple?: boolean;
  /**
   * Disable the zone (blocks drag and click). Combine with `processing` for an
   * "uploading…" state.
   * @default false
   */
  disabled?: boolean;
  /**
   * Show the processing overlay and block input. Use while files are being
   * indexed/parsed.
   * @default false
   */
  processing?: boolean;
  /** Message shown in the processing overlay. @default "Processing…" */
  processingLabel?: string;
  /** Primary call-to-action text. @default "Drop files or click to browse" */
  label?: string;
  /**
   * Secondary hint line. Defaults to a human-readable summary of `accept` and
   * `maxSize`.
   */
  hint?: string;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/** Format a byte count as a short human-readable string. */
function formatBytes(bytes: number) {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(0)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)} KB`;
  return `${bytes} B`;
}

/** Derive a default hint from the accept-list and max size. */
function defaultHint(accept?: string[], maxSize?: number) {
  const parts: string[] = [];
  if (accept && accept.length > 0) {
    const exts = accept
      .map((t) => t.split('/').pop()?.toUpperCase() ?? t)
      .join(', ');
    parts.push(exts);
  }
  if (maxSize !== undefined) parts.push(`up to ${formatBytes(maxSize)}`);
  return parts.join(' · ') || undefined;
}

/**
 * A generic, format-agnostic drag-and-drop + click-to-browse upload zone. Built
 * for non-image files (PDF, CSV, JSON, vector exports) — it has no image-preview
 * semantics (use `MediaDropzone` for thumbnails). Validates each file with
 * the copy-owned `validateFile` (from `@/lib/browser-utils`) against the
 * `accept` MIME list and `maxSize`, emitting only valid files via `onUpload`; rejected files go to
 * `onReject`.
 *
 * Styled with shadcn/ui CSS variables so it inherits the consumer's theme. The
 * `processing`/`disabled` overlay blocks further input.
 *
 * @example
 * ```tsx
 * <FileDropzone
 *   accept={['application/pdf', 'text/csv', 'application/json']}
 *   maxSize={10_000_000}
 *   onUpload={(files) => ingest(files)}
 *   onReject={(rejected) => setErrors(rejected)}
 * />
 * ```
 */
export function FileDropzone({
  onUpload,
  onReject,
  accept,
  maxSize,
  multiple = true,
  disabled = false,
  processing = false,
  processingLabel = 'Processing…',
  label = 'Drop files or click to browse',
  hint,
  className,
}: FileDropzoneProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  const blocked = disabled || processing;
  const resolvedHint = hint ?? defaultHint(accept, maxSize);

  /** Validate a FileList, splitting into valid + rejected, then emit. */
  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const valid: File[] = [];
    const rejected: RejectedFile[] = [];

    for (const file of Array.from(fileList)) {
      const error = validateFile({ file, accept, maxSize });
      if (error) {
        rejected.push({ file, reason: error.message });
      } else {
        valid.push(file);
      }
    }

    if (rejected.length > 0) onReject?.(rejected);
    if (valid.length > 0) onUpload(multiple ? valid : valid.slice(0, 1));
  };

  const openPicker = () => {
    if (blocked) return;
    inputRef.current?.click();
  };

  return (
    <div
      role="button"
      tabIndex={blocked ? -1 : 0}
      aria-disabled={blocked}
      aria-busy={processing}
      onClick={openPicker}
      onKeyDown={(e) => {
        if (blocked) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openPicker();
        }
      }}
      onDragOver={(e) => {
        if (blocked) return;
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        if (blocked) return;
        handleFiles(e.dataTransfer.files);
      }}
      className={cn(
        'relative flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-card px-6 py-10 text-center transition-colors outline-none',
        !blocked &&
          'cursor-pointer hover:border-primary/50 hover:bg-accent focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50',
        isDragging && 'border-primary bg-primary/5',
        blocked && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept={accept?.join(',')}
        multiple={multiple}
        disabled={blocked}
        onChange={(e) => {
          handleFiles(e.target.files);
          // Reset so selecting the same file again re-fires onChange.
          e.target.value = '';
        }}
      />

      <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <UploadCloud className="size-5" aria-hidden="true" />
      </span>

      <div className="max-w-full space-y-1">
        <p className="break-words text-sm font-medium text-card-foreground [overflow-wrap:anywhere]">{label}</p>
        {resolvedHint && (
          <p className="break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">{resolvedHint}</p>
        )}
      </div>

      {processing && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-background/80 backdrop-blur-sm">
          <Loader2
            className="size-5 animate-spin text-primary"
            aria-hidden="true"
          />
          <p className="text-sm font-medium text-foreground">
            {processingLabel}
          </p>
        </div>
      )}
    </div>
  );
}
