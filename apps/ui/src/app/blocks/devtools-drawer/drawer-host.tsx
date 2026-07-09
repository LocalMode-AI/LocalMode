'use client';

/**
 * @file drawer-host.tsx
 * @description The SHIPPED devtools drawer host for the
 * `ui/blocks/devtools-drawer` registry item: framework-agnostic React —
 * `React.lazy` + `Suspense` instead of `next/dynamic` — so any React app
 * (Next, Vite, Remix, …) keeps the zero-overhead-when-closed property.
 * The blocks app itself mounts the Next-flavored twin (`host.tsx`, not
 * shipped) in its blocks layout; the two hosts share the same lifecycle.
 *
 * Zero-overhead-when-closed: this module statically imports NOTHING from
 * `@localmode/devtools` or `./devtools-drawer` — the drawer body (and the
 * devtools package with it) sits behind `React.lazy` and a dynamic
 * `import()`, so bundlers code-split it and the chunk loads only when the
 * body first renders (first open) or when the persisted flag re-enables
 * collectors on reload.
 *
 * Lifecycle: first open calls `enableDevTools()` (via the drawer body's
 * mount effect) and persists the enabled flag; close hides the drawer while
 * collectors keep running; the in-drawer power-off control runs
 * `disableDevTools()` and returns this host to the never-opened state
 * (body fully unmounted, persistence cleared).
 *
 * Persistence: `localmode:devtools-enabled` in localStorage — a reload
 * re-runs `enableDevTools()` immediately WITHOUT auto-opening the panel.
 */

import * as React from 'react';
import { Activity } from 'lucide-react';

/** localStorage key for the persisted enabled state. */
const STORAGE_KEY = 'localmode:devtools-enabled';

/** Lazy drawer body — bundler-code-split; loads on first render only. */
const DevToolsDrawer = React.lazy(() =>
  import('./devtools-drawer').then((m) => ({ default: m.DevToolsDrawer })),
);

/**
 * Floating devtools toggle + lazily mounted observability drawer. Mount once
 * near the root of your app (it renders a fixed-position button and panel).
 *
 * @example
 * ```tsx
 * import { DevToolsDrawerHost } from '@/components/blocks/devtools-drawer/drawer-host';
 *
 * export function App({ children }) {
 *   return (
 *     <>
 *       {children}
 *       <DevToolsDrawerHost />
 *     </>
 *   );
 * }
 * ```
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
        className={
          open
            ? 'fixed bottom-4 right-4 z-[60] inline-flex size-10 items-center justify-center rounded-full border border-border bg-muted text-foreground shadow-lg transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'
            : 'fixed bottom-4 right-4 z-[60] inline-flex size-10 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-lg transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'
        }
      >
        <Activity className="size-5" aria-hidden="true" />
      </button>
      {everOpened && (
        <React.Suspense fallback={null}>
          <DevToolsDrawer open={open} onOpenChange={setOpen} onPowerOff={handlePowerOff} />
        </React.Suspense>
      )}
    </>
  );
}
