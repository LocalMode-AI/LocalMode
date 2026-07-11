/**
 * Generic, dependency-free browser utilities shared by LocalMode UI
 * components. These are plain DOM/File/FileReader helpers with no AI and no
 * `@localmode/*` dependency, so the components that use them install and
 * compile in any React app.
 *
 * Ported from the equivalent helpers in `@localmode/core` (`formatBytes`) and
 * `@localmode/react` (`useObjectUrl`, `validateFile`, `readFileAsDataUrl`,
 * `downloadBlob`); copy-owned here so the registry stays portable.
 */

import { useEffect, useState } from 'react';

/**
 * Format a byte count into a human-readable string (e.g. `1.5 MB`).
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}

/** A recoverable file-validation failure. */
export interface FileValidationError {
  /** Human-readable message for display. */
  message: string;
  /** Always `true` — the user can pick a different file and retry. */
  recoverable?: boolean;
}

/** Options for {@link validateFile}. */
export interface ValidateFileOptions {
  /** The file to validate. */
  file: File;
  /** Accepted MIME types (e.g. `['image/png', 'image/jpeg']`). */
  accept?: string[];
  /** Maximum file size in bytes. */
  maxSize?: number;
}

/**
 * Validate a file against type and size constraints. Returns a
 * {@link FileValidationError} if invalid, or `null` if valid.
 */
export function validateFile(options: ValidateFileOptions): FileValidationError | null {
  const { file, accept, maxSize } = options;

  if (accept && !accept.includes(file.type)) {
    return {
      message: `Unsupported file type "${file.type}". Accepted types: ${accept.join(', ')}`,
      recoverable: true,
    };
  }

  if (maxSize !== undefined && file.size > maxSize) {
    const maxMB = (maxSize / 1_000_000).toFixed(0);
    return {
      message: `File too large (${(file.size / 1_000_000).toFixed(1)}MB). Maximum size: ${maxMB}MB`,
      recoverable: true,
    };
  }

  return null;
}

/**
 * Read a browser `File` as a base64 data URL string (e.g.
 * `data:image/png;base64,...`). Rejects with the `FileReader` error on failure.
 */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Trigger a file download from in-memory content. Creates a temporary object
 * URL, clicks a synthetic anchor, and revokes the URL.
 *
 * @param content - String or `Blob` to download.
 * @param filename - The download filename.
 * @param mimeType - MIME type when `content` is a string (default `text/plain`).
 */
export function downloadBlob(
  content: string | Blob,
  filename: string,
  mimeType = 'text/plain'
): void {
  const blob =
    content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Derive a stable object URL from a `Blob`, revoking it automatically when the
 * blob changes or the component unmounts. Returns `null` for a null/undefined
 * blob, during SSR, and on the first render after a change (the URL is created
 * in an effect so server and client markup match).
 */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const supported = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';
    const objectUrl = blob && supported ? URL.createObjectURL(blob) : null;

    // The object URL is an external resource created here rather than during
    // render, so SSR and the first client render both emit null. Reflecting it
    // back into React state is the only way to render it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(objectUrl);

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [blob]);

  return url;
}

/* Image / canvas helpers (transparent-background compositing, result → data URL). */

/** A plain RGBA / single-channel byte buffer — DOM-free so the kernel node-tests. */
type PixelBuffer = Uint8ClampedArray | Uint8Array;

/** Load an image element from a data URL / URL. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

/** Resolve an image's natural width/height from a data URL / URL. */
export async function getImageDimensions(
  src: string
): Promise<{ width: number; height: number }> {
  const img = await loadImage(src);
  return { width: img.naturalWidth, height: img.naturalHeight };
}

/**
 * Nearest-neighbour mask → alpha compositing on plain typed arrays (no DOM):
 * writes each pixel's alpha from the nearest mask cell, RGB untouched. The mask
 * stride (RGBA vs single-channel) is inferred from its length, so `ImageData.data`
 * and flat masks map identically. Mutates and returns `pixels`.
 */
export function compositeMaskAlpha(
  pixels: PixelBuffer,
  imgW: number,
  imgH: number,
  mask: PixelBuffer,
  maskW: number,
  maskH: number
): PixelBuffer {
  const stride = mask.length === maskW * maskH * 4 ? 4 : 1;
  for (let y = 0; y < imgH; y++) {
    for (let x = 0; x < imgW; x++) {
      const mx = Math.floor((x / imgW) * maskW);
      const my = Math.floor((y / imgH) * maskH);
      pixels[(y * imgW + x) * 4 + 3] = mask[(my * maskW + mx) * stride];
    }
  }
  return pixels;
}

/**
 * Composite a segmentation mask onto an image as its alpha channel, producing a
 * transparent-background PNG data URL (foreground opaque, background transparent).
 * Handles `ImageData` and flat `Uint8Array` masks, resampling via
 * {@link compositeMaskAlpha} when the mask resolution differs from the image.
 */
export async function applyMaskToImage(
  imageDataUrl: string,
  mask: ImageData | Uint8Array
): Promise<string> {
  const img = await loadImage(imageDataUrl);
  const w = img.naturalWidth;
  const h = img.naturalHeight;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create a 2D canvas context');
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, w, h);
  const isImageData = mask instanceof ImageData;
  compositeMaskAlpha(
    imageData.data,
    w,
    h,
    isImageData ? mask.data : mask,
    isImageData ? mask.width : w,
    isImageData ? mask.height : h
  );

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * Convert an image-to-image result (`ImageData` or `Blob`) to a PNG data URL.
 */
export async function imageResultToDataUrl(image: ImageData | Blob): Promise<string> {
  if (image instanceof Blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to convert image blob'));
      reader.readAsDataURL(image);
    });
  }
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create a 2D canvas context');
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}

/** Download a PNG data URL to disk via the copy-owned {@link downloadBlob} helper. */
export async function downloadDataUrl(dataUrl: string, filename: string): Promise<void> {
  const blob = await (await fetch(dataUrl)).blob();
  downloadBlob(blob, filename);
}
