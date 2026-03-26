/**
 * @file download.ts
 * @description Browser utility for triggering file downloads from in-memory content
 */

/**
 * Trigger a file download from in-memory content.
 *
 * Creates a temporary object URL, triggers a download via a dynamically
 * created anchor element, and revokes the URL after triggering.
 *
 * @param content - The content to download (string or Blob)
 * @param filename - The filename for the download
 * @param mimeType - MIME type when content is a string (default: 'text/plain')
 *
 * @example
 * ```ts
 * import { downloadBlob } from '@localmode/react';
 *
 * // Download text content
 * downloadBlob('transcript text...', 'transcript.txt');
 *
 * // Download binary content
 * downloadBlob(audioBlob, 'recording.webm', 'audio/webm');
 * ```
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
