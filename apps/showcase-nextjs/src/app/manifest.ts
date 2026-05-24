import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'LocalMode — Local-First AI Apps',
    short_name: 'LocalMode',
    description:
      'Complete AI suite running 100% locally in your browser. No servers, no API keys, data never leaves your device.',
    start_url: '/',
    display: 'standalone',
    background_color: '#09090b',
    theme_color: '#3b82f6',
    icons: [
      {
        src: '/icons/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
