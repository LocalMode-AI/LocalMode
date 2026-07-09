/**
 * @file page.tsx
 * @description Offline fallback shown by the service worker when navigating to an
 * uncached route while offline. Static, shadcn-tokened, no model/network work.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { WifiOff } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Offline - LocalMode UI',
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="rounded-full bg-muted p-6">
        <WifiOff className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-foreground">You are offline</h1>
        <p className="max-w-md text-pretty text-muted-foreground">
          This page hasn&apos;t been cached yet. Pages and blocks you&apos;ve already visited still
          work offline — head back and open one of those.
        </p>
      </div>
      <Link
        href="/"
        className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        Go to home
      </Link>
    </main>
  );
}
