'use client';

/**
 * @file block-shell.tsx
 * @description Public chrome for block pages. `BlockShellSection` renders ONE
 * block — title + per-block install command + Preview/Code tabs + a stable
 * anchor id — with the live block kept mounted across tab switches so a loaded
 * model survives toggling to Code. `BlockShell` wraps a single section in a
 * `<main>` for a flat `/blocks/<name>` page (backward-compatible with the 12
 * existing page wrappers). `CategoryShell` mounts N sections for a multi-block
 * `/blocks/<category>` page: each block gets its own install command, Code tab
 * (its own source snapshot), and `#<slug>` anchor, and gates its own model load,
 * so nothing downloads on page open even with N gated previews mounted.
 *
 * Layout invariants:
 * - No horizontal page overflow at 375: every flex-column ancestor carries
 *   `min-w-0` and the install-command / source code blocks scroll INTERNALLY
 *   (`overflow-x-auto`) instead of floating the long `@localmode/ui/blocks/…`
 *   line out and expanding the page body.
 * - The Preview/Code switcher is a real ARIA tablist (roles + `aria-selected` +
 *   `aria-controls`, roving tabindex, arrow/Home/End keyboard, focus-visible
 *   ring), not bare buttons.
 * - Each `<main>` reserves bottom padding on narrow viewports so the fixed
 *   DevTools toggle (bottom-right) never sits over the last interactive row.
 */
import * as React from 'react';
import { Code2, Eye } from 'lucide-react';
import { DynamicCodeBlock } from 'fumadocs-ui/components/dynamic-codeblock';
import { cn } from '@/lib/utils';
import { BlockPageHeader } from '@/components/block-page-header';
import type { Crumb } from '@/components/blocks-breadcrumb';
import { blockPageMarkdown, categoryPageMarkdown } from '@/lib/block-markdown';
import { getCategory, categoryRoute } from '@/app/blocks/category-map';

/** Props shared by {@link BlockShellSection} and {@link BlockShell}. */
interface BlockShellProps {
  /** Block title. */
  title: string;
  /** One-line description of what runs and which model(s). */
  description: string;
  /** Registry item name after `ui/blocks/` — flat `"chat"` or `"<category>/<slug>"`. */
  name: string;
  /** Raw source of the block implementation (read server-side); null if missing. */
  source: string | null;
  /** The live block component. */
  children: React.ReactNode;
  /**
   * Stable anchor id so `/blocks/<category>#<anchorId>` scrolls to this block.
   * Defaults to {@link BlockShellProps.name}. Set to the block slug on a category page.
   */
  anchorId?: string;
}

/** Props for {@link BlockShellSection}. */
interface BlockShellSectionProps extends BlockShellProps {
  /** Heading level for the block title: `1` on a flat page, `2` under a category header. */
  headingLevel?: 1 | 2;
}

/** One tab in the Preview/Code {@link BlockShellSection} tablist. */
const ShellTab = React.forwardRef<
  HTMLButtonElement,
  {
    /** Whether this tab's panel is the selected one. */
    active: boolean;
    /** This tab's stable id (referenced by its panel's `aria-labelledby`). */
    id: string;
    /** The id of the panel this tab controls. */
    controls: string;
    /** Select this tab. */
    onSelect: () => void;
    icon: React.ReactNode;
    children: React.ReactNode;
  }
>(function ShellTab({ active, id, controls, onSelect, icon, children }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      id={id}
      aria-selected={active}
      aria-controls={controls}
      // Roving tabindex: only the selected tab is in the Tab order; the
      // arrow keys (handled on the tablist) move focus between tabs.
      tabIndex={active ? 0 : -1}
      onClick={onSelect}
      data-active={active}
      className={cn(
        'inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors sm:py-1.5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      {children}
    </button>
  );
});

/**
 * One block's chrome — heading, install command, and Preview/Code tabs — with a
 * stable anchor id and its own tab state, so multiple sections can be mounted on
 * one category page independently. The live block stays mounted across tab
 * switches (hidden, not unmounted) so a loaded model isn't lost.
 */
export function BlockShellSection({
  title,
  description,
  name,
  source,
  children,
  anchorId,
  headingLevel = 1,
}: BlockShellSectionProps) {
  const [tab, setTab] = React.useState<'preview' | 'code'>('preview');
  const installCmd = `npx shadcn@latest add @localmode/ui/blocks/${name}`;
  const id = anchorId ?? name;
  const Heading = headingLevel === 1 ? 'h1' : 'h2';

  // Stable, collision-free ids for the tab↔panel wiring (block `name`s contain
  // `/`, which is awkward in ids/fragments — `useId` sidesteps that entirely).
  const uid = React.useId();
  const previewTabId = `${uid}-tab-preview`;
  const codeTabId = `${uid}-tab-code`;
  const previewPanelId = `${uid}-panel-preview`;
  const codePanelId = `${uid}-panel-code`;
  const previewTabRef = React.useRef<HTMLButtonElement>(null);
  const codeTabRef = React.useRef<HTMLButtonElement>(null);

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let next: 'preview' | 'code' | null = null;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowUp':
        // Two tabs — any horizontal/vertical arrow toggles to the other one.
        next = tab === 'preview' ? 'code' : 'preview';
        break;
      case 'Home':
        next = 'preview';
        break;
      case 'End':
        next = 'code';
        break;
      default:
        return;
    }
    e.preventDefault();
    setTab(next);
    (next === 'preview' ? previewTabRef : codeTabRef).current?.focus();
  };

  return (
    <section id={id} data-block-shell={name} className="flex min-w-0 scroll-mt-20 flex-col gap-5">
      <div className="min-w-0">
        <Heading className="text-2xl font-bold tracking-tight text-balance">{title}</Heading>
        <p className="mt-1 max-w-2xl text-pretty text-muted-foreground">{description}</p>
      </div>

      <div className="min-w-0">
        <p className="mb-1 text-xs font-medium text-muted-foreground">Install this block</p>
        {/* The long unbreakable install command scrolls inside this box rather
            than floating out and expanding the page body at 375. */}
        <div className="min-w-0 max-w-full overflow-x-auto">
          <DynamicCodeBlock lang="bash" code={installCmd} />
        </div>
      </div>

      <div className="min-w-0 overflow-hidden rounded-lg border border-border">
        <div
          role="tablist"
          aria-label="Block view"
          onKeyDown={handleTabKeyDown}
          className="flex items-center gap-1 border-b border-border bg-muted/40 px-2 py-1.5"
        >
          <ShellTab
            ref={previewTabRef}
            active={tab === 'preview'}
            id={previewTabId}
            controls={previewPanelId}
            onSelect={() => setTab('preview')}
            icon={<Eye className="h-4 w-4" />}
          >
            Preview
          </ShellTab>
          <ShellTab
            ref={codeTabRef}
            active={tab === 'code'}
            id={codeTabId}
            controls={codePanelId}
            onSelect={() => setTab('code')}
            icon={<Code2 className="h-4 w-4" />}
          >
            Code
          </ShellTab>
        </div>

        {/* Both panels stay mounted across tab switches so a loaded model isn't
            lost; the inactive one is display:none (removed from the a11y tree). */}
        <div
          role="tabpanel"
          id={previewPanelId}
          aria-labelledby={previewTabId}
          data-block-preview
          className={cn('min-w-0', tab !== 'preview' && 'hidden')}
        >
          {children}
        </div>
        <div
          role="tabpanel"
          id={codePanelId}
          aria-labelledby={codeTabId}
          data-block-code
          tabIndex={0}
          className={cn('min-w-0 overflow-x-auto', tab !== 'code' && 'hidden')}
        >
          {source ? (
            <DynamicCodeBlock lang="tsx" code={source} />
          ) : (
            <p className="p-4 text-sm text-muted-foreground">Source unavailable.</p>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Flat single-block page chrome: one {@link BlockShellSection} in a `<main>`.
 * Backward-compatible with the 12 existing `/blocks/<name>` page wrappers.
 */
export function BlockShell({ title, description, name, source, children, anchorId }: BlockShellProps) {
  const categoryId = name.includes('/') ? name.split('/')[0] : null;
  const crumbs: Crumb[] = categoryId
    ? [
        { label: 'Blocks', href: '/blocks' },
        { label: getCategory(categoryId)?.title ?? categoryId, href: categoryRoute(categoryId) },
        { label: title },
      ]
    : [{ label: 'Blocks', href: '/blocks' }, { label: title }];

  return (
    <main className="mx-auto flex w-full min-w-0 max-w-4xl flex-col gap-5 p-6 pb-24 lg:pb-6">
      <BlockPageHeader
        crumbs={crumbs}
        markdown={blockPageMarkdown(name, source)}
        markdownUrl={`/api/blocks-md/${name}`}
      />
      <BlockShellSection
        title={title}
        description={description}
        name={name}
        source={source}
        anchorId={anchorId}
      >
        {children}
      </BlockShellSection>
    </main>
  );
}

/** One block hosted on a category page. */
export interface CategoryShellBlock {
  /** Block slug — the `#<slug>` anchor and canonical last route segment. */
  slug: string;
  /** Registry item name after `ui/blocks/` — flat `"chat"` or `"<category>/<slug>"`. */
  name: string;
  /** Block title. */
  title: string;
  /** One-line description of what runs and which model(s). */
  description: string;
  /** Raw source snapshot of the block (read server-side); null if missing. */
  source: string | null;
  /** The live block component. */
  children: React.ReactNode;
}

/** Props for {@link CategoryShell}. */
interface CategoryShellProps {
  /** Category display title (the page header). */
  title: string;
  /** Optional category description under the header. */
  description?: string;
  /** Blocks to host, each in its own {@link BlockShellSection}. */
  blocks: CategoryShellBlock[];
}

/**
 * Multi-block category page chrome: a category header over N
 * {@link BlockShellSection}s. Each block owns its install command, Code tab, and
 * `#<slug>` anchor, and gates its own model load. A single-block category renders
 * one section (identical experience to {@link BlockShell}); multi-block categories
 * render the N>1 path.
 *
 * Heading outline: the category header is the page `<h1>` and every block title
 * renders as an `<h2>` (`headingLevel={2}`), so the block sections beneath sit
 * at `<h3>` for a correct h1 → h2 → h3 order.
 */
export function CategoryShell({ title, description, blocks }: CategoryShellProps) {
  const categoryId = blocks[0]?.name.split('/')[0] ?? '';
  const crumbs: Crumb[] = [{ label: 'Blocks', href: '/blocks' }, { label: title }];
  const sourceBySlug = Object.fromEntries(blocks.map((b) => [b.slug, b.source]));

  return (
    <main className="mx-auto flex w-full min-w-0 max-w-4xl flex-col gap-12 p-6 pb-24 lg:pb-6">
      <div className="flex min-w-0 flex-col gap-5">
        <BlockPageHeader
          crumbs={crumbs}
          markdown={categoryPageMarkdown(categoryId, sourceBySlug) ?? ''}
          markdownUrl={`/api/blocks-md/${categoryId}`}
        />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-balance">{title}</h1>
          {description ? (
            <p className="mt-1 max-w-2xl text-pretty text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>

      {blocks.map((b) => (
        <BlockShellSection
          key={b.slug}
          anchorId={b.slug}
          name={b.name}
          title={b.title}
          description={b.description}
          source={b.source}
          headingLevel={2}
        >
          {b.children}
        </BlockShellSection>
      ))}
    </main>
  );
}
