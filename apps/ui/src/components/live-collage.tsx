'use client';

/**
 * @file live-collage.tsx
 * @description A grid of live, auto-rendering component demos used on the
 * homepage and other showcase surfaces. Each cell renders an existing
 * `*-demo.tsx` via {@link PREVIEWS} (client-only `ssr:false`) under a clickable
 * header that links to the component's docs page. Every demo in the curated set
 * is presentational and renders from mock props, so the collage downloads no
 * model — true to the local-first story while still showing real components
 * rather than screenshots.
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { PREVIEWS } from '@/components/preview-registry';
import { cn } from '@/lib/utils';

/** Props for {@link LiveCollage}. */
interface LiveCollageProps {
  /** Registry item names to render, e.g. `ui/local-first/model-downloader`. */
  items: string[];
  /** Optional extra classes for the grid container. */
  className?: string;
  /**
   * Optional trailing cell rendered after the demos (same grid track) — e.g. an
   * "explore all components" call-to-action tile.
   */
  cta?: ReactNode;
}

/** A responsive grid of live, mock-prop component demos (no model download). */
export function LiveCollage({ items, className, cta }: LiveCollageProps) {
  return (
    <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3', className)}>
      {items.map((name) => {
        const Demo = PREVIEWS[name];
        const shortName = name.replace(/^ui\//, '');
        return (
          <div
            key={name}
            data-collage-item={name}
            className="flex flex-col overflow-hidden rounded-lg border border-border bg-card"
          >
            {/* Header links to the component's docs page (e.g. /docs/local-first/browser-compat-card). */}
            <Link
              href={`/docs/${shortName}`}
              className="group flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="truncate group-hover:underline">{shortName}</span>
              <ArrowUpRight className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
            <div className="flex min-h-32 flex-1 items-center justify-center p-4">
              {Demo ? <Demo /> : <span className="text-xs text-destructive">missing: {name}</span>}
            </div>
          </div>
        );
      })}
      {cta}
    </div>
  );
}
