'use client';

/**
 * @file sources.tsx
 * @description Retrieval citations from LOCAL RAG results (e.g.
 * `useSemanticSearch`). `Sources` is a collapsible container; each `Source`
 * renders a favicon/title/excerpt chip and a 0–1 relevance score. An optional
 * tabbed layout switches between Web/Images/News-style result variants. All
 * favicons/images come from already-stored local metadata — no remote unfurl.
 */
import * as React from 'react';
import { ChevronDown, FileText, Globe } from 'lucide-react';
import { cn } from '@/registry/localmode/lib/utils';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/registry/localmode/ui/collapsible';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/registry/localmode/ui/tabs';

/** A retrieved source/citation (from local metadata only). */
export interface SourceItem {
  /** Stable id. */
  id: string;
  /** Display title. */
  title: string;
  /** Short excerpt / snippet. */
  excerpt?: string;
  /** Relevance score in [0, 1]. */
  score?: number;
  /** Optional link (may be a local/document URL). */
  url?: string;
  /** Optional favicon/image URL (from stored metadata; no network unfurl). */
  faviconUrl?: string;
  /**
   * Optional explicit leading icon, overriding the auto-picked one (favicon for
   * web sources, a document icon for local/RAG sources).
   */
  icon?: React.ReactNode;
  /** Result type for the tabbed layout. @default "web" */
  type?: 'web' | 'image' | 'news';
}

/** Props for {@link Sources}. */
export interface SourcesProps extends React.ComponentProps<'div'> {
  /** Default-collapsed. @default false */
  defaultOpen?: boolean;
}

const SourcesOpenContext = React.createContext(false);

/** Collapsible sources container. */
export function Sources({
  defaultOpen = false,
  className,
  children,
  ...props
}: SourcesProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <SourcesOpenContext.Provider value={open}>
      <Collapsible
        open={open}
        onOpenChange={setOpen}
        data-slot="sources"
        className={cn('rounded-lg border border-border', className)}
        {...props}
      >
        {children}
      </Collapsible>
    </SourcesOpenContext.Provider>
  );
}

/** Props for {@link SourcesTrigger}. */
export interface SourcesTriggerProps extends React.ComponentProps<'button'> {
  /** Number of sources, shown in the label. */
  count: number;
}

/** Collapsible trigger labeled with the source count. */
export function SourcesTrigger({
  count,
  className,
  children,
  ...props
}: SourcesTriggerProps) {
  const open = React.useContext(SourcesOpenContext);
  return (
    <CollapsibleTrigger
      data-slot="sources-trigger"
      className={cn(
        'flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        className,
      )}
      {...props}
    >
      <FileText className="size-4 shrink-0" />
      <span className="min-w-0 truncate font-medium">
        {children ?? `${count} ${count === 1 ? 'source' : 'sources'}`}
      </span>
      <ChevronDown
        className={cn('ml-auto size-4 transition-transform', open && 'rotate-180')}
      />
    </CollapsibleTrigger>
  );
}

/** Props for {@link SourcesContent}. */
export interface SourcesContentProps extends React.ComponentProps<'div'> {
  /** When set, renders a Web/Images/News tabbed layout over these sources. */
  tabbed?: boolean;
  /** Sources, used to populate tabs when `tabbed`. */
  sources?: SourceItem[];
}

/** The expandable source list (or tabbed layout). */
export function SourcesContent({
  tabbed = false,
  sources = [],
  className,
  children,
  ...props
}: SourcesContentProps) {
  if (tabbed) {
    const groups = {
      web: sources.filter((s) => (s.type ?? 'web') === 'web'),
      image: sources.filter((s) => s.type === 'image'),
      news: sources.filter((s) => s.type === 'news'),
    };
    return (
      <CollapsibleContent data-slot="sources-content">
        <div className={cn('p-3', className)} {...props}>
          <Tabs defaultValue="web">
            <TabsList>
              <TabsTrigger value="web">Web ({groups.web.length})</TabsTrigger>
              <TabsTrigger value="image">Images ({groups.image.length})</TabsTrigger>
              <TabsTrigger value="news">News ({groups.news.length})</TabsTrigger>
            </TabsList>
            {(['web', 'image', 'news'] as const).map((k) => (
              <TabsContent key={k} value={k} className="space-y-2">
                {groups[k].map((s) => (
                  <Source key={s.id} source={s} />
                ))}
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </CollapsibleContent>
    );
  }

  return (
    <CollapsibleContent data-slot="sources-content">
      <div className={cn('space-y-2 p-3', className)} {...props}>
        {children}
      </div>
    </CollapsibleContent>
  );
}

/** Props for {@link Source}. */
export interface SourceProps extends React.ComponentProps<'a'> {
  /** The source to render. */
  source: SourceItem;
}

/** A single favicon/title/excerpt/score chip. */
export function Source({ source, className, ...props }: SourceProps) {
  const { title, excerpt, score, url, faviconUrl, icon } = source;
  return (
    <a
      href={url ?? '#'}
      target={url ? '_blank' : undefined}
      rel="noreferrer noopener"
      data-slot="source"
      className={cn(
        'flex items-start gap-2 rounded-md border border-border bg-card p-2 text-left text-card-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        className,
      )}
      {...props}
    >
      {icon != null ? (
        <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-muted-foreground">
          {icon}
        </span>
      ) : faviconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={faviconUrl} alt="" className="mt-0.5 size-4 shrink-0 rounded-sm" />
      ) : url ? (
        <Globe className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      ) : (
        <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <div className="mt-0.5 flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
          {score != null && (
            <span className="ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
              {(score * 100).toFixed(0)}%
            </span>
          )}
        </div>
        {excerpt && (
          <p className="mt-0.5 line-clamp-2 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
            {excerpt}
          </p>
        )}
      </div>
    </a>
  );
}
