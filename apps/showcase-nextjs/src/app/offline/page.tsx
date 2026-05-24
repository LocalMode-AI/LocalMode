/**
 * @file page.tsx
 * @description Offline fallback page shown when the user navigates to an uncached route while offline.
 */
import Link from 'next/link';
import { WifiOff } from 'lucide-react';

export default function OfflinePage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="rounded-full bg-base-200 p-6">
        <WifiOff className="h-12 w-12 text-poster-text-sub" />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-poster-text-main">You are offline</h1>
        <p className="max-w-md text-poster-text-sub">
          This page hasn&apos;t been cached yet. Apps you&apos;ve already visited will still work
          offline &mdash; head back and try one of those.
        </p>
      </div>
      <Link href="/" className="btn btn-primary">
        Go to Home
      </Link>
    </div>
  );
}
