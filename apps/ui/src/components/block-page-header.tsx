'use client';

/**
 * @file block-page-header.tsx
 * @description Top-of-page chrome for a block/category page: the breadcrumb, the
 * "Copy page" / "View as Markdown" actions (reusing the docs {@link PageActions}),
 * and a mobile "Browse blocks" disclosure (the desktop equivalent is the left
 * sidebar). Rendered inside the shell's `<main>` so it aligns with the content.
 */
import * as React from 'react';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { PageActions } from '@/components/page-actions';
import { BlocksBreadcrumb, type Crumb } from '@/components/blocks-breadcrumb';
import { BlocksNav } from '@/components/blocks-nav';
import { JsonLd } from '@/components/json-ld';
import { breadcrumbGraph } from '@/lib/structured-data';

/** Props for {@link BlockPageHeader}. */
interface BlockPageHeaderProps {
  /** Breadcrumb trail (last entry is the current page). */
  crumbs: Crumb[];
  /** The page's markdown, for the Copy action. */
  markdown: string;
  /** URL of the raw-markdown route for this page. */
  markdownUrl: string;
}

/** Breadcrumb + page actions + mobile block switcher. */
export function BlockPageHeader({ crumbs, markdown, markdownUrl }: BlockPageHeaderProps) {
  const detailsRef = React.useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();

  // BreadcrumbList JSON-LD mirroring the visible breadcrumb (the current/last
  // crumb has no href, so it resolves to the current path).
  const breadcrumb = breadcrumbGraph(
    crumbs.map((c) => ({ name: c.label, item: c.href ?? pathname })),
    pathname,
  );

  return (
    <div className="flex flex-col gap-3">
      <JsonLd data={breadcrumb} />
      {/* Top-aligned so the breadcrumb's first line lines up with the sidebar's
          first item (the actions are taller); `min-h` keeps the row from
          collapsing under the single-line breadcrumb. */}
      <div className="flex min-h-8 flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <BlocksBreadcrumb crumbs={crumbs} />
        <PageActions markdown={markdown} markdownUrl={markdownUrl} />
      </div>

      {/* Mobile block switcher — desktop uses the persistent left sidebar. */}
      <details ref={detailsRef} className="group rounded-lg border border-border bg-card lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
          Browse blocks
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="max-h-[60vh] overflow-y-auto border-t border-border p-3">
          <BlocksNav onNavigate={() => detailsRef.current?.removeAttribute('open')} />
        </div>
      </details>
    </div>
  );
}
