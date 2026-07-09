/**
 * @file blocks-breadcrumb.tsx
 * @description Presentational breadcrumb for block pages (e.g. Blocks / Knowledge
 * / RAG Chat). The trail is computed by the caller (the block shell) from the
 * category map; the last crumb is the current page (non-link, `aria-current`).
 */
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

/** One breadcrumb entry. A missing `href` (or the last entry) renders as text. */
export interface Crumb {
  /** Visible label. */
  label: string;
  /** Link target; omitted for the current (last) crumb. */
  href?: string;
}

/** Breadcrumb trail for a block or category page. */
export function BlocksBreadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex min-h-8 min-w-0 items-center">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
              {crumb.href && !last ? (
                <Link
                  href={crumb.href}
                  className="truncate transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span
                  className={last ? 'truncate font-medium text-foreground' : 'truncate'}
                  aria-current={last ? 'page' : undefined}
                >
                  {crumb.label}
                </span>
              )}
              {!last && <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
