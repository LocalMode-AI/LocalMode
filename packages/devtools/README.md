# @localmode/devtools

[![npm](https://img.shields.io/npm/v/@localmode/devtools)](https://www.npmjs.com/package/@localmode/devtools)
[![license](https://img.shields.io/npm/l/@localmode/devtools)](../../LICENSE)

[![Docs](https://img.shields.io/badge/Docs-LocalMode.dev-red)](https://localmode.dev/docs/devtools)
[![Demo](https://img.shields.io/badge/Demo-LocalMode.ai-purple)](https://localmode.ai)

DevTools instrumentation and React hooks for debugging and monitoring [LocalMode](https://localmode.dev) applications. See model cache, VectorDB stats, inference queue metrics, pipeline traces, and live event streams — all without any telemetry. Works in any browser.

## Installation

```bash
pnpm add -D @localmode/devtools
```

## Quick Start

### Headless (no UI)

```typescript
import { enableDevTools } from '@localmode/devtools';

if (process.env.NODE_ENV === 'development') {
  enableDevTools();
}
```

### React hooks (recommended React integration)

Subscribe to any bridge data domain from your own components via the
`@localmode/devtools/react` subpath:

```tsx
import { enableDevTools } from '@localmode/devtools';
import { useDevToolsQueueStats, useDevToolsEvents } from '@localmode/devtools/react';

enableDevTools();

function Observability() {
  const queues = useDevToolsQueueStats();
  const events = useDevToolsEvents({ types: ['vectordb'], limit: 50 });
  // render…
}
```

### Widget (removed in v3.0.0)

> **Removed:** the prebuilt `DevToolsWidget` overlay and its
> `@localmode/devtools/widget` subpath were **removed in v3.0.0**. Its
> replacements shipped at [localmode.ai](https://localmode.ai):
>
> - **[`@localmode/devtools/react` hooks](#react-hooks)** — subscribe to any
>   bridge data domain and render it in your own UI.
> - **`ui/devtools` registry family** — four copy-owned, theme-aware primitives
>   (`inference-queue-monitor`, `event-log-viewer`, `pipeline-run-inspector`,
>   `model-cache-table`) that render these hooks' output
>   (`npx shadcn add @localmode/ui/devtools`).
> - **`ui/blocks/devtools-drawer`** — the composed six-tab drawer (Queue /
>   Events / Pipeline / Models / Device / VectorDB, off by default and
>   zero-overhead when closed):
>   `npx shadcn add @localmode/ui/blocks/devtools-drawer`.
>
> The data layer (`enableDevTools()`, the `window.__LOCALMODE_DEVTOOLS__`
> bridge, and all collectors) is unchanged — only the widget UI was removed.

## React Hooks

All hooks ship from `@localmode/devtools/react` (ESM + CJS). The main entry
stays React-free — `react`/`react-dom` remain optional peer dependencies
needed only for the `/react` hooks.

| Hook | Returns | Backing data |
|------|---------|--------------|
| `useDevToolsBridge()` | `DevToolsBridge \| null` | The live bridge object (base hook) |
| `useDevToolsStatus()` | `{ available, enabled }` | Bridge presence + `enabled` flag |
| `useDevToolsQueueStats()` | `Record<string, QueueStats>` | `registerQueue()` stats |
| `useDevToolsEvents(options?)` | `DevToolsEvent[]` | Event buffer; optional `{ types, limit }` filtering |
| `useDevToolsModelCache()` | `Record<string, ModelCacheInfo>` | `modelLoad`/`modelLoadError` events |
| `useDevToolsPipelineRuns()` | `Record<string, PipelineSnapshot>` | `createDevToolsProgressCallback()` |
| `useDevToolsVectorDBs()` | `Record<string, VectorDBSnapshot>` | VectorDB event aggregates |
| `useDevToolsStorage()` | `StorageQuotaSnapshot \| null` | Storage quota poll |
| `useDevToolsCapabilities()` | `DeviceCapabilitiesSnapshot \| null` | One-shot capability detection |

Guarantees:

- **Immutable snapshots** — slice hooks return fresh frozen-in-time copies per
  bridge notification (the bridge mutates its objects in place; snapshots
  never alias them). `useDevToolsBridge()` is the one exception: it returns
  the live bridge object.
- **SSR-safe** — no `window` access during server render; hooks render inert
  values (`null`, empty records/arrays, `{ available: false, enabled: false }`)
  on the server without throwing.
- **Inert when absent, preserved when disabled** — with devtools never
  enabled, hooks return referentially stable frozen inert constants. After
  `disableDevTools()`, `useDevToolsStatus()` reports
  `{ available: true, enabled: false }` and slice hooks keep returning the
  last collected snapshots.
- **Late-enable attachment** — a hook mounted before `enableDevTools()`
  attaches automatically when the bridge appears (package-internal lifecycle
  signal); no remount needed.
- **Clean lifecycle** — subscribe on mount, fully unsubscribe on unmount.

Known limitation: if a *duplicate copy* of `@localmode/devtools` (conflicting
installs resolving to two module instances) created the bridge, the internal
enable signal from the other copy may not reach this copy's hooks immediately;
hooks still attach on the next React re-subscribe since they re-check
`window` on every subscription.

## Headless API

### enableDevTools(options?)

Initialize all collectors and create the `window.__LOCALMODE_DEVTOOLS__` bridge.

```typescript
enableDevTools({
  eventBufferSize: 500,           // Max events in circular buffer (default: 500)
  storagePollingIntervalMs: 5000, // Storage quota poll interval (default: 5000)
});
```

### disableDevTools()

Unsubscribe all collectors, stop polling, preserve last snapshot.

### isDevToolsEnabled()

Returns `true` if DevTools instrumentation is currently active.

### registerQueue(name, queue)

Register an InferenceQueue for live monitoring (the `useDevToolsQueueStats()` hook / the drawer's Queue tab).

```typescript
import { createInferenceQueue } from '@localmode/core';
import { registerQueue } from '@localmode/devtools';

const queue = createInferenceQueue({ concurrency: 1 });
const unsubscribe = registerQueue('embedding', queue);
```

### createDevToolsProgressCallback(name)

Create a pipeline progress callback (surfaced by the `useDevToolsPipelineRuns()` hook / the drawer's Pipeline tab).

```typescript
import { createPipeline } from '@localmode/core';
import { createDevToolsProgressCallback } from '@localmode/devtools';

const pipeline = createPipeline('rag-ingest')
  .step('chunk', chunkFn)
  .step('embed', embedFn)
  .build();

await pipeline.run(input, {
  onProgress: createDevToolsProgressCallback('rag-ingest'),
});
```

## Bridge Data Domains

The bridge collects six data domains — one per `/react` hook (and one per tab
of the composed `ui/blocks/devtools-drawer`):

| Domain | Shows | Hook | Data Source |
|--------|-------|------|-------------|
| Models | Cached models, load times, status | `useDevToolsModelCache()` | `globalEventBus` modelLoad events |
| VectorDB | Collections, adds, searches, deletes | `useDevToolsVectorDBs()` | `globalEventBus` VectorDB events |
| Queue | Pending, active, completed, latency | `useDevToolsQueueStats()` | `queue.on('stats')` |
| Pipeline | Step progress, timing, status | `useDevToolsPipelineRuns()` | `onProgress` callbacks |
| Events | Live event stream with filtering | `useDevToolsEvents()` | `globalEventBus` |
| Device | WebGPU, WASM, ChromeAI capabilities | `useDevToolsCapabilities()` | `detectCapabilities()` |

## Documentation

Full documentation at [localmode.dev/docs/devtools](https://localmode.dev/docs/devtools).

## License

MIT
