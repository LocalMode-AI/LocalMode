/**
 * @file sw-registrar.tsx
 * @description Registers the Serwist service worker in production builds.
 */
'use client';

import { useEffect } from 'react';

export function SWRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js');
    }
  }, []);

  return null;
}
