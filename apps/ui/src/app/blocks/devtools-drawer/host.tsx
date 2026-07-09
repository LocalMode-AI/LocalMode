'use client';

/**
 * @file host.tsx
 * @description Blocks-app (Next-flavored) devtools host, mounted once in
 * `src/app/blocks/layout.tsx`: a floating toggle button plus the lazily
 * loaded drawer body. NOT part of the `ui/blocks/devtools-drawer` registry
 * item — consumers get the framework-agnostic `drawer-host.tsx` twin instead.
 *
 * Zero-overhead-when-closed: this module statically imports NOTHING
 * from `@localmode/devtools` or `./devtools-drawer` — the drawer body (and
 * the devtools package with it) sits behind `next/dynamic` (`ssr: false`)
 * and a dynamic `import()`, so its chunk is requested only when the body
 * first renders (first open) or when the persisted flag re-enables
 * collectors on reload. Until then the layout ships only this button.
 * Nothing in this module graph can pull devtools in eagerly because the only
 * references are dynamic `import()` expressions; the committed Playwright
 * drawer/platform specs assert the built chunk graph keeps devtools out of
 * the initial page JS.
 *
 * Instrumentation note: no current block
 * creates an InferenceQueue or Pipeline (`grep -r "createInferenceQueue\|createPipeline"
 * src/app/blocks/` is empty), so there is nothing to wrap in
 * `registerQueue()` / `createDevToolsProgressCallback()` today. Capabilities
 * and storage populate automatically from their samplers once
 * `enableDevTools()` runs; the Models / Events / VectorDB surfaces are fed
 * ONLY by `globalEventBus` events — and no `@localmode/*` package emits the
 * `modelLoad`/`embedStart`/vectordb events itself (the names exist in core's
 * typed event map; emission is the app/wiring layer's job — verified
 * 2026-07-03). The chat block therefore emits `modelLoad`/`modelLoadError`
 * around its `useModelLoad` lifecycle (chat.tsx ChatModel); future blocks
 * that load models or run VectorDB ops should emit the corresponding bus
 * events the same way. The Queue and Pipeline tabs honestly show their empty
 * states (which point at the two registration APIs) until a future block
 * registers. `registerQueue()`/`createDevToolsProgressCallback()` are already
 * no-op-safe when devtools is disabled (they return no-op cleanups/callbacks
 * when the bridge is absent — verified in packages/devtools/src/index.ts),
 * and bus emissions with no subscribers are inherently free — but future
 * blocks should still guard heavier wiring with `isDevToolsEnabled()`.
 *
 * Persistence: `localmode-blocks:devtools-enabled` in localStorage. When
 * set, a reload re-runs `enableDevTools()` immediately (so activity from
 * page load onward is captured) WITHOUT auto-opening the panel; the drawer
 * UI still loads only on demand.
 *
 * Driver contract (accessibility): the floating toggle is a `<button>` whose
 * accessible name is its `aria-label` ("Open/Close LocalMode DevTools") — no
 * test-id attribute. E2E selects it via `getByRole('button', { name:
 * /LocalMode DevTools/ })`.
 */

import * as React from 'react';
import dynamic from 'next/dynamic';
import { Activity } from 'lucide-react';

/** localStorage key for the persisted enabled state (task-pinned name). */
const STORAGE_KEY = 'localmode-blocks:devtools-enabled';

/** Lazy drawer body — the chunk loads on first render (first open) only. */
const DevToolsDrawer = dynamic(
  () => import('./devtools-drawer').then((m) => ({ default: m.DevToolsDrawer })),
  { ssr: false },
);

/**
 * Floating devtools toggle + lazily mounted drawer for every `/blocks` page.
 * Renders in the blocks layout so present and future blocks are observable
 * without per-block wiring.
 */
export function DevToolsDrawerHost() {
  const [open, setOpen] = React.useState(false);
  const [everOpened, setEverOpened] = React.useState(false);

  // Reload persistence: re-enable the collectors (not the UI) when a prior
  // session turned devtools on, so activity from page load onward is captured.
  React.useEffect(() => {
    let cancelled = false;
    let persisted = false;
    try {
      persisted = window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      // localStorage unavailable (private browsing) — devtools won't persist.
    }
    if (!persisted) return;
    void import('@localmode/devtools').then((m) => {
      if (!cancelled) m.enableDevTools();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggle = () => {
    if (!everOpened) {
      setEverOpened(true);
      try {
        window.localStorage.setItem(STORAGE_KEY, '1');
      } catch {
        // Non-fatal: the session still works, it just won't survive a reload.
      }
      setOpen(true);
      return;
    }
    setOpen((o) => !o);
  };

  // The drawer body already ran disableDevTools(); return to the
  // never-opened state (body fully unmounted, persistence cleared).
  const handlePowerOff = () => {
    setOpen(false);
    setEverOpened(false);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore — nothing was persisted anyway.
    }
  };

  return (
    <>
      {/* z-[60] keeps the toggle above the z-50 drawer so it can close it. */}
      <button
        type="button"
        onClick={handleToggle}
        aria-label={open ? 'Close LocalMode DevTools' : 'Open LocalMode DevTools'}
        title="LocalMode DevTools"
        // Safe-area insets keep the toggle clear of notches / rounded corners on
        // mobile so it never floats onto system chrome (block <main>s reserve
        // matching bottom padding so it never covers the last interactive row).
        style={{
          bottom: 'calc(1rem + env(safe-area-inset-bottom))',
          right: 'calc(1rem + env(safe-area-inset-right))',
        }}
        className={
          open
            ? 'fixed z-[60] inline-flex size-10 items-center justify-center rounded-full border border-border bg-muted text-foreground shadow-lg transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'
            : 'fixed z-[60] inline-flex size-10 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-lg transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'
        }
      >
        <Activity className="size-5" aria-hidden="true" />
      </button>
      {everOpened && (
        <DevToolsDrawer open={open} onOpenChange={setOpen} onPowerOff={handlePowerOff} />
      )}
    </>
  );
}
