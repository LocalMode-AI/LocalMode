'use client';

/**
 * @file loader-demo.tsx
 * @description Docs preview for `Loader`. Shows every variant plus the `Shimmer`
 * skeleton-text placeholder.
 */
import { Loader, Shimmer } from './loader';

export default function LoaderDemo() {
  return (
    <div className="flex w-full max-w-md flex-col gap-5">
      <div className="flex flex-wrap items-center gap-6">
        <Loader variant="dots" label="dots" />
        <Loader variant="pulse" label="pulse" />
        <Loader variant="typing" label="typing" />
        <Loader variant="spinner" label="spinner" />
      </div>
      <div className="rounded-lg border border-border p-3">
        <Shimmer lines={3} />
      </div>
    </div>
  );
}
