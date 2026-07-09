/**
 * @file layout.tsx
 * @description Layout for the public `/blocks` gallery — wraps the block pages
 * in the shared site nav (HomeLayout) so they're navigable and consistent with
 * the rest of the site, adds the persistent left {@link BlocksSidebar} so
 * visitors can switch between blocks from any block page (hidden on the gallery
 * index and on mobile — the shells render a "Browse blocks" disclosure there),
 * and mounts the global devtools drawer host so every block page gets the
 * devtools toggle without per-block wiring. The host lazy-loads devtools code on
 * first open only.
 */
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import Script from 'next/script';
import type { ReactNode } from 'react';
import { baseOptions } from '@/lib/layout.shared';
import { BlocksSidebar } from '@/components/blocks-sidebar';
import { NetworkStatus } from '@/components/network-status';
import { DevToolsDrawerHost } from './devtools-drawer/host';

export default async function BlocksLayout({ children }: { children: ReactNode }) {
  return (
    <HomeLayout {...(await baseOptions())}>
      {/* Instruments fetch so the NetworkStatus pill can show live model-download
          activity. Model loads are user-triggered (long after this loads), so
          afterInteractive installs the patch in time — scoped to /blocks. */}
      <Script src="/network-monitor.js" strategy="afterInteractive" />
      {/* Constrain to the SAME container as the site header (fumadocs
          `--fd-layout-width`, 1400px) so the sidebar's left edge lines up with
          the header logo and nothing overhangs the header on wide viewports. */}
      <div className="mx-auto flex w-full max-w-[var(--fd-layout-width,1400px)]">
        <BlocksSidebar />
        <div className="min-w-0 flex-1">
          {/* Live on-device download/network activity — where models actually load. */}
          <div className="flex justify-end px-4 pt-3 sm:px-6">
            <NetworkStatus />
          </div>
          {children}
        </div>
      </div>
      <DevToolsDrawerHost />
    </HomeLayout>
  );
}
