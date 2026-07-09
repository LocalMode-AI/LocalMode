'use client';

import { useState } from 'react';
import {
  EventLogViewer,
  type DevToolsEventLike,
} from './event-log-viewer';

/**
 * Demo for {@link EventLogViewer}. Renders a fixture event stream shaped like
 * the real devtools bridge buffer (embedding + vectordb namespaces, oldest
 * first) with `maxVisible` lowered to 10 so the overflow line is visible.
 * Type into the filter (e.g. `search` or `embedding`) to see substring
 * filtering and the no-match empty state; Clear empties the log to show the
 * no-events state. The real app passes `useDevToolsEvents()` output straight
 * in — zero network, zero model bytes here.
 */
function buildFixtureEvents(): DevToolsEventLike[] {
  const now = Date.now();
  const at = (secondsAgo: number) => new Date(now - secondsAgo * 1000).toISOString();
  let id = 0;
  const event = (
    type: string,
    data: Record<string, unknown>,
    secondsAgo: number,
  ): DevToolsEventLike => ({ id: ++id, type, data, timestamp: at(secondsAgo) });

  return [
    event('embedding:modelLoad', { modelId: 'Xenova/bge-small-en-v1.5', durationMs: 2140 }, 340),
    event('vectordb:open', { collection: 'docs' }, 322),
    event('embedding:embedStart', { modelId: 'Xenova/bge-small-en-v1.5', count: 24 }, 300),
    event(
      'embedding:embedComplete',
      { modelId: 'Xenova/bge-small-en-v1.5', count: 24, durationMs: 412 },
      296,
    ),
    event('vectordb:addMany', { collection: 'docs', count: 24 }, 292),
    event('vectordb:search', { collection: 'docs', k: 5, durationMs: 11 }, 210),
    event('vectordb:search', { collection: 'docs', k: 5, durationMs: 9 }, 180),
    event('embedding:embedStart', { modelId: 'Xenova/bge-small-en-v1.5', count: 1 }, 121),
    event(
      'embedding:embedComplete',
      { modelId: 'Xenova/bge-small-en-v1.5', count: 1, durationMs: 38 },
      120,
    ),
    event('vectordb:search', { collection: 'docs', k: 10, durationMs: 14 }, 119),
    event('vectordb:delete', { collection: 'docs', id: 'doc-7' }, 90),
    event(
      'vectordb:error',
      { collection: 'scratch', operation: 'add', message: 'QuotaExceededError' },
      64,
    ),
    event('embedding:embedStart', { modelId: 'Xenova/bge-small-en-v1.5', count: 3 }, 12),
    event(
      'embedding:embedComplete',
      { modelId: 'Xenova/bge-small-en-v1.5', count: 3, durationMs: 96 },
      11,
    ),
  ];
}

export default function EventLogViewerDemo() {
  const [events, setEvents] = useState<DevToolsEventLike[]>(buildFixtureEvents);

  return (
    <div className="flex w-full max-w-xl flex-col gap-3">
      <EventLogViewer events={events} maxVisible={10} onClear={() => setEvents([])} />
      {events.length === 0 && (
        <button
          type="button"
          onClick={() => setEvents(buildFixtureEvents())}
          className="inline-flex h-8 w-fit items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          Restore fixture events
        </button>
      )}
    </div>
  );
}
