'use client';

import { Command } from 'cmdk';
import {
  ChevronDown,
  Clock,
  Download,
  FileBox,
  Heart,
  RefreshCw,
  Search,
  SearchX,
  TriangleAlert,
} from 'lucide-react';

import { cn } from '@/registry/localmode/lib/utils';

/** Sort order for search results. */
export type ModelSearchSort = 'downloads' | 'likes' | 'lastModified';

/** A single model-repo search result row. */
export interface ModelSearchResult {
  /** Stable repo id (e.g. "bartowski/Llama-3.2-1B-Instruct-GGUF"). */
  repoId: string;
  /** Repo author/organization. */
  author?: string;
  /** Total download count (rendered compactly, e.g. "1.2M"). */
  downloads?: number;
  /** Like count (rendered compactly). */
  likes?: number;
  /** Last-modified ISO timestamp (rendered as a relative time). */
  lastModified?: string;
  /** Repo tags (capped with an overflow count). */
  tags?: string[];
}

/** A single file inside an expanded model repo. */
export interface ModelRepoFile {
  /** File name (e.g. "Llama-3.2-1B-Instruct-Q4_K_M.gguf"). */
  filename: string;
  /** File size in bytes (rendered human-readable). */
  sizeBytes?: number;
  /** Quantization label badge (e.g. "Q4_K_M"). */
  quantLabel?: string;
}

/** Props for {@link ModelSearchBrowser}. */
export interface ModelSearchBrowserProps {
  /** The controlled search query. */
  query: string;
  /** Fired with the new query on every keystroke. */
  onQueryChange: (q: string) => void;
  /** The active sort order. */
  sort: ModelSearchSort;
  /** Fired with the chosen sort order. */
  onSortChange: (s: ModelSearchSort) => void;
  /** The result rows to render (already searched/sorted by the backend). */
  results: ModelSearchResult[];
  /** Whether a search (or the next page) is in flight — renders skeleton rows. */
  isLoading?: boolean;
  /** Error message for the failed search — renders the error state. */
  error?: string | null;
  /** Fired by the error state's retry affordance. */
  onRetry?: () => void;
  /** Whether more pages exist — renders the load-more affordance. */
  hasMore?: boolean;
  /** Fired when the user asks for the next page. */
  onLoadMore?: () => void;
  /** The repo id whose file list is expanded (null/undefined: none). */
  expandedRepoId?: string | null;
  /** Fired with the clicked repo id, or null when the expanded row is collapsed. */
  onSelectRepo?: (repoId: string | null) => void;
  /** Files of the expanded repo (null while not yet available). */
  files?: ModelRepoFile[] | null;
  /** Whether the expanded repo's file list is loading. */
  filesLoading?: boolean;
  /** Error message for the failed file listing. */
  filesError?: string | null;
  /** Fired when the user picks a file inside the expanded repo. */
  onSelectFile?: (repoId: string, file: ModelRepoFile) => void;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/** The three sort options, in display order. */
const SORT_OPTIONS: { value: ModelSearchSort; label: string }[] = [
  { value: 'downloads', label: 'Downloads' },
  { value: 'likes', label: 'Likes' },
  { value: 'lastModified', label: 'Updated' },
];

/** Tags rendered per row before collapsing into an overflow count. */
const MAX_TAGS = 4;

/** Compact count formatting (1234 → "1.2K", 1_240_000 → "1.2M"). */
function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

/** Human-readable byte size ("807.7 MB", "1.3 GB"). */
function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1).replace(/\.0$/, '')} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1).replace(/\.0$/, '')} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/** Relative time from an ISO timestamp ("3d ago"); null for unparseable input. */
function formatRelative(iso: string): string | null {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

/** A pulsing placeholder row shown while a search is in flight. */
function SkeletonRow() {
  return (
    <div className="flex flex-col gap-2 rounded-lg px-3 py-2.5" aria-hidden="true">
      <div className="h-4 w-2/5 animate-pulse rounded bg-muted" />
      <div className="h-3 w-3/5 animate-pulse rounded bg-muted" />
    </div>
  );
}

/**
 * A cmdk-based searchable model-repo browser: a controlled search input, a
 * sort selector (downloads / likes / last-modified), result rows (repo id,
 * author, compact download/like counts, relative last-modified, capped tag
 * badges), load-more pagination, and a per-repo expandable file list
 * (filename, quantization badge, human-readable size) with per-file select
 * actions — plus distinct loading, empty, and error-with-retry states.
 *
 * Purely presentational: every value arrives via props and every action
 * leaves via a callback, so any backend can feed it — the HuggingFace Hub
 * API, a private model registry, or static fixtures. The consumer owns all
 * fetching, debouncing, and pagination state; cmdk's built-in filtering is
 * disabled because results arrive pre-filtered.
 *
 * @example
 * ```tsx
 * <ModelSearchBrowser
 *   query={query}
 *   onQueryChange={setQuery}
 *   sort={sort}
 *   onSortChange={setSort}
 *   results={results}
 *   expandedRepoId={expanded}
 *   onSelectRepo={inspectRepo}
 *   files={files}
 *   onSelectFile={(repoId, file) => pick(`${repoId}:${file.filename}`)}
 * />
 * ```
 */
export function ModelSearchBrowser({
  query,
  onQueryChange,
  sort,
  onSortChange,
  results,
  isLoading = false,
  error = null,
  onRetry,
  hasMore = false,
  onLoadMore,
  expandedRepoId = null,
  onSelectRepo,
  files = null,
  filesLoading = false,
  filesError = null,
  onSelectFile,
  className,
}: ModelSearchBrowserProps) {
  const showEmpty = !isLoading && !error && results.length === 0;

  return (
    <div
      className={cn(
        'flex w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm',
        className,
      )}
    >
      <Command shouldFilter={false} label="Search model repositories">
        <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Command.Input
              value={query}
              onValueChange={onQueryChange}
              placeholder="Search model repos…"
              className="w-full rounded-md border border-input bg-transparent py-1.5 pl-8 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </div>
          <div
            role="group"
            aria-label="Sort results"
            className="inline-flex shrink-0 items-center gap-0.5 self-start rounded-lg border border-border bg-muted p-0.5 sm:self-auto"
          >
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={sort === opt.value}
                onClick={() => onSortChange(opt.value)}
                className={cn(
                  'rounded-md px-2 py-1 text-xs font-medium transition-colors',
                  sort === opt.value
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <Command.List className="max-h-96 overflow-y-auto p-1.5">
          {error ? (
            <div role="alert" className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <TriangleAlert className="size-5 text-destructive" aria-hidden="true" />
              <p className="text-sm text-destructive [overflow-wrap:anywhere]">{error}</p>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
                >
                  <RefreshCw className="size-3" aria-hidden="true" />
                  Retry
                </button>
              )}
            </div>
          ) : (
            <>
              {results.map((r) => {
                const expanded = expandedRepoId === r.repoId;
                const relative = r.lastModified ? formatRelative(r.lastModified) : null;
                const tags = r.tags ?? [];
                return (
                  <div key={r.repoId}>
                    <Command.Item
                      value={r.repoId}
                      onSelect={() => onSelectRepo?.(expanded ? null : r.repoId)}
                      aria-expanded={expanded}
                      className="flex cursor-pointer flex-col gap-1.5 rounded-lg px-3 py-2.5 outline-none data-[selected=true]:bg-accent/50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-mono text-sm font-medium">{r.repoId}</p>
                          {r.author && (
                            <p className="truncate text-xs text-muted-foreground">by {r.author}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                          {r.downloads != null && (
                            <span className="inline-flex items-center gap-1 tabular-nums">
                              <Download className="size-3" aria-hidden="true" />
                              {formatCount(r.downloads)}
                            </span>
                          )}
                          {r.likes != null && (
                            <span className="inline-flex items-center gap-1 tabular-nums">
                              <Heart className="size-3" aria-hidden="true" />
                              {formatCount(r.likes)}
                            </span>
                          )}
                          {relative && (
                            <span className="hidden items-center gap-1 sm:inline-flex">
                              <Clock className="size-3" aria-hidden="true" />
                              {relative}
                            </span>
                          )}
                          <ChevronDown
                            className={cn('size-3.5 transition-transform', expanded && 'rotate-180')}
                            aria-hidden="true"
                          />
                        </div>
                      </div>
                      {tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {tags.slice(0, MAX_TAGS).map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex items-center rounded-md border border-border bg-background px-1.5 py-0.5 text-xs font-medium text-muted-foreground"
                            >
                              {tag}
                            </span>
                          ))}
                          {tags.length > MAX_TAGS && (
                            <span className="inline-flex items-center px-1 py-0.5 text-[11px] text-muted-foreground">
                              +{tags.length - MAX_TAGS}
                            </span>
                          )}
                        </div>
                      )}
                    </Command.Item>

                    {expanded && (
                      <div
                        role="region"
                        aria-label={`Files in ${r.repoId}`}
                        className="mx-1.5 mb-1.5 rounded-lg border border-border bg-muted/40 p-1.5"
                      >
                        {filesLoading ? (
                          <div className="flex flex-col gap-1.5 px-2 py-1.5" aria-hidden="true">
                            <div className="h-3.5 w-3/5 animate-pulse rounded bg-muted" />
                            <div className="h-3.5 w-2/5 animate-pulse rounded bg-muted" />
                          </div>
                        ) : filesError ? (
                          <p className="inline-flex items-center gap-1.5 px-2 py-1.5 text-xs text-destructive">
                            <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
                            {filesError}
                          </p>
                        ) : files && files.length > 0 ? (
                          <ul className="flex flex-col gap-0.5">
                            {files.map((file) => (
                              <li
                                key={file.filename}
                                className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/40"
                              >
                                <FileBox
                                  className="size-3.5 shrink-0 text-muted-foreground"
                                  aria-hidden="true"
                                />
                                <span className="min-w-0 flex-1 truncate font-mono text-xs">
                                  {file.filename}
                                </span>
                                {file.quantLabel && (
                                  <span className="inline-flex shrink-0 items-center rounded-md border border-border bg-background px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                                    {file.quantLabel}
                                  </span>
                                )}
                                {file.sizeBytes != null && (
                                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                    {formatBytes(file.sizeBytes)}
                                  </span>
                                )}
                                {onSelectFile && (
                                  <button
                                    type="button"
                                    onClick={() => onSelectFile(r.repoId, file)}
                                    className="inline-flex shrink-0 items-center rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
                                  >
                                    Select
                                  </button>
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="px-2 py-1.5 text-xs text-muted-foreground">
                            No files found in this repo.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {isLoading && (
                <>
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                </>
              )}

              {showEmpty && (
                <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                  <SearchX className="size-5 text-muted-foreground" aria-hidden="true" />
                  <p className="text-sm text-muted-foreground">No models found.</p>
                  <p className="text-xs text-muted-foreground">
                    Try a different search or sort order.
                  </p>
                </div>
              )}
            </>
          )}
        </Command.List>
      </Command>

      {hasMore && !error && (
        <div className="border-t border-border p-2">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isLoading}
            className="w-full rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          >
            {isLoading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
