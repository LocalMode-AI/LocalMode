/**
 * @file not-found.tsx
 * @description Branded 404. localmode.ai 404s unknown legacy paths by design (no
 * catch-all redirect), so this points visitors at the gallery + docs instead of
 * the bare Next default.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { CloudOff } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Page not found - LocalMode UI',
  robots: { index: false, follow: false },
};

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/blocks', label: 'Blocks gallery' },
  { href: '/docs/components', label: 'Components' },
  { href: '/docs', label: 'Docs' },
];

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <div className="rounded-2xl border border-border bg-card p-5">
        <CloudOff className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-muted-foreground">404</p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">This page isn&apos;t here</h1>
        <p className="max-w-md text-pretty text-muted-foreground">
          The page may have moved. Try the blocks gallery or the docs to find what you need.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {LINKS.map(({ href, label }, i) => (
          <Link
            key={href}
            href={href}
            className={
              i === 0
                ? 'inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
                : 'inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
            }
          >
            {label}
          </Link>
        ))}
      </div>
    </main>
  );
}
