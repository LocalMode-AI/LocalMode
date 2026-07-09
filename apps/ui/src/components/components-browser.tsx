'use client';

/**
 * @file components-browser.tsx
 * @description Client browse surface for the registry: a family filter (with
 * per-family counts) over a grid of component cards, each showing a live,
 * top-aligned mini-render ({@link CardPreview}), title, and description. The
 * whole card is a link to the component page (the preview is non-interactive).
 */
import * as React from 'react';
import Link from 'next/link';
import { PREVIEWS } from '@/components/preview-registry';
import { COMPONENT_PREVIEW_HEIGHTS } from '@/lib/component-preview-heights';
import { cn } from '@/lib/utils';

/** Previews taller than this are capped with a scroll-free fade (click to see the full component). */
const PREVIEW_CAP_PX = 400;

/** A single browseable registry item. */
export interface BrowserItem {
  /** Registry item name, e.g. `ui/conversation/message`. */
  name: string;
  /** Display title. */
  title: string;
  /** One-line description. */
  description: string;
  /** Family slug derived from the item name (docs folder), e.g. `conversation`. */
  family: string;
  /** Docs slug, e.g. `/docs/conversation/message`. */
  slug: string;
}

/**
 * Mini live render of a demo, mounted lazily when its card scrolls near the
 * viewport (so a large grid doesn't mount every demo at once). Top-aligned and
 * natural-height (no min height); the card sorts by measured height so rows
 * stay even. Non-interactive (`pointer-events-none`); presentational demos
 * render from mock props — no model download.
 */
function CardPreview({ name }: { name: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [show, setShow] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || show) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [show]);

  const Demo = show ? PREVIEWS[name] : undefined;

  return (
    <div
      ref={ref}
      className="pointer-events-none flex min-w-0 items-start justify-center"
      aria-hidden="true"
    >
      {Demo ? <Demo /> : <div className="h-20 w-full animate-pulse rounded bg-muted/50" />}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-muted-foreground hover:bg-muted',
      )}
    >
      {label}
    </button>
  );
}

/** Family-filterable, preview-card grid of all public registry components. */
export function ComponentsBrowser({ items }: { items: BrowserItem[] }) {
  const counts: Record<string, number> = {};
  for (const item of items) counts[item.family] = (counts[item.family] ?? 0) + 1;
  const families = Object.keys(counts).sort();

  const [active, setActive] = React.useState<string>('all');
  const visible = active === 'all' ? items : items.filter((i) => i.family === active);

  return (
    <div className="not-prose flex flex-col gap-6">
      <div className="flex flex-wrap gap-2" data-testid="family-filter">
        <FilterChip
          label={`All (${items.length})`}
          active={active === 'all'}
          onClick={() => setActive('all')}
        />
        {families.map((f) => (
          <FilterChip
            key={f}
            label={`${f} (${counts[f]})`}
            active={active === f}
            onClick={() => setActive(f)}
          />
        ))}
      </div>

      <div
        className="grid gap-4 sm:grid-cols-2"
        data-testid="components-grid"
        data-visible-count={visible.length}
      >
        {visible.map((item) => {
          const tall = (COMPONENT_PREVIEW_HEIGHTS[item.name] ?? 0) > PREVIEW_CAP_PX;
          return (
            // Stretched-link card: the card is a plain <div> and the title <Link>'s
            // ::after overlay makes the WHOLE card clickable — the preview (which
            // may contain its own <a>/<button>) stays a sibling, so no <a>-in-<a>.
            <div
              key={item.name}
              data-component-card={item.name}
              data-family={item.family}
              className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-foreground/30 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background"
            >
              {/* Tall previews are capped and fade out at the bottom (click the card to see the full component). */}
              <div
                className={cn(
                  'relative overflow-hidden border-b border-border bg-muted/30 p-3',
                  tall && 'max-h-[400px]',
                )}
              >
                <CardPreview name={item.name} />
                {tall ? (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent" />
                ) : null}
              </div>
            {/* Foreground-tint footer: darkens in light (distinct from the light-gray
                page bg) and lightens in dark — a clear step from the preview above. */}
            <div className="flex flex-1 flex-col bg-foreground/[0.08] p-4">
              <Link
                href={item.slug}
                aria-label={`Open ${item.title}`}
                className="font-medium text-card-foreground no-underline transition-colors after:absolute after:inset-0 group-hover:text-primary focus-visible:outline-none"
              >
                {item.title}
              </Link>
              {item.description ? (
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {item.description}
                </p>
              ) : null}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}
