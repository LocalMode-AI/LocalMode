'use client';

/**
 * @file image-captioner.tsx
 * @description Image Captioner block (`/blocks/image-studio/image-captioner`) — ViT-GPT2 alt-text over an accumulating gallery with copy-to-clipboard.
 */
import { useState } from 'react';
import { Check, Copy, Trash2 } from 'lucide-react';
import {
  useOperationList,
  toAppError,
  readFileAsDataUrl,
  validateFile,
} from '@localmode/react';
import type { CaptionImageResult } from '@localmode/core';
import { transformers } from '@localmode/transformers';

import { MediaDropzone } from '@/components/media-dropzone';

/** ViT-GPT2 image-captioning model (~230MB). */
const CAPTIONER_MODEL_ID = 'Xenova/vit-gpt2-image-captioning';

let captioner: ReturnType<typeof transformers.captioner> | null = null;
const getCaptionerModel = () => (captioner ??= transformers.captioner(CAPTIONER_MODEL_ID));

/** Accepted upload types + size cap (image-captioner parity). */
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

/** A captioned image card accumulated in the gallery. */
interface CaptionCard {
  id: string;
  src: string;
  caption: string;
  fileName: string;
}

export function ImageCaptionerBlock() {
  const [validationError, setValidationError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { items, isLoading, error: hookError, execute, cancel, reset, clearItems, removeItem } =
    useOperationList<[{ image: string; fileName: string }], CaptionImageResult, CaptionCard>({
      fn: async (input, signal) => {
        const { captionImage } = await import('@localmode/core');
        return captionImage({ model: getCaptionerModel(), image: input.image, abortSignal: signal });
      },
      transform: (result, input) => ({
        id: crypto.randomUUID(),
        src: input.image,
        caption: result.caption,
        fileName: input.fileName,
      }),
    });

  const captionFile = async (file: File) => {
    const err = validateFile({ file, accept: ACCEPTED, maxSize: MAX_SIZE });
    if (err) {
      setValidationError(err.message);
      return;
    }
    setValidationError(null);
    const dataUrl = await readFileAsDataUrl(file);
    setPending(dataUrl);
    try {
      await execute({ image: dataUrl, fileName: file.name });
    } finally {
      setPending(null);
    }
  };

  const copy = async (id: string, caption: string) => {
    await navigator.clipboard.writeText(caption);
    setCopiedId(id);
    setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 2000);
  };

  const error = validationError ?? toAppError(hookError)?.message ?? null;
  const state = isLoading ? 'processing' : error ? 'error' : items.length > 0 ? 'done' : 'idle';

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Single consolidated status region (was two stacked muted lines). */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
          {state === 'processing'
            ? 'Generating caption… (first run downloads ~230MB)'
            : items.length > 0
              ? 'Captioned'
              : 'On-device image captioning - nothing leaves your browser'}
        </p>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {items.length} {items.length === 1 ? 'image' : 'images'} captioned
            </span>
          )}
          {items.length > 0 && (
            <button
              type="button"
              onClick={() => clearItems()}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Trash2 className="size-3.5" aria-hidden />
              Clear All
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
            onClick={() => {
              setValidationError(null);
              if (hookError) reset();
            }}
            className="inline-flex h-6 items-center gap-1 rounded-md border border-border px-2 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Upload zone: full hero when empty, compact "add another" once results exist. */}
      {!isLoading && (
        <div className={items.length === 0 ? 'max-w-xl' : ''}>
          <MediaDropzone
            accept={ACCEPTED}
            maxSize={MAX_SIZE}
            multiple={false}
            addAnother={items.length > 0}
            title="Drop images to caption"
            subtitle="or click to browse"
            onFiles={(files) => files[0] && void captionFile(files[0])}
            onReject={(r) => setValidationError(r[0]?.reason ?? 'That file is not supported.')}
          />
        </div>
      )}

      {/* In-flight processing card (the image being captioned). */}
      {isLoading && (
        <div className="flex items-center gap-3 rounded-lg border border-border p-3">
          {pending ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pending} alt="Image being captioned" className="size-16 rounded-md object-cover opacity-70" />
          ) : (
            <div className="size-16 rounded-md bg-muted" />
          )}
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">Generating caption…</p>
            <p className="text-xs text-muted-foreground">ViT-GPT2 is analyzing your image</p>
          </div>
          <button
            type="button"
            onClick={cancel}
            className="ml-auto inline-flex h-7 items-center rounded-md border border-border px-2 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Single canonical result surface: thumbnail + readable caption + filename,
          with copy-to-clipboard and delete affordances (no duplicate gallery). */}
      {items.length > 0 && (
        <ul aria-label="Captions" className="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-3 rounded-lg border border-border p-3"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.src} alt="" className="size-12 shrink-0 rounded-md object-cover" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground">{item.caption}</p>
                <p className="truncate text-[11px] text-muted-foreground">{item.fileName}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void copy(item.id, item.caption)}
                  aria-label={copiedId === item.id ? 'Caption copied' : `Copy caption for ${item.fileName}`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {copiedId === item.id ? (
                    <>
                      <Check className="size-3.5 text-emerald-500" aria-hidden />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="size-3.5" aria-hidden />
                      Copy
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => removeItem((i) => i.id === item.id)}
                  aria-label="Delete image"
                  className="inline-flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
