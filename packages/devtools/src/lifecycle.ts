/**
 * Package-internal bridge-lifecycle signal.
 *
 * Lets React hooks (the `./react` entry) learn that `enableDevTools()` /
 * `disableDevTools()` ran even when the hook mounted before the bridge
 * existed (late-enable attachment, design D4).
 *
 * The listener set is stored on `globalThis` under a well-known key rather
 * than as plain module state: each package entry (`.`, `./react`)
 * is bundled separately, so module state would be duplicated per bundle and
 * the signal emitted by `enableDevTools()` (main entry) would never reach
 * hooks (react entry). `globalThis` exists in every supported environment
 * (browser, worker, Node SSR), so this stays SSR-safe — no `window` access.
 *
 * This is NOT a public API: nothing here is exported from any package entry.
 * Known limitation (documented in the README): if a *different copy* of the
 * package (duplicate module instances from conflicting installs) created the
 * bridge before this copy loaded, both copies still share this global key, so
 * the signal works; only a copy that predates this mechanism would miss it —
 * hooks still attach on the next React re-subscribe since `subscribe`
 * re-checks `window`.
 *
 * @packageDocumentation
 */

/** Well-known global key holding the shared lifecycle listener set. */
const LIFECYCLE_KEY = '__LOCALMODE_DEVTOOLS_LIFECYCLE__';

/** The shared listener set type. */
type LifecycleListenerSet = Set<() => void>;

/** Host object shape for the global registry key. */
interface LifecycleHost {
  [LIFECYCLE_KEY]?: LifecycleListenerSet;
}

/**
 * Get (optionally creating) the shared listener set on `globalThis`.
 *
 * @param create - Create the set if it does not exist yet
 * @returns The shared listener set, or `undefined` when absent and not created
 */
function getListenerSet(create: boolean): LifecycleListenerSet | undefined {
  const host = globalThis as unknown as LifecycleHost;
  if (!host[LIFECYCLE_KEY] && create) {
    host[LIFECYCLE_KEY] = new Set();
  }
  return host[LIFECYCLE_KEY];
}

/**
 * Register a listener for bridge lifecycle transitions
 * (`enableDevTools()` created a bridge / `disableDevTools()` disabled it).
 *
 * @param listener - Callback invoked after each lifecycle transition
 * @returns Unsubscribe function
 * @internal
 */
export function onBridgeLifecycle(listener: () => void): () => void {
  const listeners = getListenerSet(true);
  /* istanbul ignore next -- getListenerSet(true) always returns a set */
  if (!listeners) return () => {};
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Notify all lifecycle listeners. Called by `enableDevTools()` after the
 * bridge is attached to `window`, and by `disableDevTools()` after the
 * bridge's `enabled` flag is flipped.
 *
 * Listener errors are swallowed so a faulty subscriber can never break
 * enable/disable.
 *
 * @internal
 */
export function signalBridgeLifecycle(): void {
  const listeners = getListenerSet(false);
  if (!listeners) return;
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      /* ignore listener errors */
    }
  }
}
