/**
 * Gemini Nano download flow for the bench: the Run click starts Chrome's
 * one-time download (user activation), the chrome-ai lane waits for it, and
 * a device with the model merely "downloadable" runs the lane like any other.
 * The real download needs Chrome 148+ with Gemini Nano; these tests drive the
 * module and the adapter against a fake `LanguageModel` global, so the real
 * browser path stays on the manual real-Chrome sweep.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ProgressEvent = Event & { loaded: number; total: number };

function installFakePromptApi(state: { availability: string; createDelayMs?: number; failCreate?: boolean }) {
  let monitorTarget: EventTarget | null = null;
  const destroyed: number[] = [];
  const fake = {
    calls: { availability: 0, create: 0 },
    async availability() {
      fake.calls.availability += 1;
      return state.availability;
    },
    async create(options?: { monitor?: (m: EventTarget) => void }) {
      fake.calls.create += 1;
      monitorTarget = new EventTarget();
      options?.monitor?.(monitorTarget);
      if (state.failCreate) throw Object.assign(new Error('Requires a user gesture'), { name: 'NotAllowedError' });
      await new Promise((r) => setTimeout(r, state.createDelayMs ?? 5));
      state.availability = 'available';
      return { destroy: () => destroyed.push(Date.now()) };
    },
    progress(loaded: number, total = 1) {
      const evt = new Event('downloadprogress') as ProgressEvent;
      evt.loaded = loaded;
      evt.total = total;
      monitorTarget?.dispatchEvent(evt);
    },
    destroyed,
  };
  (globalThis as { LanguageModel?: unknown }).LanguageModel = fake;
  (globalThis as { self?: unknown }).self = globalThis;
  return fake;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  delete (globalThis as { LanguageModel?: unknown }).LanguageModel;
});

describe('chrome-ai-download', () => {
  it('reports the Prompt API state and treats a missing global as unsupported', async () => {
    const mod = await import('../src/lib/bench/chrome-ai-download');
    expect(await mod.chromeAIStatus()).toBe('unsupported');
    installFakePromptApi({ availability: 'downloadable' });
    expect(await mod.chromeAIStatus()).toBe('downloadable');
  });

  it('starts one download, maps progress to percent, resolves when Chrome is done, and releases the trigger session', async () => {
    const fake = installFakePromptApi({ availability: 'downloadable', createDelayMs: 20 });
    const mod = await import('../src/lib/bench/chrome-ai-download');
    const seen: number[] = [];
    mod.onChromeAIDownloadProgress((pct) => seen.push(pct));

    const first = mod.startChromeAIDownload();
    const again = mod.startChromeAIDownload();
    expect(first).not.toBeNull();
    expect(again).toBe(first);
    expect(fake.calls.create).toBe(1);
    expect(mod.chromeAIDownloadInFlight()).toBe(first);

    fake.progress(0.25);
    fake.progress(0.5, 1);
    expect(mod.chromeAIDownloadPct()).toBe(50);
    await first;
    expect(seen).toEqual([25, 50, 100]);
    expect(fake.destroyed).toHaveLength(1);
    expect(await mod.chromeAIStatus()).toBe('available');
  });

  it('surfaces a refused download through the promise and allows a retry', async () => {
    const fake = installFakePromptApi({ availability: 'downloadable', failCreate: true });
    const mod = await import('../src/lib/bench/chrome-ai-download');
    const p = mod.startChromeAIDownload();
    await expect(p).rejects.toMatchObject({ name: 'NotAllowedError' });
    // The failed attempt is cleared so a later click can try again.
    expect(mod.chromeAIDownloadInFlight()).toBeNull();
    expect(fake.calls.create).toBe(1);
  });
});

describe('chrome-ai bench adapter', () => {
  async function adapter() {
    const { createLLMAdapters } = await import('../src/lib/bench/adapters');
    return createLLMAdapters().get('chrome-ai')!;
  }

  it('is available when Gemini Nano is ready, and when a download the click started is in flight', async () => {
    const fake = installFakePromptApi({ availability: 'downloadable', createDelayMs: 20 });
    const download = await import('../src/lib/bench/chrome-ai-download');
    const lane = await adapter();
    // Downloadable but nothing started: only a click can start it.
    expect(await lane.isAvailable()).toEqual({
      ok: false,
      reason: 'Gemini Nano needs a download that only a click can start',
    });
    expect(await lane.isModelCached({} as never)).toBe(false);

    const p = download.startChromeAIDownload();
    expect(await lane.isAvailable()).toEqual({ ok: true });
    await p;
    expect(fake.calls.create).toBe(1);
    expect(await lane.isModelCached({} as never)).toBe(true);
    expect(await lane.isAvailable()).toEqual({ ok: true });
  });

  it('waits for the in-flight download in load() and forwards its progress', async () => {
    const fake = installFakePromptApi({ availability: 'downloadable', createDelayMs: 30 });
    const download = await import('../src/lib/bench/chrome-ai-download');
    const lane = await adapter();
    const started = download.startChromeAIDownload()!;
    const pcts: Array<number | undefined> = [];
    let resolvedBeforeDownload = true;
    started.then(() => {
      resolvedBeforeDownload = false;
    });
    const loading = lane.load({} as never, { onProgress: (p) => pcts.push(p.pct) });
    fake.progress(0.4);
    const loaded = await loading;
    expect(resolvedBeforeDownload, 'load() must not resolve before the download').toBe(false);
    expect(pcts).toEqual([0, 40, 100]);
    expect(loaded.resolvedBackend).toBe('chrome-builtin');
    await loaded.dispose();
  });

  it('reports the unavailable and unsupported states honestly', async () => {
    installFakePromptApi({ availability: 'unavailable' });
    const lane = await adapter();
    expect(await lane.isAvailable()).toEqual({ ok: false, reason: 'Gemini Nano not ready (unavailable)' });
  });
});
