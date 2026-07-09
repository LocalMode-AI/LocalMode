'use client';

import { useState } from 'react';

import { ModeErrorBoundary } from './mode-error-boundary';

/** A child that throws during render when `shouldThrow` is true. */
function ResultSurface({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('Simulated render failure in the result surface.');
  return <p className="text-sm text-muted-foreground">Result rendered successfully.</p>;
}

/**
 * Demo for ModeErrorBoundary, used by the docs live preview. "Break" makes the
 * child throw so the boundary shows its recoverable notice; "Fix" clears the
 * underlying condition, then the notice's Reset button re-renders the child.
 */
export default function ModeErrorBoundaryDemo() {
  const [shouldThrow, setShouldThrow] = useState(false);

  return (
    <div className="flex w-full max-w-md flex-col items-start gap-3">
      <div className="flex items-center gap-2 text-xs">
        <button
          type="button"
          onClick={() => setShouldThrow(true)}
          className="rounded-md border border-border px-3 py-1.5 font-medium hover:bg-muted"
        >
          Break the surface
        </button>
        <button
          type="button"
          onClick={() => setShouldThrow(false)}
          className="rounded-md border border-border px-3 py-1.5 font-medium hover:bg-muted"
        >
          Fix underlying issue
        </button>
      </div>
      <ModeErrorBoundary>
        <ResultSurface shouldThrow={shouldThrow} />
      </ModeErrorBoundary>
      <p className="text-xs text-muted-foreground">
        Break → the boundary catches it. Then Fix, and click the boundary&apos;s Reset to recover.
      </p>
    </div>
  );
}
