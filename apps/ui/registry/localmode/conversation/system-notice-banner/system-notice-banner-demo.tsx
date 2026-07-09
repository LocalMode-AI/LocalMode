'use client';

/**
 * @file system-notice-banner-demo.tsx
 * @description Docs preview for `SystemNoticeBanner`. Shows the offline, WASM
 * fallback, and download-required notices inline in a chat surface.
 */
import { Button } from '@/registry/localmode/ui/button';
import { SystemNoticeBanner } from './system-notice-banner';

export default function SystemNoticeBannerDemo() {
  return (
    <div className="flex w-full max-w-xl flex-col gap-2">
      <SystemNoticeBanner kind="offline" onDismiss={() => {}} />
      <SystemNoticeBanner kind="fallback" />
      <SystemNoticeBanner
        kind="download-required"
        action={
          <Button type="button" size="xs">
            Download
          </Button>
        }
      />
    </div>
  );
}
