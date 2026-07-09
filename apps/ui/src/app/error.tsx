'use client';

/**
 * @file error.tsx
 * @description Route-level error boundary. Recovers from render/runtime errors in
 * a route segment without taking down the whole app; offers retry + home.
 */
import { useEffect } from 'react';
import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surface the error for observability (Speed Insights / console); do not swallow.
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <div className="rounded-2xl border border-border bg-card p-5">
        <TriangleAlert className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Something went wrong</h1>
        <p className="max-w-md text-pretty text-muted-foreground">
          An unexpected error occurred. Everything runs on your device, so nothing was sent
          anywhere. You can try again or head back home.
        </p>
        {error.digest ? (
          <p className="text-xs text-muted-foreground/70">Reference: {error.digest}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Go to home
        </Link>
      </div>
    </main>
  );
}
