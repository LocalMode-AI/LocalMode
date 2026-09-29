/**
 * The /bench/run screen wake lock read-out. WebKit (Safari on macOS, every
 * browser on iOS and iPadOS) grants `navigator.wakeLock.request('screen')`
 * only with a user activation, so a series run that resumes after its
 * automatic reload is refused there while Chromium and Gecko grant it. The
 * page then asks for one tap, and tells the participant how to keep the
 * device awake. The engine detection, the status line and the notice are
 * pure and tested here; the retry listener is tested against a real
 * EventTarget with a lock that, like WebKit's, grants only during the handler.
 */
import { describe, expect, it } from 'vitest';
import {
  WAKE_LOCK_TEXT,
  isWebKitUserAgent,
  lockLostStatus,
  retryOnUserActivation,
  wakeLockNotice,
} from '../src/lib/bench/wake-lock';

const UA = {
  // Recorded from Safari 26.3 on this repository's Mac mini (2026-09-29).
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.3 Safari/605.1.15',
  safariIPhone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1',
  chromeIOS:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/153.0.8010.52 Mobile/15E148 Safari/604.1',
  firefoxIOS:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/156.0 Mobile/15E148 Safari/605.1.15',
  // Recorded from Chrome for Testing 145 on the same Mac (2026-09-29).
  chromeMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36',
  edgeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0',
  firefoxMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:156.0) Gecko/20100101 Firefox/156.0',
};

describe('isWebKitUserAgent', () => {
  it('is true for Safari on macOS and for every iOS browser (all WebKit)', () => {
    expect(isWebKitUserAgent(UA.safariMac)).toBe(true);
    expect(isWebKitUserAgent(UA.safariIPhone)).toBe(true);
    expect(isWebKitUserAgent(UA.chromeIOS)).toBe(true);
    expect(isWebKitUserAgent(UA.firefoxIOS)).toBe(true);
  });

  it('is false for Chromium and Gecko browsers', () => {
    expect(isWebKitUserAgent(UA.chromeMac)).toBe(false);
    expect(isWebKitUserAgent(UA.chromeAndroid)).toBe(false);
    expect(isWebKitUserAgent(UA.edgeWindows)).toBe(false);
    expect(isWebKitUserAgent(UA.firefoxMac)).toBe(false);
    expect(isWebKitUserAgent('')).toBe(false);
  });
});

describe('lockLostStatus', () => {
  it('asks for a tap on WebKit, where an interaction can grant the lock, and reports a refusal elsewhere', () => {
    expect(lockLostStatus(true)).toBe('tap');
    expect(lockLostStatus(false)).toBe('refused');
    expect(WAKE_LOCK_TEXT.tap).toBe('Tap anywhere to keep the screen awake');
    expect(WAKE_LOCK_TEXT.held).toBe('Screen kept awake');
  });
});

describe('wakeLockNotice', () => {
  const WEBKIT_HOWTO =
    'iPhone or iPad: Settings, Display & Brightness, Auto-Lock, Never. Mac: run caffeinate -d in Terminal or set the display to never turn off.';

  it('shows nothing while the lock is held, idle, or paused for a hidden tab', () => {
    for (const status of ['held', 'idle', 'hidden'] as const) {
      expect(wakeLockNotice(status, true)).toBeNull();
      expect(wakeLockNotice(status, false)).toBeNull();
    }
  });

  it('gives the iPhone, iPad and Mac instructions on WebKit when the lock was refused or awaits a tap', () => {
    for (const status of ['tap', 'refused'] as const) {
      const notice = wakeLockNotice(status, true);
      expect(notice).toBe(
        `This browser did not grant a screen wake lock, so the device may sleep during the series. ${WEBKIT_HOWTO} If the device sleeps, the series waits until it wakes, and steps measured while the page is hidden are set aside.`,
      );
    }
  });

  it('gives device-neutral instructions elsewhere', () => {
    expect(wakeLockNotice('refused', false)).toBe(
      'This browser did not grant a screen wake lock, so the device may sleep during the series. Set the display to never turn off, or keep the device awake another way, until the series ends. If the device sleeps, the series waits until it wakes, and steps measured while the page is hidden are set aside.',
    );
  });

  it('says the browser has no wake lock when the API is missing', () => {
    expect(wakeLockNotice('unavailable', true)).toBe(
      `This browser has no screen wake lock, so the device may sleep during the series. ${WEBKIT_HOWTO} If the device sleeps, the series waits until it wakes, and steps measured while the page is hidden are set aside.`,
    );
    expect(wakeLockNotice('unavailable', false)?.startsWith('This browser has no screen wake lock')).toBe(true);
  });
});

describe('retryOnUserActivation', () => {
  /** A WebKit-like request: granted only while an activation is in progress. */
  function webkitLike() {
    let activated = false;
    const calls: string[] = [];
    const attempt = (): Promise<boolean> => {
      calls.push(activated ? 'activated' : 'plain');
      return Promise.resolve(activated);
    };
    const fire = (target: EventTarget, type: string, activation: boolean) => {
      activated = activation;
      target.dispatchEvent(new Event(type));
      activated = false;
    };
    return { attempt, calls, fire };
  }
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('attempts inside the handler and stops after the first grant', async () => {
    const target = new EventTarget();
    const lock = webkitLike();
    retryOnUserActivation(target, lock.attempt);
    lock.fire(target, 'pointerdown', false);
    await flush();
    lock.fire(target, 'touchend', true);
    await flush();
    lock.fire(target, 'keydown', true);
    await flush();
    expect(lock.calls).toEqual(['plain', 'activated']);
  });

  it('listens to keyboard and pointer activation events', async () => {
    for (const type of ['pointerdown', 'pointerup', 'mousedown', 'touchend', 'keydown', 'click']) {
      const target = new EventTarget();
      const lock = webkitLike();
      retryOnUserActivation(target, lock.attempt);
      lock.fire(target, type, true);
      await flush();
      expect(lock.calls, type).toEqual(['activated']);
    }
  });

  it('stops listening when disposed', async () => {
    const target = new EventTarget();
    const lock = webkitLike();
    const dispose = retryOnUserActivation(target, lock.attempt);
    dispose();
    lock.fire(target, 'click', true);
    await flush();
    expect(lock.calls).toEqual([]);
  });
});
