/**
 * @file use-object-url.ts
 * @description Hook that derives a stable object URL from a Blob with
 *   automatic revocation on change and unmount
 */

import { useEffect, useState } from 'react';

/**
 * Create an object URL for a `Blob` and revoke it automatically when the
 * blob changes or the component unmounts.
 *
 * Returns `null` when `blob` is null/undefined, during SSR, and for the
 * first render after a blob change (the URL is created in an effect so
 * server and client markup match).
 *
 * @param blob - The blob to expose as an object URL, or null
 * @returns The object URL string, or null
 *
 * @example
 * ```tsx
 * function NotePlayback({ audio }: { audio: Blob | null }) {
 *   const src = useObjectUrl(audio);
 *   return src ? <audio controls src={src} /> : null;
 * }
 * ```
 *
 * @see useVoiceRecorder for producing audio blobs
 * @see useSynthesizeSpeech for synthesized audio blobs
 */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
      // Environment without object URL support (e.g. some test runtimes).
      setUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [blob]);

  return url;
}
