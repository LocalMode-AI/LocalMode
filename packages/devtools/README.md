# @localmode/devtools

[![npm](https://img.shields.io/npm/v/@localmode/devtools)](https://www.npmjs.com/package/@localmode/devtools)
[![license](https://img.shields.io/npm/l/@localmode/devtools)](../../LICENSE)

[![Docs](https://img.shields.io/badge/Docs-LocalMode.dev-red)](https://localmode.dev/docs/devtools)
[![Demo](https://img.shields.io/badge/Demo-LocalMode.ai-purple)](https://localmode.ai)

In-app DevTools widget for debugging and monitoring [LocalMode](https://localmode.dev) applications. See model cache, VectorDB stats, inference queue metrics, pipeline traces, and live event streams — all without any telemetry. Works in any browser.

## Installation

```bash
pnpm add -D @localmode/devtools
```

## Quick Start

### Widget (recommended)

```tsx
import { DevToolsWidget } from '@localmode/devtools/widget';

// In your app layout
export default function Layout({ children }) {
  return (
    <>
      {children}
      {process.env.NODE_ENV === 'development' && <DevToolsWidget />}
    </>
  );
}
```

A floating "DEV" button appears — click to expand the DevTools panel with 6 tabs.

### Headless (no UI)

```typescript
import { enableDevTools } from '@localmode/devtools';

if (process.env.NODE_ENV === 'development') {
  enableDevTools();
}
```

## Widget Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `position` | `'bottom-right' \| 'bottom-left' \| 'top-right' \| 'top-left'` | `'bottom-right'` | Floating button position |
| `defaultOpen` | `boolean` | `false` | Start with panel open |
| `autoEnable` | `boolean` | `true` | Auto-call `enableDevTools()` |
| `panelHeight` | `number` | `400` | Panel height (px) |
| `zIndex` | `number` | `99999` | Widget z-index |

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

Register an InferenceQueue for live monitoring in the Queue tab.

```typescript
import { createInferenceQueue } from '@localmode/core';
import { registerQueue } from '@localmode/devtools';

const queue = createInferenceQueue({ concurrency: 1 });
const unsubscribe = registerQueue('embedding', queue);
```

### createDevToolsProgressCallback(name)

Create a pipeline progress callback for the Pipeline tab.

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

## Panel Tabs

| Tab | Shows | Data Source |
|-----|-------|-------------|
| Models | Cached models, load times, status | `globalEventBus` modelLoad events |
| VectorDB | Collections, adds, searches, deletes | `globalEventBus` VectorDB events |
| Queue | Pending, active, completed, latency | `queue.on('stats')` |
| Pipeline | Step progress, timing, status | `onProgress` callbacks |
| Events | Live event stream with filtering | `globalEventBus` |
| Device | WebGPU, WASM, ChromeAI capabilities | `detectCapabilities()` |

## Documentation

Full documentation at [localmode.dev/docs/devtools](https://localmode.dev/docs/devtools).

## License

MIT
