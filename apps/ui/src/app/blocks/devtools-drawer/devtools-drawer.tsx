'use client';

/**
 * @file devtools-drawer.tsx
 * @description The global observability drawer body (`ui/blocks/devtools-drawer`) — six tabbed surfaces (Queue / Events / Pipeline / Models / Device / VectorDB) over the `@localmode/devtools` bridge.
 * @constraint onClear/onEvict are intentionally unwired — the devtools bridge exposes no provider-agnostic clear/evict API.
 */

import * as React from 'react';
import { Database, Power, X } from 'lucide-react';
import { disableDevTools, enableDevTools } from '@localmode/devtools';
import {
  useDevToolsEvents,
  useDevToolsModelCache,
  useDevToolsPipelineRuns,
  useDevToolsQueueStats,
  useDevToolsVectorDBs,
} from '@localmode/devtools/react';

import { DeviceCapabilityGrid } from '@/components/device-capability-grid';
import { EventLogViewer } from '@/components/event-log-viewer';
import { InferenceQueueMonitor } from '@/components/inference-queue-monitor';
import { ModelCacheTable } from '@/components/model-cache-table';
import { PipelineRunInspector } from '@/components/pipeline-run-inspector';
import { VectorStorageObservability } from '@/components/vector-storage-observability';
import { cn } from '@/lib/utils';

/** The six drawer tabs, in display order. */
const TABS = [
  { id: 'queue', label: 'Queue' },
  { id: 'events', label: 'Events' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'models', label: 'Models' },
  { id: 'device', label: 'Device' },
  { id: 'vectordb', label: 'VectorDB' },
] as const;

/** One of the six tab identifiers. */
type TabId = (typeof TABS)[number]['id'];

/** Props for {@link DevToolsDrawer}. */
export interface DevToolsDrawerProps {
  /** Whether the drawer is visible. Closed = hidden, state preserved. */
  open: boolean;
  /** Called with the next open state (close button / toggle). */
  onOpenChange: (open: boolean) => void;
  /**
   * Called after the power-off control ran `disableDevTools()`, so the host
   * can fully unmount the drawer and clear its persisted enabled flag. When
   * omitted, power-off falls back to `onOpenChange(false)`.
   */
  onPowerOff?: () => void;
}

/** Compact relative time for an ISO timestamp ("just now", "3m ago"). */
function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** One always-mounted tab panel — hidden (not unmounted) when inactive. */
function TabPanel({
  id,
  active,
  children,
}: {
  id: TabId;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={`devtools-panel-${id}`}
      aria-labelledby={`devtools-tab-${id}`}
      className={cn(!active && 'hidden')}
    >
      {children}
    </div>
  );
}

/**
 * The devtools drawer body: a fixed right-side panel with six observability
 * surfaces fed by the `@localmode/devtools/react` hooks. Mounting enables
 * devtools instrumentation; visibility is controlled by the host via `open`.
 *
 * @example
 * ```tsx
 * const [open, setOpen] = useState(false);
 * <DevToolsDrawer open={open} onOpenChange={setOpen} onPowerOff={reset} />
 * ```
 */
export function DevToolsDrawer({ open, onOpenChange, onPowerOff }: DevToolsDrawerProps) {
  const [tab, setTab] = React.useState<TabId>('queue');

  // First mount = first open (the host lazy-mounts this body): start the
  // collectors. Idempotent — a no-op when the host already re-enabled on
  // reload from its persisted flag.
  React.useEffect(() => {
    enableDevTools();
  }, []);

  const queues = useDevToolsQueueStats();
  const events = useDevToolsEvents();
  const runs = useDevToolsPipelineRuns();
  const models = useDevToolsModelCache();
  const vectorDBs = useDevToolsVectorDBs();

  const handlePowerOff = () => {
    disableDevTools();
    if (onPowerOff) onPowerOff();
    else onOpenChange(false);
  };

  const collections = Object.entries(vectorDBs);

  return (
    <aside
      role="dialog"
      aria-label="LocalMode DevTools"
      // `hidden` (display:none) when closed — not an off-screen transform — so
      // driver visibility checks and assistive tech agree the drawer is gone.
      // It stays mounted: tab/filter state survives, collectors keep running.
      className={cn(
        'fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-background text-foreground shadow-2xl',
        !open && 'hidden',
      )}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">LocalMode DevTools</h2>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={handlePowerOff}
            title="Power off - stop collecting and reset"
            aria-label="Power off devtools"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Power className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close devtools drawer"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      <nav
        role="tablist"
        aria-label="DevTools surfaces"
        className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-2 py-1.5"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`devtools-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`devtools-panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={cn(
              'shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              tab === t.id
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* All six panels stay mounted (hidden, not unmounted) so per-surface UI
          state — the event filter text, expanded step timings — survives tab
          switches. pb-16 keeps content clear of the floating toggle button. */}
      <div className="flex-1 overflow-y-auto p-4 pb-16">
        <TabPanel id="queue" active={tab === 'queue'}>
          <InferenceQueueMonitor queues={queues} className="max-w-none" />
        </TabPanel>

        <TabPanel id="events" active={tab === 'events'}>
          <EventLogViewer events={events} />
        </TabPanel>

        <TabPanel id="pipeline" active={tab === 'pipeline'}>
          <PipelineRunInspector runs={runs} className="max-w-none" />
        </TabPanel>

        <TabPanel id="models" active={tab === 'models'}>
          <ModelCacheTable entries={models} className="max-w-none" />
        </TabPanel>

        <TabPanel id="device" active={tab === 'device'}>
          {/* Environment-fed: the grid reads the copy-owned useCapabilities
              hook itself and takes no data props. */}
          <DeviceCapabilityGrid className="max-w-none" />
        </TabPanel>

        <TabPanel id="vectordb" active={tab === 'vectordb'}>
          {collections.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 py-8 text-center text-card-foreground">
              <Database className="size-5 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium">No VectorDB activity yet</p>
              <p className="text-xs text-muted-foreground">
                Per-collection stats appear once a block adds, searches, or
                deletes vectors.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {collections.map(([name, s]) => (
                <section key={name} className="flex flex-col gap-2">
                  {/* Drawer-local op counts: the bridge tracks per-collection
                      operation counters the reused primitive doesn't render. */}
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
                    <span className="font-mono text-sm font-medium text-foreground">
                      {name}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {s.totalAdds.toLocaleString()} adds ·{' '}
                      {s.totalSearches.toLocaleString()} searches ·{' '}
                      {s.totalDeletes.toLocaleString()} deletes
                    </span>
                    <span className="text-muted-foreground/80" title={s.lastActivity}>
                      last activity {formatRelative(s.lastActivity)}
                    </span>
                  </div>
                  <VectorStorageObservability
                    // The devtools bridge collects no compression stats, so
                    // the badge shows the uncompressed raw-tier default; the
                    // latency badge is the bridge's running search average.
                    stats={{ ratio: 1, originalSizeBytes: 0, compressedSizeBytes: 0 }}
                    tier="raw"
                    searchLatencyMs={
                      s.totalSearches > 0 ? s.avgSearchDurationMs : undefined
                    }
                    className="max-w-none"
                  />
                </section>
              ))}
              <p className="text-xs text-muted-foreground">
                Compression stats aren&apos;t collected by the devtools bridge;
                tiers show the raw default.
              </p>
            </div>
          )}
        </TabPanel>
      </div>
    </aside>
  );
}
