'use client';

/**
 * @file background-remover.tsx
 * @description Background Remover block (`/blocks/image-studio/background-remover`) — on-device SegFormer segmentation composited to a transparent-background PNG.
 */
import { useState } from 'react';
import { Download, RotateCcw, Scissors, X } from 'lucide-react';
import { useSegmentImage, toAppError, readFileAsDataUrl } from '@localmode/react';
import { transformers } from '@localmode/transformers';

import { MediaDropzone } from '@/components/media-dropzone';
import { BeforeAfterImageViewer } from '@/components/before-after-image-viewer';
import { ImageProcessingOverlay } from '@/components/image-processing-overlay';
import { ConfidenceScoreBadge } from '@/components/confidence-score-badge';

import { applyMaskToImage, downloadDataUrl } from '@/lib/browser-utils';

/** SegFormer background-removal model (~15MB). */
const SEGMENTER_MODEL_ID = 'Xenova/segformer-b0-finetuned-ade-512-512';

let segmenter: ReturnType<typeof transformers.segmenter> | null = null;
const getSegmenterModel = () => (segmenter ??= transformers.segmenter(SEGMENTER_MODEL_ID));

/** Accepted upload types (background-remover parity). */
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];

export function BackgroundRemoverBlock() {
  const [original, setOriginal] = useState<string | null>(null);
  const [processed, setProcessed] = useState<string | null>(null);
  const [bestScore, setBestScore] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const seg = useSegmentImage({ model: getSegmenterModel() });

  const processImage = async (file: File) => {
    setLocalError(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setOriginal(dataUrl);
      setProcessed(null);
      setBestScore(null);
      const result = await seg.execute(dataUrl);
      if (result && result.masks.length > 0) {
        const best = result.masks.reduce((a, b) => (b.score > a.score ? b : a));
        setProcessed(await applyMaskToImage(dataUrl, best.mask));
        setBestScore(best.score);
      } else if (result) {
        setLocalError('No segments were found in this image. Try another photo.');
      }
    } catch (err) {
      // Abort (cancel) is an intentional stop, not an error to surface.
      if (err instanceof Error && err.name === 'AbortError') return;
      setLocalError(err instanceof Error ? err.message : String(err));
    }
  };

  const reset = () => {
    setOriginal(null);
    setProcessed(null);
    setBestScore(null);
    setLocalError(null);
    seg.reset();
  };

  const download = () => {
    if (processed) void downloadDataUrl(processed, `background-removed-${Date.now()}.png`);
  };

  const error = localError ?? toAppError(seg.error)?.message ?? null;
  const state = seg.isLoading ? 'processing' : error ? 'error' : processed ? 'done' : 'idle';

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Single consolidated status region (was two stacked muted lines). */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
          {state === 'processing'
            ? 'Removing background…'
            : state === 'done'
              ? 'Background removed: transparent PNG ready'
              : state === 'error'
                ? 'Error'
                : 'On-device background removal - nothing leaves your browser'}
        </p>
        <div className="flex items-center gap-2">
          {processed && !seg.isLoading && (
            <button
              type="button"
              onClick={download}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Download className="size-3.5" aria-hidden />
              Download PNG
            </button>
          )}
          {original && (
            <button
              type="button"
              onClick={reset}
              disabled={seg.isLoading}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3.5" aria-hidden />
              Clear
            </button>
          )}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2"
        >
          <p className="text-xs text-destructive">{error}</p>
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-6 items-center gap-1 rounded-md border border-border px-2 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RotateCcw className="size-3" aria-hidden />
            Dismiss &amp; retry
          </button>
        </div>
      )}

      {!original && (
        <div className="max-w-xl">
          <MediaDropzone
            accept={ACCEPTED}
            multiple={false}
            processing={seg.isLoading}
            processingLabel="Removing background…"
            title="Drop an image to remove its background"
            subtitle="or click to browse"
            onFiles={(files) => files[0] && void processImage(files[0])}
            onReject={(r) => setLocalError(r[0]?.reason ?? 'That file type is not supported.')}
          />
        </div>
      )}

      {original && !processed && (
        <div className="relative max-w-xl overflow-hidden rounded-lg border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={original}
            alt="Uploaded image"
            className={seg.isLoading ? 'w-full opacity-50' : 'w-full'}
          />
          <ImageProcessingOverlay
            processing={seg.isLoading}
            variant="scan"
            icon={<Scissors className="size-5" aria-hidden />}
            status="Removing background…"
            detail={`${SEGMENTER_MODEL_ID} · first run downloads ~15MB`}
            onCancel={seg.cancel}
          />
        </div>
      )}

      {original && processed && (
        <div className="flex flex-col gap-3">
          <div role="group" aria-label="Background removal result">
            <BeforeAfterImageViewer
              originalSrc={original}
              processedSrc={processed}
              mode="grid"
              originalLabel="Original"
              processedLabel="Result"
              checkerboard
              originalAlt="Original image"
              resultAlt="Background removed: transparent PNG"
            />
          </div>
          {/* SegFormer semantic-segmentation masks carry no per-mask confidence
              (score is 0), so a "confidence" badge would read as broken. Only
              surface it if a real, non-zero score is ever present. */}
          {bestScore != null && bestScore > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Best mask confidence</span>
              <span data-score={bestScore.toFixed(4)}>
                <ConfidenceScoreBadge score={bestScore} label="mask" />
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
