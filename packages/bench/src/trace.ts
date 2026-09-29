/**
 * Suite-level trace recorder: validity-relevant events (tab visibility, wake
 * lock, compute pressure, GPU device loss, aborts) with wall-clock timestamps.
 * Iterations that overlap a hidden period are invalidated, never retried
 * silently — the trace is part of the submitted, auditable record.
 */

import type { TraceEvent } from './types.js';
import { hrNow } from './timing.js';

type PressureRecord = { state: string };
interface PressureObserverLike {
  observe(source: string, options?: { sampleInterval?: number }): Promise<void> | void;
  disconnect(): void;
}

interface WakeLockSentinelLike {
  release(): Promise<void>;
  addEventListener(type: 'release', cb: () => void): void;
}

/** Events that can carry a user activation (HTML activation-triggering input events). */
const ACTIVATION_EVENTS = ['pointerdown', 'pointerup', 'mousedown', 'touchend', 'keydown', 'click'] as const;

/** Records trace events and tracks the current validity-gate state. */
export class TraceRecorder {
  private readonly events: TraceEvent[] = [];
  private disposers: Array<() => void> = [];
  private hidden = false;
  private lastPressureState: string | undefined;
  private wakeLockSentinel: WakeLockSentinelLike | null = null;

  /** Append an event at the current timestamp. */
  record(type: TraceEvent['type'], detail?: string): void {
    this.events.push({ t: hrNow(), type, ...(detail !== undefined ? { detail } : {}) });
  }

  /** True while the page is hidden (timed regions overlapping this are invalid). */
  get isHidden(): boolean {
    return this.hidden;
  }

  /** Last observed compute-pressure state ('nominal'|'fair'|'serious'|'critical'). */
  get pressureState(): string | undefined {
    return this.lastPressureState;
  }

  /** All recorded events (live reference; snapshot with `[...events]`). */
  get all(): readonly TraceEvent[] {
    return this.events;
  }

  /**
   * Attach browser listeners (visibility, compute pressure) and request a
   * screen wake lock. Safe to call outside a browser (records nothing).
   */
  async attach(): Promise<void> {
    if (typeof document !== 'undefined') {
      const onVisibility = () => {
        this.hidden = document.visibilityState === 'hidden';
        this.record(this.hidden ? 'visibility-hidden' : 'visibility-visible');
      };
      document.addEventListener('visibilitychange', onVisibility);
      this.disposers.push(() => document.removeEventListener('visibilitychange', onVisibility));
      this.hidden = document.visibilityState === 'hidden';
    }

    const PressureObserverCtor = (
      globalThis as { PressureObserver?: new (cb: (records: PressureRecord[]) => void) => PressureObserverLike }
    ).PressureObserver;
    if (PressureObserverCtor) {
      try {
        const observer = new PressureObserverCtor((records) => {
          const last = records[records.length - 1];
          if (last) {
            // The observer samples every second; only transitions are events.
            const changed = last.state !== this.lastPressureState;
            this.lastPressureState = last.state;
            if (changed) this.record('pressure-change', last.state);
          }
        });
        await observer.observe('cpu', { sampleInterval: 1_000 });
        this.disposers.push(() => observer.disconnect());
      } catch {
        // Pressure observation is best-effort context, never a failure.
      }
    }

    const wakeLock = typeof navigator !== 'undefined'
      ? (navigator as { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> } }).wakeLock
      : undefined;
    if (wakeLock) {
      try {
        this.holdWakeLock(await wakeLock.request('screen'));
      } catch (error) {
        // WebKit grants the lock only with a user activation, so a run that
        // starts without one (a series run after its reload) is denied there.
        // The denial is recorded, and the next user interaction asks again.
        this.record('wakelock-denied', (error as { name?: string })?.name || 'Error');
        this.retryWakeLockOnActivation(wakeLock);
      }
    }
  }

  private holdWakeLock(sentinel: WakeLockSentinelLike, detail?: string): void {
    this.wakeLockSentinel = sentinel;
    this.record('wakelock-acquired', detail);
    sentinel.addEventListener('release', () => {
      this.record('wakelock-released');
      if (this.wakeLockSentinel === sentinel) this.wakeLockSentinel = null;
    });
  }

  /**
   * Request the lock again inside the handler of each activation-triggering
   * event (the request must run while the activation is transient) until one
   * is granted. Every attempt runs, so a touch `pointerdown` that is no
   * activation cannot hide the `touchend` that is.
   */
  private retryWakeLockOnActivation(wakeLock: { request(type: 'screen'): Promise<WakeLockSentinelLike> }): void {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    let done = false;
    const stop = () => {
      done = true;
      for (const type of ACTIVATION_EVENTS) window.removeEventListener(type, onInteraction, true);
    };
    const onInteraction = () => {
      if (done) return;
      let pending: Promise<WakeLockSentinelLike>;
      try {
        pending = wakeLock.request('screen');
      } catch {
        return;
      }
      pending.then(
        (sentinel) => {
          if (done || this.wakeLockSentinel) {
            void sentinel.release().catch(() => undefined);
            return;
          }
          stop();
          this.holdWakeLock(sentinel, 'user-activation');
        },
        () => {
          // Not an activation (or still refused): keep listening.
        },
      );
    };
    for (const type of ACTIVATION_EVENTS) window.addEventListener(type, onInteraction, true);
    this.disposers.push(stop);
  }

  /** Release listeners and the wake lock. */
  async dispose(): Promise<void> {
    for (const dispose of this.disposers) dispose();
    this.disposers = [];
    if (this.wakeLockSentinel) {
      try {
        await this.wakeLockSentinel.release();
      } catch {
        // Already released.
      }
      this.wakeLockSentinel = null;
    }
  }
}
