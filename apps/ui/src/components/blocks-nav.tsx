'use client';

/**
 * @file blocks-nav.tsx
 * @description Grouped, icon-rich navigation over every route-served block, used
 * by both the desktop blocks sidebar and the mobile "Browse blocks" disclosure.
 * Each category is a labeled section (icon + title, linking to the category
 * page); its member blocks are nested links carrying their own catalog icon. The
 * active route is highlighted via `usePathname`. Category + per-block icons and
 * titles come from the shared gallery catalog (`blocks-catalog`), so the nav and
 * the gallery cards can't disagree.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BLOCK_CATEGORIES, type BlockCategory } from '@/app/blocks/blocks-catalog';
import { categoryRoute } from '@/app/blocks/category-map';

/** A flat category is a single block whose slug equals the category id (chat). */
function isFlat(category: BlockCategory): boolean {
  return category.blocks.length === 1 && category.blocks[0].slug === category.id;
}

/** A leaf link: icon + label, with an active pill. Used for blocks + "All blocks". */
function NavLink({
  href,
  active,
  icon: Icon,
  label,
  onNavigate,
  emphasize,
}: {
  href: string;
  active: boolean;
  icon: LucideIcon;
  label: string;
  onNavigate?: () => void;
  emphasize?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group/link flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'bg-muted font-medium text-foreground'
          : cn(
              'hover:bg-muted/60 hover:text-foreground',
              emphasize ? 'font-medium text-foreground' : 'text-muted-foreground',
            ),
      )}
    >
      <Icon
        className={cn(
          'size-4 shrink-0 transition-colors',
          active ? 'text-primary' : 'text-muted-foreground/70 group-hover/link:text-foreground',
        )}
        aria-hidden="true"
      />
      <span className="truncate">{label}</span>
    </Link>
  );
}

/**
 * The block index: an "All blocks" link over category sections. `onNavigate`
 * fires on any link click (the mobile disclosure uses it to close itself).
 */
export function BlocksNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Blocks" className="flex flex-col gap-5">
      <NavLink
        href="/blocks"
        active={pathname === '/blocks'}
        icon={LayoutGrid}
        label="All blocks"
        onNavigate={onNavigate}
        emphasize
      />

      {BLOCK_CATEGORIES.map((category) => {
        // A flat category (chat) is a single top-level link — no redundant header.
        if (isFlat(category)) {
          const block = category.blocks[0];
          return (
            <NavLink
              key={category.id}
              href={block.route}
              active={pathname === block.route}
              icon={block.icon}
              label={block.title}
              onNavigate={onNavigate}
            />
          );
        }

        const headerHref = categoryRoute(category.id);
        const CategoryIcon = category.icon;

        return (
          <div key={category.id} className="flex flex-col gap-1">
            <Link
              href={headerHref}
              onClick={onNavigate}
              aria-current={pathname === headerHref ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2 rounded-md px-2 py-0.5 text-xs font-semibold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                pathname === headerHref ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <CategoryIcon className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{category.title}</span>
            </Link>

            <ul className="flex flex-col gap-0.5 pl-3">
              {category.blocks.map((block) => (
                <li key={block.slug}>
                  <NavLink
                    href={block.route}
                    active={pathname === block.route}
                    icon={block.icon}
                    label={block.title}
                    onNavigate={onNavigate}
                  />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
