/**
 * Screen wake lock read-out for /bench/run. WebKit (Safari on macOS, and
 * every browser on iOS and iPadOS) grants `navigator.wakeLock.request('screen')`
 * only with a user activation, so a series run that resumes after the page's
 * automatic reload is refused there while Chromium and Gecko grant it. On
 * WebKit the page asks again on the next user interaction and says so; in
 * every browser that does not keep the screen on, a series shows how to keep
 * the device awake. Everything here is pure except `retryOnUserActivation`,
 * which only adds and removes listeners on the target it is given.
 */

export type WakeLockStatus = 'idle' | 'held' | 'hidden' | 'unavailable' | 'refused' | 'tap';

/** One status line per state (nothing while idle). */
export const WAKE_LOCK_TEXT: Record<Exclude<WakeLockStatus, 'idle'>, string> = {
  held: 'Screen kept awake',
  hidden: 'Screen wake lock paused while this tab is hidden',
  unavailable: 'Wake lock unavailable in this browser',
  refused: 'The browser refused the screen wake lock; keep the screen on yourself',
  tap: 'Tap anywhere to keep the screen awake',
};

/**
 * True when the page runs on WebKit: Safari on macOS, and every iOS and
 * iPadOS browser (Chrome and Firefox there are WebKit too; they carry
 * `CriOS`/`FxiOS`, never `Chrome/`). Chromium browsers also carry
 * `AppleWebKit/` in their user agent, so a `Chrome/` or `Chromium/` token
 * rules WebKit out.
 */
export function isWebKitUserAgent(userAgent: string): boolean {
  return /AppleWebKit\//.test(userAgent) && !/(?:Chrome|Chromium|HeadlessChrome)\//.test(userAgent);
}

/** Status after a refused request, or a lock the browser ended while the tab is visible. */
export function lockLostStatus(webkit: boolean): 'tap' | 'refused' {
  return webkit ? 'tap' : 'refused';
}

const WEBKIT_HOWTO =
  'iPhone or iPad: Settings, Display & Brightness, Auto-Lock, Never. Mac: run caffeinate -d in Terminal or set the display to never turn off.';
const NEUTRAL_HOWTO = 'Set the display to never turn off, or keep the device awake another way, until the series ends.';
const WHILE_ASLEEP =
  'If the device sleeps, the series waits until it wakes, and steps measured while the page is hidden are set aside.';

/**
 * The notice a running series shows when the screen is not kept awake: the
 * lock was refused (or awaits a tap on WebKit) or the browser has none.
 * Null while the lock is held, paused for a hidden tab, or not requested.
 */
export function wakeLockNotice(status: WakeLockStatus, webkit: boolean): string | null {
  if (status !== 'refused' && status !== 'tap' && status !== 'unavailable') return null;
  const lead =
    status === 'unavailable'
      ? 'This browser has no screen wake lock, so the device may sleep during the series.'
      : 'This browser did not grant a screen wake lock, so the device may sleep during the series.';
  return `${lead} ${webkit ? WEBKIT_HOWTO : NEUTRAL_HOWTO} ${WHILE_ASLEEP}`;
}

/** Input events that can carry a user activation (HTML activation-triggering events, plus click). */
export const ACTIVATION_EVENTS = ['pointerdown', 'pointerup', 'mousedown', 'touchend', 'keydown', 'click'] as const;

/**
 * Call `attempt` inside the handler of each activation-triggering event on
 * `target` (a wake lock request must run while the activation is transient)
 * until one attempt resolves true. Every event attempts, so a touch
 * `pointerdown`, which is no activation, cannot hide the `touchend` that is.
 * Returns a disposer that removes the listeners.
 */
export function retryOnUserActivation(target: EventTarget, attempt: () => Promise<boolean>): () => void {
  let done = false;
  const stop = () => {
    done = true;
    for (const type of ACTIVATION_EVENTS) target.removeEventListener(type, onEvent, true);
  };
  function onEvent() {
    if (done) return;
    attempt().then(
      (granted) => {
        if (granted) stop();
      },
      () => undefined,
    );
  }
  for (const type of ACTIVATION_EVENTS) target.addEventListener(type, onEvent, true);
  return stop;
}
