'use client';

import { useState } from 'react';
import { Inbox, Search, SearchX, Trash2 } from 'lucide-react';

import { cn } from '@/registry/localmode/lib/utils';

/**
 * A single captured devtools event. Mirrors the `DevToolsEvent` shape from
 * `@localmode/devtools` field-for-field, so `useDevToolsEvents()` output
 * feeds the `events` prop directly with no mapping layer.
 */
export interface DevToolsEventLike {
  /** Monotonically increasing event ID. */
  id: number;
  /** Namespaced event type (e.g. `'vectordb:add'`, `'embedding:embedComplete'`). */
  type: string;
  /** Event payload. */
  data: Record<string, unknown>;
  /** ISO 8601 timestamp. */
  timestamp: string;
}

/** Props for {@link EventLogViewer}. */
export interface EventLogViewerProps {
  /**
   * The event stream, oldest first (the order `useDevToolsEvents` returns).
   * Rendered newest first.
   */
  events: DevToolsEventLike[];
  /**
   * Maximum number of events visible at once, applied after filtering and
   * keeping the newest. An overflow line reports how many older matches are
   * hidden.
   *
   * @default 100
   */
  maxVisible?: number;
  /**
   * Controlled filter value. Omit to let the component manage its own filter
   * state internally.
   */
  filter?: string;
  /** Called with the new filter text whenever the filter input changes. */
  onFilterChange?: (filter: string) => void;
  /** When provided, a Clear button renders and invokes this callback. */
  onClear?: () => void;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/** Badge accents keyed by event-type namespace (the segment before `:`). */
const NAMESPACE_BADGES: Record<string, string> = {
  vectordb: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  embedding: 'border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400',
  model: 'border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-400',
  queue: 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  pipeline: 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400',
  storage: 'border-orange-500/40 bg-orange-500/10 text-orange-600 dark:text-orange-400',
};

/** Fallback badge accent for unrecognized namespaces. */
const DEFAULT_BADGE = 'border-border bg-muted text-muted-foreground';

/** Compact "time ago" for an ISO 8601 timestamp, computed at render time. */
function formatRelativeTime(timestamp: string, now: number): string {
  const elapsedMs = now - new Date(timestamp).getTime();
  if (Number.isNaN(elapsedMs)) return timestamp;
  const seconds = Math.floor(elapsedMs / 1000);
  if (seconds < 1) return 'now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Absolute locale time for tooltips; falls back to the raw string when unparsable. */
function formatAbsoluteTime(timestamp: string): string {
  const ms = new Date(timestamp).getTime();
  return Number.isNaN(ms) ? timestamp : new Date(ms).toLocaleString();
}

/** Serialize an event payload defensively (circular payloads fall back to String). */
function serializePayload(data: Record<string, unknown>): string {
  try {
    return JSON.stringify(data) ?? '{}';
  } catch {
    return String(data);
  }
}

/**
 * Newest-first devtools event log: relative timestamps (absolute on hover),
 * namespace-colored type badges (`vectordb:` / `embedding:` / `model` /
 * `queue` / `pipeline` / `storage`), serialized payloads, a case-insensitive
 * substring filter on event type, a visible cap (default 100) with an
 * overflow line for older hidden matches, distinct "no events yet" and "no
 * events matching filter" empty states, and an optional Clear affordance.
 *
 * Works with any backend or event source — the component renders whatever
 * `events` you pass. Recommended data source: the `useDevToolsEvents` hook
 * from `@localmode/devtools/react` (on-device, optional); its `DevToolsEvent[]`
 * result feeds `events` directly.
 *
 * @example
 * ```tsx
 * const events = useDevToolsEvents();
 * <EventLogViewer events={events} maxVisible={100} />
 * ```
 */
export function EventLogViewer({
  events,
  maxVisible = 100,
  filter,
  onFilterChange,
  onClear,
  className,
}: EventLogViewerProps) {
  const [internalFilter, setInternalFilter] = useState('');
  const activeFilter = filter ?? internalFilter;

  const handleFilterChange = (next: string) => {
    if (filter === undefined) setInternalFilter(next);
    onFilterChange?.(next);
  };

  const query = activeFilter.trim().toLowerCase();
  const matches = query
    ? events.filter((event) => event.type.toLowerCase().includes(query))
    : events;
  const capped =
    matches.length > maxVisible ? matches.slice(matches.length - maxVisible) : matches;
  const visible = capped.slice().reverse();
  const hiddenCount = matches.length - visible.length;
  const now = Date.now();

  return (
    <div
      className={cn(
        'flex w-full flex-col gap-2 rounded-xl border border-border bg-card p-3 text-card-foreground shadow-sm',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="text"
            value={activeFilter}
            onChange={(event) => handleFilterChange(event.target.value)}
            placeholder="Filter by type…"
            aria-label="Filter events by type"
            className="w-full rounded-md border border-input bg-transparent py-1.5 pl-8 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </div>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            Clear
          </button>
        )}
      </div>

      {events.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-8 text-center">
          <Inbox className="size-5 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">No events captured yet.</p>
          <p className="text-xs text-muted-foreground/80">
            Activity appears here as it happens.
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-8 text-center">
          <SearchX className="size-5 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            No events match{' '}
            <span className="font-mono text-foreground">&quot;{activeFilter.trim()}&quot;</span>.
          </p>
        </div>
      ) : (
        <>
          <div className="max-h-96 overflow-y-auto pr-1">
            <ol aria-label="Event log" className="flex flex-col divide-y divide-border/60 font-mono text-xs">
              {visible.map((event) => {
                const namespace = event.type.split(':')[0] ?? event.type;
                const payload = serializePayload(event.data);
                return (
                  <li key={event.id} className="flex min-w-0 items-center gap-2 py-1.5">
                    <time
                      dateTime={event.timestamp}
                      title={formatAbsoluteTime(event.timestamp)}
                      className="w-14 shrink-0 tabular-nums text-muted-foreground"
                    >
                      {formatRelativeTime(event.timestamp, now)}
                    </time>
                    <span
                      className={cn(
                        'shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-medium',
                        NAMESPACE_BADGES[namespace] ?? DEFAULT_BADGE,
                      )}
                    >
                      {event.type}
                    </span>
                    <span title={payload} className="min-w-0 flex-1 truncate text-muted-foreground">
                      {payload}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
          {hiddenCount > 0 && (
            <p className="text-xs text-muted-foreground">
              + {hiddenCount.toLocaleString()} older {hiddenCount === 1 ? 'event' : 'events'} not
              shown (showing the newest {visible.length.toLocaleString()}).
            </p>
          )}
        </>
      )}
    </div>
  );
}
