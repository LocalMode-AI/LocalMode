// @vitest-environment jsdom
/**
 * @file equivalence-use-webcam.test.ts
 * @description Group-10 equivalence gate (blocks-shared-promotions, task 10.2)
 * for the promoted `ui/media-vision/use-webcam` registry hook. It was promoted
 * verbatim from `vision-lab/use-webcam.ts` (born clean — only the file header
 * changed), so both are driven through the SAME real state machine here:
 * start() acquires a stream, a second start() is a no-op, stop() + unmount
 * release every track, and a getUserMedia rejection surfaces as a recoverable
 * permission/hardware error rather than a throw.
 *
 * The camera boundary — `navigator.mediaDevices.getUserMedia` — is stubbed in
 * jsdom (the layer BELOW the hook). The real-hardware camera path is a
 * documented gap closed by the vision E2E + the manual real-hardware sweep.
 *
 * 2026-07-04 (split-vision-lab): the block-local `vision-lab/use-webcam` copy
 * was DISSOLVED — the promoted registry hook is now the single source consumed
 * by the vision blocks, so the dual-variant comparison collapsed to the
 * promoted hook alone (same scenarios, same assertions).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, createElement } from 'react';

import { mount } from './_equivalence-dom';
import { useWebcam } from '../registry/localmode/media-vision/use-webcam/use-webcam';

type WebcamApi = ReturnType<typeof useWebcam>;

interface FakeTrack {
  stop: ReturnType<typeof vi.fn>;
}

/** Install a getUserMedia that resolves a fake 2-track stream; returns the spy + tracks. */
function stubGetUserMedia() {
  const tracks: FakeTrack[] = [{ stop: vi.fn() }, { stop: vi.fn() }];
  const stream = { getTracks: () => tracks } as unknown as MediaStream;
  const getUserMedia = vi.fn(async () => stream);
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true,
  });
  return { getUserMedia, tracks, stream };
}

function removeMediaDevices() {
  Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
}

/** Mount a probe that re-exposes the hook's latest return via a holder. */
async function mountHook(useHook: (opts?: { width?: number; height?: number }) => WebcamApi, options?: { width?: number; height?: number }) {
  const holder: { api: WebcamApi } = { api: undefined as unknown as WebcamApi };
  function Probe() {
    holder.api = useHook(options);
    return null;
  }
  const m = await mount(createElement(Probe));
  return { holder, m };
}

afterEach(() => {
  vi.restoreAllMocks();
});

async function assertStartStopLifecycle(
  useHook: (opts?: { width?: number; height?: number }) => WebcamApi,
) {
  const { getUserMedia, tracks, stream } = stubGetUserMedia();
  const { holder, m } = await mountHook(useHook, { width: 640, height: 480 });

  // Idle.
  expect(holder.api.isActive).toBe(false);
  expect(holder.api.stream).toBeNull();
  expect(holder.api.error).toBeNull();

  // start() acquires the stream with the requested constraints.
  await act(async () => {
    await holder.api.start();
  });
  expect(getUserMedia).toHaveBeenCalledTimes(1);
  expect(getUserMedia).toHaveBeenCalledWith({
    video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
    audio: false,
  });
  expect(holder.api.stream).toBe(stream);
  expect(holder.api.isActive).toBe(true);
  expect(holder.api.error).toBeNull();

  // A second start() is a no-op — the guarded ref returns the live stream, no new acquire.
  await act(async () => {
    await holder.api.start();
  });
  expect(getUserMedia).toHaveBeenCalledTimes(1);

  // stop() releases every track and clears the stream.
  await act(async () => {
    holder.api.stop();
  });
  expect(tracks[0].stop).toHaveBeenCalledTimes(1);
  expect(tracks[1].stop).toHaveBeenCalledTimes(1);
  expect(holder.api.stream).toBeNull();
  expect(holder.api.isActive).toBe(false);

  await m.unmount();
}

async function assertUnmountReleasesCamera(
  useHook: (opts?: { width?: number; height?: number }) => WebcamApi,
) {
  const { tracks } = stubGetUserMedia();
  const { holder, m } = await mountHook(useHook);
  await act(async () => {
    await holder.api.start();
  });
  // Unmounting the owning surface must turn the camera light off.
  await m.unmount();
  expect(tracks[0].stop).toHaveBeenCalledTimes(1);
  expect(tracks[1].stop).toHaveBeenCalledTimes(1);
}

async function assertPermissionError(
  useHook: (opts?: { width?: number; height?: number }) => WebcamApi,
) {
  const getUserMedia = vi.fn(async () => {
    throw new DOMException('denied', 'NotAllowedError');
  });
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true,
  });
  const { holder, m } = await mountHook(useHook);
  let returned: MediaStream | null = {} as MediaStream;
  await act(async () => {
    returned = await holder.api.start();
  });
  // No throw — a recoverable permission error is surfaced instead.
  expect(returned).toBeNull();
  expect(holder.api.error).not.toBeNull();
  expect(holder.api.error?.kind).toBe('permission');
  expect(holder.api.isActive).toBe(false);

  // clearError() dismisses it (the retry precondition).
  await act(async () => {
    holder.api.clearError();
  });
  expect(holder.api.error).toBeNull();
  await m.unmount();
}

async function assertUnavailableContext(
  useHook: (opts?: { width?: number; height?: number }) => WebcamApi,
) {
  removeMediaDevices();
  const { holder, m } = await mountHook(useHook);
  let returned: MediaStream | null = {} as MediaStream;
  await act(async () => {
    returned = await holder.api.start();
  });
  expect(returned).toBeNull();
  expect(holder.api.error?.kind).toBe('hardware');
  await m.unmount();
}

describe('use-webcam equivalence (task 10.2)', () => {
  for (const [label, useHook] of [
    ['promoted ui/media-vision/use-webcam', useWebcam],
  ] as const) {
    describe(label, () => {
      it('start → stop lifecycle acquires + releases the stream with the requested constraints', async () => {
        await assertStartStopLifecycle(useHook);
      });
      it('unmount releases every track (camera light off with the surface)', async () => {
        await assertUnmountReleasesCamera(useHook);
      });
      it('a getUserMedia denial surfaces a recoverable permission error, not a throw', async () => {
        await assertPermissionError(useHook);
      });
      it('an unavailable mediaDevices context surfaces a hardware error', async () => {
        await assertUnavailableContext(useHook);
      });
    });
  }
});
