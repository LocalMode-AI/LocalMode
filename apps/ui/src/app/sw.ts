/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/**
 * Serwist service worker source. Compiled to public/sw.js by scripts/build-sw.mjs
 * (esbuild + @serwist/build injectManifest) as a postbuild step, then registered
 * at runtime by <SWRegistrar/>. Precaches the app shell + static assets; model
 * downloads (HuggingFace / MediaPipe / CDN GGUF/WASM) pass through NetworkOnly —
 * @localmode providers already persist model files in their own stores (Cache
 * Storage / IndexedDB / OPFS, depending on the provider), so the SW must not
 * shadow or double-store them. Uncached document navigations fall back to /offline.
 */
import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist, NetworkOnly } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/** Hosts that serve model weights / runtimes — never SW-cached (each provider owns its own persistent store). */
const MODEL_HOSTS = [
  'huggingface.co',
  'cdn-lfs.huggingface.co',
  'cdn-lfs-us-1.huggingface.co',
  'hf.co',
  'storage.googleapis.com', // MediaPipe .task/.tflite + wasm runtimes
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ url }) => MODEL_HOSTS.includes(url.hostname),
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher({ request }) {
          return request.destination === 'document';
        },
      },
    ],
  },
});

serwist.addEventListeners();
