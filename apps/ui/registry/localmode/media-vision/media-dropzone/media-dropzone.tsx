'use client';

import * as React from 'react';
import { ImagePlus, Loader2, Plus, UploadCloud } from 'lucide-react';
import { validateFile } from '@/lib/browser-utils';
import { cn } from '@/registry/localmode/lib/utils';

/** A file rejected by {@link MediaDropzone}'s accept-list / max-size validation. */
export interface MediaDropzoneRejection {
  /** The rejected file. */
  file: File;
  /** Human-readable reason from the `validateFile` helper. */
  reason: string;
}

/** Props for {@link MediaDropzone}. */
export interface MediaDropzoneProps {
  /**
   * Called with the files that pass the accept-list + max-size validation.
   * Always receives only valid files.
   */
  onFiles: (files: File[]) => void;
  /**
   * Called with files that fail validation, paired with the reason. Optional —
   * use it to surface an inline error.
   */
  onReject?: (rejections: MediaDropzoneRejection[]) => void;
  /**
   * Accepted MIME types, e.g. `['image/png', 'image/jpeg', 'image/webp']`.
   * When omitted, any file type is accepted.
   * @default ["image/png","image/jpeg","image/webp","image/gif"]
   */
  accept?: string[];
  /**
   * Maximum file size in bytes. When omitted, no size limit is enforced.
   * @default 10000000
   */
  maxSize?: number;
  /**
   * Allow selecting / dropping more than one file at a time.
   * @default true
   */
  multiple?: boolean;
  /**
   * When true, render a spinner + label overlay (e.g. while a model processes
   * the dropped image). The zone stops accepting input while processing.
   * @default false
   */
  processing?: boolean;
  /** Label shown while `processing` is true. @default "Processing…" */
  processingLabel?: string;
  /**
   * When true, render the compact "add another" variant — a short, inline tile
   * instead of the full hero zone. Use it once images already exist.
   * @default false
   */
  addAnother?: boolean;
  /** Title shown in the idle state. @default "Drop an image here" */
  title?: string;
  /** Subtitle shown in the idle state. @default "or click to browse" */
  subtitle?: string;
  /** Disable all interaction. @default false */
  disabled?: boolean;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/** Proper-cased labels for common subtypes so "webp" renders "WebP", not "WEBP". */
const FORMAT_LABELS: Record<string, string> = {
  png: 'PNG',
  jpeg: 'JPEG',
  jpg: 'JPG',
  webp: 'WebP',
  gif: 'GIF',
  avif: 'AVIF',
  bmp: 'BMP',
  'svg+xml': 'SVG',
};

/** Pretty-print the accept-list (MIME types) as a formats hint, e.g. "PNG · JPEG · WebP". */
function formatAcceptHint(accept?: string[]) {
  if (!accept || accept.length === 0) return 'Any file type';
  return accept
    .map((type) => {
      const subtype = type.split('/')[1];
      if (!subtype) return type;
      return FORMAT_LABELS[subtype.toLowerCase()] ?? subtype.toUpperCase();
    })
    .join(' · ');
}

/**
 * A drag-and-drop + click-to-browse upload zone for image/media files.
 *
 * Renders idle (icon + title + subtitle + accepted-formats hint), drag-over
 * (highlight + tint + scale), and processing (spinner + label) states, plus a
 * compact `addAnother` variant for adding more files once some exist. Files are
 * validated with the copy-owned `validateFile` (from `@/lib/browser-utils`) against `accept` + `maxSize`;
 * valid files are emitted via `onFiles`, rejected ones via `onReject`.
 *
 * Presentational + stateless: it owns no async/model state — wire `processing`
 * to a vision hook's `isLoading` and read the emitted files yourself.
 *
 * @example
 * ```tsx
 * <MediaDropzone
 *   accept={['image/png', 'image/jpeg']}
 *   maxSize={5_000_000}
 *   onFiles={(files) => setImages(files)}
 * />
 * ```
 */
export function MediaDropzone({
  onFiles,
  onReject,
  accept = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  maxSize = 10_000_000,
  multiple = true,
  processing = false,
  processingLabel = 'Processing…',
  addAnother = false,
  title = 'Drop an image here',
  subtitle = 'or click to browse',
  disabled = false,
  className,
}: MediaDropzoneProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const dragDepth = React.useRef(0);

  const interactive = !disabled && !processing;

  /** Validate a list of files, splitting into accepted / rejected. */
  function partition(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    const valid: File[] = [];
    const rejected: MediaDropzoneRejection[] = [];
    for (const file of files) {
      const error = validateFile({ file, accept, maxSize });
      if (error) rejected.push({ file, reason: error.message });
      else valid.push(file);
    }
    return { valid, rejected };
  }

  function emit(fileList: FileList | File[]) {
    const { valid, rejected } = partition(fileList);
    if (rejected.length > 0) onReject?.(rejected);
    if (valid.length > 0) onFiles(multiple ? valid : valid.slice(0, 1));
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    dragDepth.current = 0;
    setIsDragOver(false);
    if (!interactive) return;
    if (event.dataTransfer.files.length > 0) emit(event.dataTransfer.files);
  }

  function handleDragEnter(event: React.DragEvent) {
    event.preventDefault();
    if (!interactive) return;
    dragDepth.current += 1;
    setIsDragOver(true);
  }

  function handleDragLeave(event: React.DragEvent) {
    event.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setIsDragOver(false);
    }
  }

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    if (event.target.files && event.target.files.length > 0) {
      emit(event.target.files);
    }
    // Reset so selecting the same file again re-fires onChange.
    event.target.value = '';
  }

  function openPicker() {
    if (interactive) inputRef.current?.click();
  }

  const hiddenInput = (
    <input
      ref={inputRef}
      type="file"
      accept={accept?.join(',')}
      multiple={multiple}
      disabled={!interactive}
      onChange={handleInputChange}
      className="sr-only"
      tabIndex={-1}
      aria-hidden="true"
    />
  );

  if (addAnother) {
    return (
      <>
        <button
          type="button"
          onClick={openPicker}
          disabled={!interactive}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          className={cn(
            'group flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card px-4 py-3 text-sm font-medium text-muted-foreground transition-colors',
            interactive && 'hover:border-primary/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
            isDragOver && 'border-primary bg-primary/5 text-foreground',
            !interactive && 'cursor-not-allowed opacity-60',
            className,
          )}
        >
          {processing ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Plus className="size-4" aria-hidden="true" />
          )}
          {processing ? processingLabel : 'Add another'}
        </button>
        {hiddenInput}
      </>
    );
  }

  return (
    <div
      role="button"
      tabIndex={interactive ? 0 : -1}
      aria-disabled={!interactive}
      aria-label={title}
      onClick={openPicker}
      onKeyDown={(e) => {
        if (interactive && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          openPicker();
        }
      }}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      className={cn(
        'relative flex min-h-48 w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-card p-8 text-center outline-none transition-all',
        interactive &&
          'cursor-pointer hover:border-primary/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        isDragOver && 'scale-[1.01] border-primary bg-primary/5',
        !interactive && 'cursor-not-allowed',
        className,
      )}
    >
      <div
        className={cn(
          'flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors',
          isDragOver && 'bg-primary/10 text-primary',
        )}
        aria-hidden="true"
      >
        {isDragOver ? (
          <ImagePlus className="size-6" />
        ) : (
          <UploadCloud className="size-6" />
        )}
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">
          {isDragOver ? 'Drop to upload' : title}
        </p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
        <p className="text-[0.6875rem] font-medium tracking-wide text-muted-foreground">
          {formatAcceptHint(accept)}
          {maxSize ? ` · up to ${(maxSize / 1_000_000).toFixed(0)} MB` : ''}
        </p>
      </div>

      {hiddenInput}

      {processing && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-background/80 backdrop-blur-sm">
          <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
          <span className="text-sm font-medium text-foreground">
            {processingLabel}
          </span>
        </div>
      )}
    </div>
  );
}
