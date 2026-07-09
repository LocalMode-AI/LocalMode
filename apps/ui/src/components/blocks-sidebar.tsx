'use client';

/**
 * @file blocks-sidebar.tsx
 * @description Desktop left sidebar for block pages — a sticky, scrollable
 * {@link BlocksNav} so visitors can switch between blocks from any block page.
 * Hidden on the `/blocks` gallery index (which is already the full grid) and on
 * narrow viewports (the shells render a "Browse blocks" disclosure there
 * instead). Sticks below the site nav via the fumadocs `--fd-nav-height` var.
 */
import { usePathname } from 'next/navigation';
import { BlocksNav } from '@/components/blocks-nav';

/** Sticky desktop sidebar; renders nothing on the gallery index. */
export function BlocksSidebar() {
  const pathname = usePathname();
  if (pathname === '/blocks') return null;

  return (
    <aside className="hidden w-64 shrink-0 border-r border-border lg:block">
      {/* `px-2` + the nav links' own `px-2` lands the link icons at `container +
          16px` — the header logo's left edge — so the sidebar aligns with the
          header. Top padding matches the content's `p-6` so the first item lines
          up with the breadcrumb; sticks just below the site nav. */}
      <div className="sticky top-[var(--fd-nav-height,3.5rem)] max-h-[calc(100dvh-var(--fd-nav-height,3.5rem))] overflow-y-auto px-2 pb-12 pt-6">
        <BlocksNav />
      </div>
    </aside>
  );
}
