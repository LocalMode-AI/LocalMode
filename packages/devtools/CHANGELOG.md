# @localmode/devtools

## 3.0.0

### Added

- **`@localmode/devtools/react` subpath** — 9 React hooks over the bridge snapshots: `useDevToolsBridge`, `useDevToolsStatus`, `useDevToolsQueueStats`, `useDevToolsEvents` (with `{ types, limit }` filtering), `useDevToolsModelCache`, `useDevToolsPipelineRuns`, `useDevToolsVectorDBs`, `useDevToolsStorage`, `useDevToolsCapabilities`. Built on `useSyncExternalStore` with version-keyed immutable snapshots, SSR-safe inert values, preserved snapshots after `disableDevTools()`, and late-enable attachment.

### Removed

- **The `DevToolsWidget` UI and the `@localmode/devtools/widget` subpath export.** The prebuilt floating overlay and its source files are gone; the `/react` hooks and the `ui/devtools` registry family replace it.

### Breaking Changes

- `import { DevToolsWidget } from '@localmode/devtools/widget'` no longer resolves. Migrate to the replacements shipped at [localmode.ai](https://localmode.ai): the `/react` hooks, the copy-owned `ui/devtools` registry family (`npx shadcn add @localmode/ui/devtools`), or the composed six-tab `ui/blocks/devtools-drawer` (`npx shadcn add @localmode/ui/blocks/devtools-drawer`).

### Backward Compatibility

- The data layer is unchanged — `enableDevTools()`, `disableDevTools()`, `isDevToolsEnabled()`, `registerQueue()`, `createDevToolsProgressCallback()`, the `window.__LOCALMODE_DEVTOOLS__` bridge, and all collectors behave exactly as before; only the widget UI was removed. The main entry stays React-free, with `react`/`react-dom` optional peers used only by the `/react` hooks.

## 2.0.1

### Patch Changes

- Responsive panel width for smaller viewports
- Scrollable tab bar when panels overflow
- TypeScript type fix for event bridge collector

## 2.0.0

### Major Changes

- New package: In-app DevTools widget for real-time AI observability
- 6 panels: models, inference queue, pipeline, events, VectorDB, and device capabilities
- Event bridge with collectors for storage, pipeline, queue, and capabilities instrumentation

### Patch Changes

- Updated dependencies
  - @localmode/core@2.0.0
