'use client';

/**
 * @file image-enhancer.tsx
 * @description Image Enhancer block (`/blocks/image-studio/image-enhancer`) — Swin2SR super-resolution with a 2x / 4x / real-world Restore mode picker.
 */
import { useState } from 'react';
import { Download, RotateCcw, Sparkles, Upload, Wand2 } from 'lucide-react';
import { useImageToImage, toAppError, readFileAsDataUrl, validateFile } from '@localmode/react';
import { transformers } from '@localmode/transformers';

import { MediaDropzone } from '@/components/media-dropzone';
import { BeforeAfterImageViewer } from '@/components/before-after-image-viewer';
import { ImageProcessingOverlay } from '@/components/image-processing-overlay';
import { cn } from '@/lib/utils';
import { imageResultToDataUrl, getImageDimensions, downloadDataUrl } from '@/lib/browser-utils';

/** An enhancement mode: a Swin2SR variant + its scale factor + display copy. */
interface EnhanceMode {
  /** Stable id + `data-mode` value + driver hook. */
  id: 'upscale-2x' | 'upscale-4x' | 'restore';
  /** Switcher label. */
  label: string;
  /** Swin2SR model id (transformers.js ONNX port). */
  modelId: string;
  /** Upscale factor passed to `useImageToImage` and asserted in E2E. */
  scale: number;
  /** Short model tag shown in the info panel + result badge. */
  badge: string;
  /** One-line description shown under the mode picker. */
  hint: string;
  /** Approximate first-run download size, surfaced in the processing sub-line. */
  size: string;
}

/**
 * Enhancement modes. 2x is the default mode; 4x and Restore are the additional
 * options. Restore uses the real-world degradation Swin2SR variant, verified
 * end-to-end in real Chrome.
 */
const ENHANCE_MODES: readonly EnhanceMode[] = [
  {
    id: 'upscale-2x',
    label: '2x Upscale',
    modelId: 'Xenova/swin2SR-lightweight-x2-64',
    scale: 2,
    badge: 'Swin2SR 2x',
    hint: 'Fast lightweight 2x super-resolution (default).',
    size: '~50MB',
  },
  {
    id: 'upscale-4x',
    label: '4x Upscale',
    modelId: 'Xenova/swin2SR-classical-sr-x4-64',
    scale: 4,
    badge: 'Swin2SR 4x',
    hint: 'Classical 4x super-resolution for a larger enlargement.',
    size: '~45MB',
  },
  {
    id: 'restore',
    label: 'Restore',
    modelId: 'Xenova/swin2SR-realworld-sr-x4-64-bsrgan-psnr',
    scale: 4,
    badge: 'Swin2SR Restore',
    hint: 'Real-world restoration for old or degraded photos (4x).',
    size: '~50MB',
  },
] as const;

const enhancers = new Map<string, ReturnType<typeof transformers.imageToImage>>();
/** Get (or lazily create) the image-to-image model for an enhancement mode. */
function getEnhanceModel(modelId: string) {
  let model = enhancers.get(modelId);
  if (!model) {
    // Pin the Swin2SR super-resolution models to WASM. These are small ONNX
    // ports and WASM runs them in ~1s (its load is actually faster than WebGPU,
    // which spends ~16s compiling shaders for no inference win at this size).
    // More importantly, the block keeps three separate SR pipelines alive
    // (2x / 4x / restore) and switching between them loads a second WebGPU
    // (ONNX-Runtime JSEP) session on the same page — the JSEP session lifecycle
    // wedges there, so the second enhancement never completes. WASM has no such
    // per-session GPU state, so every mode runs reliably.
    model = transformers.imageToImage(modelId, { device: 'wasm' });
    enhancers.set(modelId, model);
  }
  return model;
}

/** Accepted upload types (photo-enhancer parity). */
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];

/** An enhanced result for one mode: the PNG data URL + its decoded dimensions. */
interface EnhancedResult {
  url: string;
  width: number;
  height: number;
}

export function ImageEnhancerBlock() {
  // One hook per mode: independent state so switching modes keeps prior
  // results and never cancels another mode's in-flight run. ENHANCE_MODES is a
  // module constant, so the hook order is stable across renders.
  const hooks: Record<EnhanceMode['id'], ReturnType<typeof useImageToImage>> = {
    'upscale-2x': useImageToImage({
      model: getEnhanceModel(ENHANCE_MODES[0].modelId),
      scale: ENHANCE_MODES[0].scale,
    }),
    'upscale-4x': useImageToImage({
      model: getEnhanceModel(ENHANCE_MODES[1].modelId),
      scale: ENHANCE_MODES[1].scale,
    }),
    restore: useImageToImage({
      model: getEnhanceModel(ENHANCE_MODES[2].modelId),
      scale: ENHANCE_MODES[2].scale,
    }),
  };

  const [modeId, setModeId] = useState<EnhanceMode['id']>('upscale-2x');
  const [original, setOriginal] = useState<string | null>(null);
  const [results, setResults] = useState<Partial<Record<EnhanceMode['id'], EnhancedResult>>>({});
  const [validationError, setValidationError] = useState<string | null>(null);

  const mode = ENHANCE_MODES.find((m) => m.id === modeId)!;
  const active = hooks[modeId];
  const result = results[modeId] ?? null;

  /** Run super-resolution for a mode on a source image, then store the result. */
  const enhance = async (id: EnhanceMode['id'], src: string) => {
    setValidationError(null);
    try {
      const out = await hooks[id].execute(src);
      if (out) {
        const url = await imageResultToDataUrl(out.image);
        const dims = await getImageDimensions(url);
        setResults((prev) => ({ ...prev, [id]: { url, width: dims.width, height: dims.height } }));
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      // Inference errors are surfaced by the hook's own `error`; nothing to do.
    }
  };

  const processImage = async (file: File) => {
    const err = validateFile({ file, accept: ACCEPTED });
    if (err) {
      setValidationError(err.message);
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    setOriginal(dataUrl);
    setResults({}); // new image → every mode's prior result is stale
    await enhance(modeId, dataUrl);
  };

  /** Switch modes; auto-run the new mode on the current image if not yet done. */
  const changeMode = (id: EnhanceMode['id']) => {
    setModeId(id);
    if (original && !results[id] && !hooks[id].isLoading) void enhance(id, original);
  };

  const reset = () => {
    setOriginal(null);
    setResults({});
    setValidationError(null);
    active.reset();
  };

  const download = () => {
    if (result) void downloadDataUrl(result.url, `enhanced-${mode.scale}x-${Date.now()}.png`);
  };

  const error = validationError ?? toAppError(active.error)?.message ?? null;
  const state = active.isLoading ? 'processing' : error ? 'error' : result ? 'done' : 'idle';

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Single consolidated status region (was two stacked muted lines). */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
          {state === 'processing'
            ? `Enhancing (${mode.label})…`
            : state === 'done'
              ? `Enhanced ${mode.scale}x`
              : state === 'error'
                ? 'Error'
                : 'On-device super-resolution - nothing leaves your browser'}
        </p>
        <div className="flex items-center gap-2">
          {result && !active.isLoading && (
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              <Sparkles className="size-3" aria-hidden />
              Enhanced {mode.scale}x
            </span>
          )}
          {original && (
            <button
              type="button"
              onClick={reset}
              disabled={active.isLoading}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Upload className="size-3.5" aria-hidden />
              Upload new
            </button>
          )}
        </div>
      </div>

      {/* Mode picker (block-local — beyond-parity 4x + Restore). A labeled
          group of aria-pressed toggle buttons with a visible focus ring. */}
      <div className="flex flex-col gap-1.5">
        <div
          role="group"
          aria-label="Enhancement mode"
          className="inline-flex w-fit rounded-lg border border-border bg-muted p-1"
        >
          {ENHANCE_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={m.id === modeId}
              onClick={() => changeMode(m.id)}
              className={cn(
                'inline-flex min-h-11 items-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9',
                m.id === modeId
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{mode.hint}</p>
      </div>

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2"
        >
          <p className="text-xs text-destructive">{error}</p>
          <button
            type="button"
            onClick={() => {
              setValidationError(null);
              active.reset();
            }}
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
            processing={active.isLoading}
            processingLabel="Enhancing…"
            title="Drop an image to enhance"
            subtitle="or click to browse"
            onFiles={(files) => files[0] && void processImage(files[0])}
            onReject={(r) => setValidationError(r[0]?.reason ?? 'That file type is not supported.')}
          />
        </div>
      )}

      {original && !result && (
        <div className="relative max-w-xl overflow-hidden rounded-lg border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={original}
            alt="Uploaded image"
            className={active.isLoading ? 'w-full opacity-50' : 'w-full'}
          />
          <ImageProcessingOverlay
            processing={active.isLoading}
            variant="scan"
            icon={<Wand2 className="size-5" aria-hidden />}
            status={`Enhancing (${mode.label})…`}
            detail={`${mode.modelId} · first run downloads ${mode.size} - this may take a moment`}
            onCancel={active.cancel}
          />
        </div>
      )}

      {original && result && (
        <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
          <div
            role="group"
            aria-label="Enhanced result"
            data-width={result.width}
            data-height={result.height}
            data-scale={mode.scale}
          >
            <BeforeAfterImageViewer
              originalSrc={original}
              processedSrc={result.url}
              mode="toggle"
              originalLabel="Original"
              processedLabel="Enhanced"
              checkerboard={false}
              originalAlt="Original image"
              resultAlt={`Enhanced ${mode.scale}x`}
            />
          </div>

          {/* Info panel (block-local). */}
          <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Info</p>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Model</span>
              <span className="font-mono text-xs">{mode.badge}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Scale</span>
              <span data-scale={mode.scale}>{mode.scale}x</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Output</span>
              <span className="tabular-nums">
                {result.width}×{result.height}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Status</span>
              <span className="flex items-center gap-1.5 text-primary">
                <span className="size-1.5 rounded-full bg-primary" aria-hidden />
                Complete
              </span>
            </div>
            <button
              type="button"
              onClick={download}
              className="mt-1 inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Download className="size-4" aria-hidden />
              Download Enhanced PNG
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
